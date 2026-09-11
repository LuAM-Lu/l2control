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
  PermissionExceptionCommandSchema,
  PermissionExceptionSchema,
  UserSummarySchema,
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
