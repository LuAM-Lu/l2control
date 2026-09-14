/**
 * Pruebas de la matriz de permisos — §7.3 (F2-05).
 *
 * §10.1 lo exige literalmente: **cada ❌ de la matriz tiene su prueba
 * negativa**. Una matriz sin pruebas negativas es una lista de intenciones —
 * lo que impide la escalada es que el 403 esté comprobado.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MATRIZ,
  SURFACE_ACTION,
  can,
  explainPermission,
  isAllowedOutright,
  isReachable,
  canAuthorize,
  visibleSurfaces,
  type Action,
  type Actor,
  type Role,
} from "./permissions.ts";

const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "CAJERO", "MESERO", "MONITOR_PARQUE", "COCINA"];

const actor = (role: Role, branchIds: string[] = ["b1"]): Actor => ({
  id: `u-${role}`,
  role,
  branchIds,
});

describe("deny by default", () => {
  test("una acción que no está en la matriz se deniega", () => {
    assert.equal(can(actor("ADMIN"), "accion.inventada" as Action), "DENEGADO");
  });

  test("TODA celda de la matriz tiene un valor explícito para los seis roles", () => {
    for (const [accion, fila] of Object.entries(MATRIZ)) {
      for (const rol of ROLES) {
        assert.ok(
          ["PERMITIDO", "REQUIERE_AUTORIZACION", "DENEGADO"].includes(fila[rol]),
          `falta ${rol} en ${accion}`,
        );
      }
    }
  });
});

describe("la sucursal es parte del permiso (H-07)", () => {
  test("un supervisor NO opera sobre una sucursal ajena, aunque su rol lo permita", () => {
    const supervisorA = actor("SUPERVISOR", ["b1"]);
    assert.equal(can(supervisorA, "turno.corteZ", { branchId: "b1" }), "PERMITIDO");
    assert.equal(can(supervisorA, "turno.corteZ", { branchId: "b2" }), "DENEGADO");
  });

  test("ni siquiera el administrador de otra sucursal", () => {
    // El rol no salta la frontera de sucursal: quien opera en varias, las
    // lleva declaradas.
    const adminB1 = actor("ADMIN", ["b1"]);
    assert.equal(can(adminB1, "catalogo.modificar", { branchId: "b2" }), "DENEGADO");

    const adminAmbas = actor("ADMIN", ["b1", "b2"]);
    assert.equal(can(adminAmbas, "catalogo.modificar", { branchId: "b2" }), "PERMITIDO");
  });

  test("sin contexto de sucursal se evalúa solo el rol", () => {
    assert.equal(can(actor("CAJERO"), "turno.abrir"), "PERMITIDO");
  });
});

describe("pruebas NEGATIVAS: cada ❌ de la matriz devuelve DENEGADO", () => {
  const denegados: [Role, Action][] = [
    ["MESERO", "turno.abrir"],
    ["MONITOR_PARQUE", "turno.corteX"],
    ["COCINA", "turno.corteZ"],
    ["MONITOR_PARQUE", "pedido.tomar"],
    ["COCINA", "pedido.anularEnProduccion"],
    ["MESERO", "cuenta.descuento"],
    ["MESERO", "cuenta.cortesia"],
    ["MESERO", "documento.emitir"],
    ["CAJERO", "documento.notaCredito"],
    ["MESERO", "documento.reimprimir"],
    ["CAJERO", "mesa.reabrir"],
    ["CAJERO", "kds.cambiarEstado"],
    ["MESERO", "parque.checkIn"],
    ["CAJERO", "parque.extenderSinCobro"],
    ["COCINA", "parque.vincularMesa"],
    ["CAJERO", "parque.verContacto"],
    ["CAJERO", "tasa.confirmar"],
    ["SUPERVISOR", "catalogo.modificar"],
    ["CAJERO", "inventario.ajustar"],
    ["MESERO", "reportes.verSucursal"],
    ["SUPERVISOR", "reportes.verTodas"],
    ["SUPERVISOR", "usuarios.gestionar"],
    ["SUPERVISOR", "camaras.ver"],
  ];

  for (const [rol, accion] of denegados) {
    test(`${rol} NO puede ${accion}`, () => {
      assert.equal(can(actor(rol), accion), "DENEGADO");
      assert.equal(isReachable(actor(rol), accion), false);
    });
  }
});

describe("las operaciones sensibles exigen autorización, no se deniegan", () => {
  const conAutorizacion: [Role, Action][] = [
    ["CAJERO", "turno.corteZ"],
    ["SUPERVISOR", "pedido.anularEnProduccion"],
    ["CAJERO", "cuenta.descuento"],
    ["SUPERVISOR", "documento.notaCredito"],
    ["MONITOR_PARQUE", "documento.reimprimir"],
    ["SUPERVISOR", "mesa.reabrir"],
    ["MONITOR_PARQUE", "parque.extenderSinCobro"],
    ["SUPERVISOR", "tasa.confirmar"],
    ["SUPERVISOR", "inventario.ajustar"],
  ];

  for (const [rol, accion] of conAutorizacion) {
    test(`${rol} puede ${accion} CON autorización`, () => {
      assert.equal(can(actor(rol), accion), "REQUIERE_AUTORIZACION");
      // Alcanzable, pero no sin pedir permiso: la distinción importa.
      assert.equal(isReachable(actor(rol), accion), true);
      assert.equal(isAllowedOutright(actor(rol), accion), false);
    });
  }
});

describe("quién autoriza un 🔐 (DEC-24)", () => {
  test("anular un cobro: la cajera lo pide, lo autoriza un supervisor o el administrador", () => {
    const cajera = actor("CAJERO");
    assert.equal(can(cajera, "cobro.anular"), "REQUIERE_AUTORIZACION");
    assert.equal(canAuthorize(actor("SUPERVISOR"), cajera, "cobro.anular"), true);
    assert.equal(canAuthorize(actor("ADMIN"), cajera, "cobro.anular"), true);
  });

  test("otra cajera, un mesero o la monitora no autorizan", () => {
    const cajera = actor("CAJERO");
    for (const rol of ["CAJERO", "MESERO", "MONITOR_PARQUE", "COCINA"] as Role[]) {
      assert.equal(canAuthorize({ ...actor(rol), id: "otra" }, cajera, "cobro.anular"), false, rol);
    }
  });

  test("lo que el solicitante no puede alcanzar, nadie se lo abre", () => {
    assert.equal(canAuthorize(actor("ADMIN"), actor("MESERO"), "cobro.anular"), false);
  });

  test("un supervisor sin la acción tampoco la autoriza", () => {
    const sinAnular = { ...actor("SUPERVISOR"), revokes: ["cobro.anular"] } as Actor;
    assert.equal(canAuthorize(sinAnular, actor("CAJERO"), "cobro.anular"), false);
  });

  test("la sucursal manda también para quien autoriza", () => {
    const supervisorB2 = actor("SUPERVISOR", ["b2"]);
    assert.equal(canAuthorize(supervisorB2, actor("CAJERO", ["b1"]), "cobro.anular", { branchId: "b1" }), false);
  });
});

describe("el administrador no necesita autorización para nada", () => {
  test("todas sus celdas son PERMITIDO", () => {
    for (const accion of Object.keys(MATRIZ) as Action[]) {
      assert.equal(can(actor("ADMIN"), accion), "PERMITIDO", `ADMIN falla en ${accion}`);
    }
  });
});

describe("superficies visibles por rol", () => {
  const ORDEN = [
    "monitor",
    "entrada",
    "salida",
    "caja",
    "turno",
    "mesas",
    "kds",
    "inventario",
    "reportes",
    "usuarios",
    "camaras",
  ] as const;

  test("la cocina solo ve el KDS", () => {
    assert.deepEqual([...visibleSurfaces(actor("COCINA"), ORDEN)], ["kds"]);
  });

  test("el monitor de parque ve lo suyo y la caja, pero no la cocina", () => {
    const v = visibleSurfaces(actor("MONITOR_PARQUE"), ORDEN);
    assert.ok(v.includes("monitor") && v.includes("entrada") && v.includes("salida"));
    assert.equal(v.includes("kds"), false);
    assert.equal(v.includes("usuarios"), false);
  });

  test("el mesero no ve caja ni turno", () => {
    const v = visibleSurfaces(actor("MESERO"), ORDEN);
    assert.equal(v.includes("caja"), false);
    assert.equal(v.includes("turno"), false);
    assert.ok(v.includes("mesas"));
  });

  test("el administrador las ve todas", () => {
    assert.equal(visibleSurfaces(actor("ADMIN"), ORDEN).length, ORDEN.length);
  });

  test("cada superficie tiene su acción declarada", () => {
    for (const s of ORDEN) {
      assert.ok(SURFACE_ACTION[s], `falta la acción de ${s}`);
    }
  });
});

describe("excepciones por persona (F2-11, DEC-15)", () => {
  test("una concesión da a una persona lo que su rol no da: la cajera que confirma la tasa", () => {
    // El ejemplo literal de §9.10.6.
    const marisol = { ...actor("CAJERO"), grants: { "tasa.confirmar": "PERMITIDO" } } as Actor;
    assert.equal(can(actor("CAJERO"), "tasa.confirmar"), "DENEGADO");
    assert.equal(can(marisol, "tasa.confirmar"), "PERMITIDO");
  });

  test("una revocación le quita a una persona lo que su rol sí da", () => {
    const luis = { ...actor("SUPERVISOR"), revokes: ["cuenta.descuento"] } as Actor;
    assert.equal(can(actor("SUPERVISOR"), "cuenta.descuento"), "REQUIERE_AUTORIZACION");
    assert.equal(can(luis, "cuenta.descuento"), "DENEGADO");
  });

  test("concedida y revocada a la vez: gana la revocación (fail-closed)", () => {
    const dudoso = {
      ...actor("CAJERO"),
      grants: { "tasa.confirmar": "PERMITIDO" },
      revokes: ["tasa.confirmar"],
    } as Actor;
    assert.equal(can(dudoso, "tasa.confirmar"), "DENEGADO");
  });

  test("la excepción NUNCA amplía la sucursal", () => {
    // Regla 2 de §9.10.6: la concesión vale en su sede y en ninguna otra.
    const marisol = {
      ...actor("CAJERO", ["b1"]),
      grants: { "tasa.confirmar": "PERMITIDO" },
    } as Actor;
    assert.equal(can(marisol, "tasa.confirmar", { branchId: "b1" }), "PERMITIDO");
    assert.equal(can(marisol, "tasa.confirmar", { branchId: "b2" }), "DENEGADO");
  });

  test("una concesión sobre una acción inexistente no la crea", () => {
    const raro = {
      ...actor("ADMIN"),
      grants: { "accion.inventada": "PERMITIDO" },
    } as unknown as Actor;
    assert.equal(can(raro, "accion.inventada" as Action), "DENEGADO");
  });

  test("PROPIEDAD: sin excepciones, cada celda es exactamente la de la matriz", () => {
    // Las excepciones no pueden alterar a quien no las tiene: listas vacías
    // deben comportarse igual que no tener el campo.
    for (const [accion, fila] of Object.entries(MATRIZ)) {
      for (const rol of ROLES) {
        const limpio = { ...actor(rol), grants: {}, revokes: [] } as Actor;
        assert.equal(can(limpio, accion as Action), fila[rol], `${rol} · ${accion}`);
      }
    }
  });

  test("la explicación distingue lo que viene del rol de lo que es excepción", () => {
    const marisol = {
      ...actor("CAJERO"),
      grants: { "tasa.confirmar": "PERMITIDO" },
      revokes: ["documento.reimprimir"],
    } as Actor;
    assert.deepEqual(
      { ...explainPermission(marisol, "tasa.confirmar") },
      { base: "DENEGADO", effective: "PERMITIDO", source: "CONCESION" },
    );
    assert.deepEqual(
      { ...explainPermission(marisol, "documento.reimprimir") },
      { base: "REQUIERE_AUTORIZACION", effective: "DENEGADO", source: "REVOCACION" },
    );
    assert.deepEqual(
      { ...explainPermission(marisol, "turno.abrir") },
      { base: "PERMITIDO", effective: "PERMITIDO", source: "ROL" },
    );
  });

  test("las superficies visibles también respetan las excepciones", () => {
    // Un mesero al que se le concede cobrar ve la caja; sin la concesión, no.
    const jesus = { ...actor("MESERO"), grants: { "documento.emitir": "PERMITIDO" } } as Actor;
    assert.deepEqual([...visibleSurfaces(actor("MESERO"), ["caja"])], []);
    assert.deepEqual([...visibleSurfaces(jesus, ["caja"])], ["caja"]);
  });
});
