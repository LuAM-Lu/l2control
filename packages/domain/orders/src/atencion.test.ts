/** El tiempo de atención en el salón — B6-8 (M-27, P-19, D-SERV). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { atencionDeCuentas, resumenDeEspera, type PedidoParaAtencion } from "./atencion.ts";

const MIN = 60_000;
const T0 = Date.parse("2026-10-08T18:00:00.000Z");
const UMBRALES = { sinPedirMin: 15, esperaMin: 20 };
const pedido = (cuentaId: string, enviadoMin: number, servidoMin: number | null = null, anulado = false): PedidoParaAtencion => ({
  cuentaId,
  enviadoEn: T0 + enviadoMin * MIN,
  servidoEn: servidoMin === null ? null : T0 + servidoMin * MIN,
  anulado,
});

test("sentada, sin pedir y esperando, en minutos; el pedido sin servir más viejo es el que manda", () => {
  const [a] = atencionDeCuentas([{ id: "a", abiertaEn: T0 }], [pedido("a", 5, 12), pedido("a", 10), pedido("a", 30)], T0 + 40 * MIN, UMBRALES);
  assert.deepEqual(a, { cuentaId: "a", sentadaMin: 40, sinPedirMin: null, esperandoMin: 30, pedidosSinServir: 2, alerta: "ESPERANDO" });
});

test("sin ningún pedido cuenta desde que se sentó, y avisa al pasar su umbral", () => {
  const filas = atencionDeCuentas([{ id: "nueva", abiertaEn: T0 + 30 * MIN }, { id: "vieja", abiertaEn: T0 }], [], T0 + 40 * MIN, UMBRALES);
  assert.deepEqual(filas.map((f) => [f.cuentaId, f.sinPedirMin, f.alerta]), [["vieja", 40, "SIN_PEDIR"], ["nueva", 10, null]]);
});

test("lo servido y lo anulado no esperan; esperar lo pedido va antes que no haber pedido", () => {
  const filas = atencionDeCuentas(
    [{ id: "servida", abiertaEn: T0 }, { id: "anulada", abiertaEn: T0 }, { id: "esperando", abiertaEn: T0 + 20 * MIN }, { id: "sin", abiertaEn: T0 }],
    [pedido("servida", 2, 10), pedido("anulada", 2, null, true), pedido("esperando", 21)],
    T0 + 45 * MIN,
    UMBRALES,
  );
  assert.deepEqual(filas.map((f) => [f.cuentaId, f.alerta]), [["esperando", "ESPERANDO"], ["anulada", "SIN_PEDIR"], ["sin", "SIN_PEDIR"], ["servida", null]]);
  assert.equal(filas.find((f) => f.cuentaId === "servida")?.esperandoMin, null);
});

test("el resumen del día: la espera media y máxima de lo servido, y cuántos siguen sin servir", () => {
  const r = resumenDeEspera([pedido("a", 0, 10), pedido("a", 5, 25), pedido("b", 10), pedido("c", 0, 1, true)]);
  assert.deepEqual(r, { servidos: 2, mediaMin: 15, maximaMin: 20, sinServir: 1 });
  assert.deepEqual(resumenDeEspera([]), { servidos: 0, mediaMin: null, maximaMin: null, sinServir: 0 });
});
