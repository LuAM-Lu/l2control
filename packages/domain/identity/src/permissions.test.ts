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
  isAllowedOutright,
  isReachable,
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
