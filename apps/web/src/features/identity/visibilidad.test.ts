/**
 * Cada sección del menú pide lo mismo que su servidor — T-13 (M-27, P-15).
 *
 * El cliente le dio a supervisión «todo el inventario» y no cambió nada: el menú colgaba Inventario de «ajustar» y el
 * alta de productos exigía `catalogo.modificar`, que no se regala. Esta prueba fija, sección por sección, qué acción
 * abre cada una (la misma que exige su caso de uso), y que un permiso dado por rol o por persona la abre de verdad.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Action, Actor, Role } from "@l2/domain-identity";
import { buscarModulo, buscarSeccion } from "../shell/navigation.ts";
import { puedeVerSeccion } from "./visibilidad.ts";

/** Lo que exige el servidor para trabajar en cada sección (basta una). */
const SERVIDOR: Readonly<Record<string, readonly Action[]>> = {
  "inventario/productos": ["inventario.catalogo", "inventario.entrada", "inventario.ajustar"],
  "inventario/entradas": ["inventario.entrada"],
  "inventario/salidas": ["inventario.ajustar"],
  "ajustes/usuarios": ["usuarios.gestionar"],
  "ajustes/accesos": ["usuarios.gestionar"],
  "ajustes/sistema": ["sistema.actualizar"],
  "ajustes/tasas": ["tasa.confirmar"],
  "ajustes/soporte": ["soporte.gestionar"],
};

const actor = (role: Role, extra: Partial<Actor> = {}): Actor => ({ id: "u1", role, branchIds: ["b1"], grants: {}, revokes: [], ...extra });
const ve = (a: Actor, ruta: string) => {
  const [m, s] = ruta.split("/");
  const modulo = buscarModulo(m!)!;
  return puedeVerSeccion(a, modulo, buscarSeccion(modulo, s!)!);
};

describe("cada sección pide lo que pide su servidor", () => {
  for (const [ruta, acciones] of Object.entries(SERVIDOR)) {
    test(ruta, () => {
      const [m, s] = ruta.split("/");
      const modulo = buscarModulo(m!);
      assert.ok(modulo, `no existe el módulo ${m}`);
      const seccion = buscarSeccion(modulo, s!);
      assert.ok(seccion, `no existe la sección ${ruta}`);
      const delMenu = seccion.acciones ?? [seccion.accion ?? modulo.accion];
      assert.deepEqual([...delMenu].sort(), [...acciones].sort());
    });
  }
});

describe("un permiso dado abre su sección (T-13)", () => {
  test("supervisión, con «dar de alta productos» ajustado a su rol, ve Productos y Entradas", () => {
    const supervision = actor("SUPERVISOR", { roleAdjustments: { "inventario.catalogo": "PERMITIDO" } });
    assert.equal(ve(supervision, "inventario/productos"), true);
    assert.equal(ve(supervision, "inventario/entradas"), true);
  });

  test("la caja, con «cargar entradas» concedido a la persona, ve Entradas y Productos, no Salidas", () => {
    const caja = actor("CAJERO", { grants: { "inventario.entrada": "PERMITIDO" } });
    assert.equal(ve(caja, "inventario/entradas"), true);
    assert.equal(ve(caja, "inventario/productos"), true);
    assert.equal(ve(caja, "inventario/salidas"), false);
  });

  test("sin nada de inventario, ninguna sección de inventario", () => {
    const mesero = actor("MESERO");
    for (const ruta of ["inventario/productos", "inventario/entradas", "inventario/salidas"]) assert.equal(ve(mesero, ruta), false, ruta);
  });

  test("una revocación cierra lo que el rol daba", () => {
    const supervision = actor("SUPERVISOR", { revokes: ["inventario.entrada", "inventario.ajustar"] });
    assert.equal(ve(supervision, "inventario/entradas"), false);
    assert.equal(ve(supervision, "inventario/productos"), false);
  });
});
