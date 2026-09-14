/**
 * Pruebas del ciclo de vida de la comanda — F6-08, §6.5.
 * Cada salto imposible tiene su prueba negativa.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  UmbralInvalidoError,
  anulacionRequiereConfirmacion,
  nivelEspera,
  transicionar,
  type EstadoComanda,
  type Transicion,
} from "./index.ts";

const va = (de: EstadoComanda, t: Transicion) => transicionar(de, t);

describe("máquina de estados de la comanda (F6-08)", () => {
  test("el camino feliz: en cola → preparación → lista → entregada", () => {
    let r = va("ENVIADO", "ACEPTAR");
    assert.deepEqual(r, { ok: true, estado: "EN_PREPARACION", requiereReversion: false });
    r = va("EN_PREPARACION", "MARCAR_LISTO");
    assert.equal(r.ok && r.estado, "LISTO");
    r = va("LISTO", "ENTREGAR");
    assert.equal(r.ok && r.estado, "ENTREGADO");
  });

  test("un plato rápido puede salir listo sin haberse aceptado", () => {
    const r = va("ENVIADO", "MARCAR_LISTO");
    assert.equal(r.ok && r.estado, "LISTO");
  });

  test("no se retrocede: un «aceptado» tardío sobre una comanda lista se rechaza", () => {
    const r = va("LISTO", "ACEPTAR");
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.motivo : "", /lista/);
  });

  test("no se sirve lo que no está listo", () => {
    assert.equal(va("ENVIADO", "ENTREGAR").ok, false);
    assert.equal(va("EN_PREPARACION", "ENTREGAR").ok, false);
  });

  test("lo entregado no vuelve a cocina", () => {
    assert.equal(va("ENTREGADO", "ACEPTAR").ok, false);
    assert.equal(va("ENTREGADO", "MARCAR_LISTO").ok, false);
    assert.equal(va("ENTREGADO", "ENTREGAR").ok, false);
  });

  test("anular es posible desde cualquier estado vivo, y ANULADO es final", () => {
    for (const e of ["ENVIADO", "EN_PREPARACION", "LISTO", "ENTREGADO"] as const) {
      assert.equal(va(e, "ANULAR").ok, true, e);
    }
    for (const t of ["ACEPTAR", "MARCAR_LISTO", "ENTREGAR", "ANULAR"] as const) {
      assert.equal(va("ANULADO", t).ok, false, t);
    }
  });

  test("anular después de LISTO exige revertir inventario; antes, no", () => {
    const antes = va("EN_PREPARACION", "ANULAR");
    const despues = va("LISTO", "ANULAR");
    assert.equal(antes.ok && antes.requiereReversion, false);
    assert.equal(despues.ok && despues.requiereReversion, true);
  });

  test("la cocina confirma la anulación solo si ya la tenía en sus manos", () => {
    assert.equal(anulacionRequiereConfirmacion("ENVIADO"), false);
    assert.equal(anulacionRequiereConfirmacion("EN_PREPARACION"), true);
    assert.equal(anulacionRequiereConfirmacion("LISTO"), true);
  });
});

describe("espera en cocina (§8.5)", () => {
  const umbral = { avisoMin: 10, gritaMin: 15 };
  test("a tiempo, tarda y atrasada según el umbral", () => {
    assert.equal(nivelEspera(9 * 60_000, umbral), "A_TIEMPO");
    assert.equal(nivelEspera(10 * 60_000, umbral), "TARDA");
    assert.equal(nivelEspera(15 * 60_000, umbral), "ATRASADA");
  });
  test("un reloj desfasado no da espera negativa", () => {
    assert.equal(nivelEspera(-5_000, umbral), "A_TIEMPO");
  });
  test("un umbral incoherente se rechaza, no se interpreta", () => {
    assert.throws(() => nivelEspera(0, { avisoMin: 15, gritaMin: 10 }), UmbralInvalidoError);
    assert.throws(() => nivelEspera(0, { avisoMin: 0, gritaMin: 10 }), UmbralInvalidoError);
  });
});
