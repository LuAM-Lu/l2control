/**
 * La ayuda al día — T-26 (M-40).
 *
 * El criterio: cada cosa nueva del bloque se encuentra buscándola en la ayuda de su pantalla. Y cada sección del menú tiene
 * su propia entrada (no cae en la general de su módulo), cada pestaña que la pide la suya, y quien ya vio un recorrido
 * recibe solo lo nuevo.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MODULOS } from "../shell/navigation.ts";
import { MANUAL, buscar, entradaDe } from "./manual.ts";
import { RECORRIDOS, pasosNuevos } from "./recorridos.ts";

describe("la ayuda al día (T-26)", () => {
  test("cada sección del menú tiene su entrada, no la general de su módulo", () => {
    for (const m of MODULOS) {
      for (const s of m.secciones) {
        if (!s.href) continue;
        const e = entradaDe(String(s.href));
        assert.ok(e, `${m.id}/${s.id}: sin entrada`);
        assert.notEqual(e.ruta, `/panel/${m.id}`, `${m.id}/${s.id}: cae en la general de ${m.nombre}`);
      }
    }
  });

  test("una pestaña o una vista con su entrada gana sobre la de su sección", () => {
    assert.equal(entradaDe("/panel/ajustes/sistema")?.id, "sistema");
    assert.equal(entradaDe("/panel/ajustes/sistema?pestana=respaldos")?.id, "respaldos");
    assert.equal(entradaDe("/panel/ajustes/sistema?pestana=semilla")?.id, "semilla");
    assert.equal(entradaDe("/panel/ajustes/tasas?pestana=feriados")?.id, "feriados");
    assert.equal(entradaDe("/panel/inventario/productos?pestana=carta")?.id, "carta");
    assert.equal(entradaDe("/deudas")?.id, "deudas");
    assert.equal(entradaDe("/deudas?vista=personal")?.id, "personal");
    // Otra pestaña sin entrada propia: la de su sección.
    assert.equal(entradaDe("/panel/ajustes/personas?pestana=dispositivos")?.id, "personas");
  });

  test("lo nuevo del bloque se encuentra buscándolo, en la ayuda de su pantalla", () => {
    const en = (texto: string) => buscar(texto).map((r) => r.entrada.id);
    for (const [texto, pantalla] of [
      ["Falta la cédula", "mesas"],
      ["Anulación pedida", "caja"],
      ["La caja sigue abierta", "caja"],
      ["La caja sigue abierta", "inicio"],
      ["Lo más pedido hoy", "mesas"],
      ["Pagar lo que va", "mesas"],
      ["Abrir otra cuenta en esta mesa", "mesas"],
      ["Esa cuenta ya no está abierta", "mesas"],
      ["Traer a la caja y cobrar", "caja"],
      ["Pedir a administración", "caja"],
      ["no baja los respaldos", "turno"],
      ["no baja los respaldos", "respaldos"],
      ["Juntar a la misma persona", "clientes"],
      ["retirar un niño", "clientes"],
      ["Cierre del parque", "cierre-del-parque"],
      ["De un vistazo", "reporte-parque"],
      ["Hora de cierre del local", "sucursal"],
      ["Más rápido", "sucursal"],
    ] as const) {
      assert.ok(en(texto).includes(pantalla), `«${texto}» no lleva a ${pantalla}: ${en(texto).join(", ")}`);
    }
  });

  test("el manual no repite pantallas", () => {
    const rutas = MANUAL.map((e) => e.ruta);
    assert.equal(new Set(rutas).size, rutas.length, "dos entradas con la misma ruta");
    const ids = MANUAL.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, "dos entradas con el mismo id");
  });

  test("quien ya vio un recorrido recibe solo lo nuevo", () => {
    const mesas = RECORRIDOS.find((r) => r.id === "mesas")!;
    assert.equal(pasosNuevos(mesas, new Set()), null, "la primera vez, entero");
    assert.deepEqual(pasosNuevos(mesas, new Set(["mesas@4"]))?.map((p) => p.titulo), ["Lo que se hace con la mesa"]);
    assert.equal(pasosNuevos(mesas, new Set(["mesas@5"])), null, "ya vio esta");
    const parque = RECORRIDOS.find((r) => r.id === "parque")!;
    assert.deepEqual(pasosNuevos(parque, new Set(["parque@1"]))?.map((p) => p.titulo), ["El cierre del parque"]);
  });
});
