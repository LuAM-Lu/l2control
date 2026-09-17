/**
 * Pruebas de los contratos de identidad — F2-11.
 *
 * Lo que se prueba es lo que el contrato impide, porque es lo que protege la
 * auditoría: una excepción sin motivo, una que nombre una sucursal, o un
 * cliente que intente declarar quién hizo el cambio.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  BranchAccessSchema,
  RoleAdjustmentCommandSchema,
  UserChangeSchema,
  UserCommandSchema,
  PermissionExceptionCommandSchema,
  PermissionExceptionSchema,
  UserSummarySchema,
  DeviceSchema,
  DevicesDirectorySchema,
  DeviceCommandSchema,
} from "./identity.ts";

const concesion = {
  effect: "GRANT",
  action: "tasa.confirmar",
  permission: "PERMITIDO",
  grantedBy: "u-abigail",
  grantedByName: "Abigail Karam",
  reason: "Abre el local los sábados antes de que llegue la supervisión.",
  at: "2026-09-05T12:30:00.000Z",
} as const;

const persona = {
  id: "u-marisol",
  fullName: "Marisol Prieto",
  role: "CAJERO",
  branchIds: ["b1"],
  active: true,
  exceptions: [concesion],
} as const;

describe("excepción registrada", () => {
  test("una concesión con motivo es válida", () => {
    assert.equal(PermissionExceptionSchema.safeParse(concesion).success, true);
  });

  test("sin motivo con contenido no hay excepción: la auditoría exige el porqué", () => {
    const r = PermissionExceptionSchema.safeParse({ ...concesion, reason: "ok" });
    assert.equal(r.success, false);
  });

  test("una concesión tiene que decir qué nivel da", () => {
    const { permission: _p, ...sinNivel } = concesion;
    assert.equal(PermissionExceptionSchema.safeParse(sinNivel).success, false);
  });

  test("conceder «DENEGADO» no es una concesión: para eso está la revocación", () => {
    const r = PermissionExceptionSchema.safeParse({ ...concesion, permission: "DENEGADO" });
    assert.equal(r.success, false);
  });

  test("una revocación no lleva nivel", () => {
    const r = PermissionExceptionSchema.safeParse({ ...concesion, effect: "REVOKE" });
    assert.equal(r.success, false);
  });

  test("una excepción NO puede nombrar una sucursal: no puede ampliarla", () => {
    const r = PermissionExceptionSchema.safeParse({ ...concesion, branchId: "b2" });
    assert.equal(r.success, false);
  });
});

describe("persona", () => {
  test("una persona con su rol y sus excepciones es válida", () => {
    assert.equal(UserSummarySchema.safeParse(persona).success, true);
  });

  test("dos excepciones sobre la misma acción se rechazan", () => {
    const revocacion = {
      effect: "REVOKE",
      action: "tasa.confirmar",
      grantedBy: "u-abigail",
      grantedByName: "Abigail Karam",
      reason: "Se revisa el procedimiento de apertura de los sábados.",
      at: "2026-09-06T12:30:00.000Z",
    };
    const r = UserSummarySchema.safeParse({ ...persona, exceptions: [concesion, revocacion] });
    assert.equal(r.success, false);
  });

  test("toda persona pertenece al menos a una sucursal", () => {
    assert.equal(UserSummarySchema.safeParse({ ...persona, branchIds: [] }).success, false);
  });
});

describe("comando para conceder o revocar", () => {
  const comando = {
    effect: "GRANT",
    userId: "u-marisol",
    action: "tasa.confirmar",
    permission: "PERMITIDO",
    reason: "Abre el local los sábados antes de que llegue la supervisión.",
  } as const;

  test("un comando con motivo es válido", () => {
    assert.equal(PermissionExceptionCommandSchema.safeParse(comando).success, true);
  });

  test("el cliente no puede declarar quién hizo el cambio ni cuándo", () => {
    // Si pudiera, podría atribuirle la concesión a otra persona.
    assert.equal(
      PermissionExceptionCommandSchema.safeParse({ ...comando, grantedBy: "u-otro" }).success,
      false,
    );
    assert.equal(
      PermissionExceptionCommandSchema.safeParse({ ...comando, at: "2026-01-01T00:00:00.000Z" })
        .success,
      false,
    );
  });

  test("sin acción elegida el comando se rechaza con un mensaje para la persona", () => {
    const r = PermissionExceptionCommandSchema.safeParse({ ...comando, action: "" });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(r.error.issues[0]?.message, "Elige una acción");
  });
});

describe("cambios sobre una persona (F2-11)", () => {
  const alta = {
    kind: "ALTA",
    fullName: "Rosa Medina",
    role: "MESERO",
    branchIds: ["b1"],
    reason: "Entra al equipo de sala para los fines de semana de temporada alta.",
  } as const;

  test("dar de alta con nombre, rol, sucursal y motivo es válido", () => {
    assert.equal(UserCommandSchema.safeParse(alta).success, true);
  });

  test("los cinco cambios exigen motivo con contenido, también reponer el PIN", () => {
    for (const c of [
      { kind: "BAJA", userId: "u-mari" },
      { kind: "REINGRESO", userId: "u-carla" },
      { kind: "ROL", userId: "u-mari", role: "SUPERVISOR" },
      { kind: "PIN", userId: "u-mari" },
    ]) {
      assert.equal(UserCommandSchema.safeParse({ ...c, reason: "ok" }).success, false, c.kind);
      assert.equal(
        UserCommandSchema.safeParse({ ...c, reason: "Lo pidió la administración por escrito." })
          .success,
        true,
        c.kind,
      );
    }
  });

  test("el cliente no declara autor ni hora: los pone el servidor", () => {
    assert.equal(UserCommandSchema.safeParse({ ...alta, by: "u-otra" }).success, false);
    assert.equal(UserCommandSchema.safeParse({ ...alta, at: "2026-01-01T00:00:00.000Z" }).success, false);
  });

  test("nadie entra sin sucursal ni con un rol inventado", () => {
    assert.equal(UserCommandSchema.safeParse({ ...alta, branchIds: [] }).success, false);
    assert.equal(UserCommandSchema.safeParse({ ...alta, role: "DUENO" }).success, false);
  });

  test("un cambio de rol guarda de dónde venía: es lo que responde «quién podía cobrar entonces»", () => {
    const cambio = {
      kind: "ROL",
      from: "CAJERO",
      to: "SUPERVISOR",
      by: "u-abigail",
      byName: "Abigail Karam",
      reason: "Asume la supervisión de los sábados desde este mes.",
      at: "2026-09-14T14:00:00.000Z",
    };
    assert.equal(UserChangeSchema.safeParse(cambio).success, true);
    const { from: _sin, ...sinOrigen } = cambio;
    assert.equal(UserChangeSchema.safeParse(sinOrigen).success, false);
  });

  test("una persona sin historia es válida: «changes» empieza vacío", () => {
    const r = UserSummarySchema.safeParse(persona);
    assert.equal(r.success, true);
    if (r.success) assert.deepEqual(r.data.changes, []);
  });
});

describe("ajustes de la sucursal sobre un rol (N-05)", () => {
  const ajuste = {
    role: "CAJERO",
    action: "reportes.verSucursal",
    permission: "PERMITIDO",
    by: "u-abigail",
    byName: "Abigail Karam",
    reason: "La caja cierra el local los domingos y necesita ver el resumen del día.",
    at: "2026-09-14T18:00:00.000Z",
  } as const;

  test("un ajuste con motivo, autor y hora es válido", () => {
    assert.equal(BranchAccessSchema.safeParse({ branchId: "b1", adjustments: [ajuste] }).success, true);
  });

  test("una sucursal sin ajustes es válida y empieza vacía", () => {
    const r = BranchAccessSchema.safeParse({ branchId: "b1" });
    assert.equal(r.success, true);
    if (r.success) assert.deepEqual(r.data.adjustments, []);
  });

  test("dos ajustes sobre la misma celda no dicen cuál vale", () => {
    const otro = { ...ajuste, permission: "REQUIERE_AUTORIZACION" } as const;
    assert.equal(
      BranchAccessSchema.safeParse({ branchId: "b1", adjustments: [ajuste, otro] }).success,
      false,
    );
    // La misma acción para OTRO rol sí: son celdas distintas.
    assert.equal(
      BranchAccessSchema.safeParse({
        branchId: "b1",
        adjustments: [ajuste, { ...ajuste, role: "MESERO" }],
      }).success,
      true,
    );
  });

  test("ajustar y retirar exigen motivo; el cliente no declara autor ni hora", () => {
    const mandar = {
      kind: "AJUSTAR",
      branchId: "b1",
      role: "CAJERO",
      action: "reportes.verSucursal",
      permission: "PERMITIDO",
      reason: "La caja cierra el local los domingos y ve el resumen del día.",
    } as const;
    assert.equal(RoleAdjustmentCommandSchema.safeParse(mandar).success, true);
    assert.equal(RoleAdjustmentCommandSchema.safeParse({ ...mandar, reason: "ok" }).success, false);
    assert.equal(RoleAdjustmentCommandSchema.safeParse({ ...mandar, by: "u-otra" }).success, false);

    const retirar = { kind: "RETIRAR", branchId: "b1", role: "CAJERO", action: "reportes.verSucursal" };
    assert.equal(RoleAdjustmentCommandSchema.safeParse(retirar).success, false);
    assert.equal(
      RoleAdjustmentCommandSchema.safeParse({
        ...retirar,
        reason: "Se vuelve a lo que dice la matriz: ya no cierra ella.",
      }).success,
      true,
    );
  });
});

describe("dispositivos (F2-02, ADR-013)", () => {
  const AYER = "2026-09-16T12:00:00.000Z";
  const tablet = {
    id: "d1",
    label: "Tablet taquilla",
    branchId: "b1",
    status: "APROBADO",
    registeredAt: AYER,
  };

  test("un equipo aprobado, sin sesión y sin historia, es válido", () => {
    const d = DeviceSchema.parse(tablet);
    assert.deepEqual(d.changes, []);
    assert.equal(d.session, undefined);
  });

  test("dos equipos no pueden llamarse igual: «revoca la tablet» dejaría de ser una orden", () => {
    const r = DevicesDirectorySchema.safeParse({
      devices: [tablet, { ...tablet, id: "d2", label: "tablet TAQUILLA" }],
    });
    assert.equal(r.success, false);
  });

  test("revocar exige motivo con contenido", () => {
    assert.equal(
      DeviceCommandSchema.safeParse({ kind: "REVOCAR", deviceId: "d1", reason: "x" }).success,
      false,
    );
    assert.ok(
      DeviceCommandSchema.safeParse({
        kind: "REVOCAR",
        deviceId: "d1",
        reason: "La tablet se extravió en la mudanza del salón.",
      }).success,
    );
  });

  test("el cliente no puede firmar por otro: el mando no admite autor ni hora", () => {
    const r = DeviceCommandSchema.safeParse({
      kind: "APROBAR",
      deviceId: "d1",
      reason: "Equipo nuevo del mostrador, verificado con la administración.",
      by: "u-marisol",
      at: AYER,
    });
    assert.equal(r.success, false);
  });
});
