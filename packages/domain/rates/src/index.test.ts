/**
 * Pruebas del módulo de tasas — §5.2, ADR-005.
 *
 * Se prueba lo que impide: cobrar sin tasa confirmada, usar la de ayer como si
 * fuera la de hoy, perder decimales al convertir y confirmar un salto enorme
 * sin que nadie lo mire dos veces.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { convert, invertRate, money, toMajor } from "@l2/domain-money";

import {
  InvalidRateError,
  addDays,
  calendarDay,
  currenciesOf,
  currentRate,
  rateOfDay,
  frozenRateOf,
  needsDoubleCheck,
  variationBasisPoints,
  type RateRecord,
} from "./index.ts";

const tasa = (p: Partial<RateRecord> & Pick<RateRecord, "id" | "value" | "capturedAt">): RateRecord => ({
  pair: "USD/VES",
  source: "BCV",
  confirmed: true,
  effectiveDate: p.capturedAt.slice(0, 10),
  ...p,
});

describe("la fracción con la que se convierte (ADR-005)", () => {
  test("228,41 Bs por dólar convierte 228,41 Bs en 1,00 $", () => {
    const r = frozenRateOf({ pair: "USD/VES", value: "228.41" });
    assert.equal(r.from, "VES");
    assert.equal(r.to, "USD");
    assert.equal(toMajor(convert(money(22841n, "VES"), r)), "1.00");
  });

  test("y al revés: 1,00 $ son 228,41 Bs", () => {
    const r = invertRate(frozenRateOf({ pair: "USD/VES", value: "228.41" }));
    assert.equal(toMajor(convert(money(100n, "USD"), r)), "228.41");
  });

  test("una tasa con ocho decimales no se redondea al construirla", () => {
    const r = frozenRateOf({ pair: "USD/VES", value: "228.41520000" });
    // 100 $ · 228,4152 = 22.841,52 Bs, al céntimo.
    assert.equal(toMajor(convert(money(10000n, "USD"), invertRate(r))), "22841.52");
  });

  test("la fracción se guarda reducida: «228.410000» y «228.41» son la misma", () => {
    const a = frozenRateOf({ pair: "USD/VES", value: "228.41" });
    const b = frozenRateOf({ pair: "USD/VES", value: "228.410000" });
    assert.deepEqual({ ...a }, { ...b });
  });

  test("el USDT cotiza contra el bolívar, no contra el dólar", () => {
    assert.deepEqual({ ...currenciesOf("USDT/VES") }, { base: "USDT", quote: "VES" });
  });

  test("una tasa cero o con letras no se construye (§5.2: CHECK value > 0)", () => {
    assert.throws(() => frozenRateOf({ pair: "USD/VES", value: "0" }), InvalidRateError);
    assert.throws(() => frozenRateOf({ pair: "USD/VES", value: "0.000" }), InvalidRateError);
    assert.throws(() => frozenRateOf({ pair: "USD/VES", value: "228,41" }), InvalidRateError);
    assert.throws(() => frozenRateOf({ pair: "USD/VES", value: "-5" }), InvalidRateError);
  });
});

describe("cuál es la tasa vigente (fail-closed)", () => {
  const ayer = tasa({ id: "r1", value: "220.00", capturedAt: "2026-09-17T12:00:00.000Z" });
  const hoy = tasa({ id: "r2", value: "228.41", capturedAt: "2026-09-18T12:00:00.000Z" });
  const ahora = "2026-09-18T18:00:00.000Z";

  test("es la última confirmada", () => {
    assert.equal(currentRate([ayer, hoy], "USD/VES", ahora)?.id, "r2");
  });

  test("el orden de la lista no decide: decide cuándo se capturó", () => {
    assert.equal(currentRate([hoy, ayer], "USD/VES", ahora)?.id, "r2");
  });

  test("una tasa sin confirmar no está vigente, aunque sea la más nueva", () => {
    const pendiente = tasa({ id: "r3", value: "231.00", capturedAt: "2026-09-18T17:00:00.000Z", confirmed: false });
    assert.equal(currentRate([ayer, hoy, pendiente], "USD/VES", ahora)?.id, "r2");
  });

  test("una tasa capturada para mañana no está vigente hoy", () => {
    const manana = tasa({ id: "r4", value: "240.00", capturedAt: "2026-09-19T08:00:00.000Z" });
    assert.equal(currentRate([hoy, manana], "USD/VES", ahora)?.id, "r2");
  });

  test("cada par tiene la suya: el USDT no hereda la del dólar", () => {
    assert.equal(currentRate([hoy], "USDT/VES", ahora), null);
  });

  test("sin ninguna confirmada devuelve null, y eso bloquea el cobro", () => {
    const sola = tasa({ id: "r5", value: "228.41", capturedAt: ahora, confirmed: false });
    assert.equal(currentRate([sola], "USD/VES", ahora), null);
    assert.equal(currentRate([], "USD/VES", ahora), null);
  });

  test("actualizar la tasa no cambia lo que estaba vigente ayer (F3-03)", () => {
    const historial = [ayer, hoy];
    assert.equal(currentRate(historial, "USD/VES", "2026-09-17T20:00:00.000Z")?.id, "r1");
    assert.equal(currentRate(historial, "USD/VES", ahora)?.id, "r2");
  });
});

describe("la tasa del día: con la que se cobra (F3-05)", () => {
  const ayer = tasa({ id: "r1", value: "220.00", capturedAt: "2026-09-17T12:00:00.000Z" });
  const ahora = "2026-09-18T14:00:00.000Z";

  test("la de ayer no sirve hoy aunque sea la última confirmada: se bloquea", () => {
    assert.equal(currentRate([ayer], "USD/VES", ahora)?.id, "r1");
    assert.equal(rateOfDay([ayer], "USD/VES", "2026-09-18", ahora), null);
  });

  test("la de hoy, confirmada, es la que se usa", () => {
    const hoy = tasa({ id: "r2", value: "228.41", capturedAt: "2026-09-18T12:00:00.000Z" });
    assert.equal(rateOfDay([ayer, hoy], "USD/VES", "2026-09-18", ahora)?.id, "r2");
  });

  test("la de hoy sin confirmar no sirve todavía", () => {
    const pendiente = tasa({ id: "r2", value: "228.41", capturedAt: "2026-09-18T12:00:00.000Z", confirmed: false });
    assert.equal(rateOfDay([ayer, pendiente], "USD/VES", "2026-09-18", ahora), null);
  });

  test("la del lunes, capturada y confirmada el viernes, vale el lunes y no el viernes", () => {
    const lunes = tasa({
      id: "r3",
      value: "230.00",
      capturedAt: "2026-09-18T20:00:00.000Z",
      effectiveDate: "2026-09-21",
    });
    assert.equal(rateOfDay([lunes], "USD/VES", "2026-09-18", "2026-09-18T21:00:00.000Z"), null);
    assert.equal(rateOfDay([lunes], "USD/VES", "2026-09-21", "2026-09-21T12:00:00.000Z")?.id, "r3");
  });

  test("corregir es capturar otra: de dos confirmadas del mismo día gana la más nueva", () => {
    const mala = tasa({ id: "r4", value: "2284.10", capturedAt: "2026-09-18T12:00:00.000Z" });
    const buena = tasa({ id: "r5", value: "228.41", capturedAt: "2026-09-18T12:05:00.000Z" });
    assert.equal(rateOfDay([buena, mala], "USD/VES", "2026-09-18", ahora)?.id, "r5");
  });

  test("un día mal escrito se rechaza: no se adivina", () => {
    assert.throws(() => rateOfDay([ayer], "USD/VES", "18/09/2026", ahora), InvalidRateError);
  });

  test("el día de calendario es el del local, no el de UTC", () => {
    // 01:30 en UTC del 19 son las 21:30 del 18 en Caracas (UTC−4).
    assert.equal(calendarDay("2026-09-19T01:30:00.000Z", "America/Caracas"), "2026-09-18");
    assert.equal(calendarDay("2026-09-19T04:30:00.000Z", "America/Caracas"), "2026-09-19");
  });

  test("sumar días cruza meses y años", () => {
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-10-01", -1), "2026-09-30");
  });
});

describe("el límite de cordura (§5.2, amenaza T2)", () => {
  test("de 220 a 228,41 son 382 puntos básicos", () => {
    assert.equal(variationBasisPoints("220.00", "228.41"), 382n);
  });

  test("la misma tasa escrita con más ceros no varía nada", () => {
    assert.equal(variationBasisPoints("228.41", "228.410000"), 0n);
  });

  test("da igual si sube o si baja: lo que importa es el tamaño del salto", () => {
    assert.equal(variationBasisPoints("200.00", "220.00"), variationBasisPoints("200.00", "180.00"));
  });

  test("un salto pequeño se confirma de una vez; uno grande, dos", () => {
    const anterior = tasa({ id: "r1", value: "228.41", capturedAt: "2026-09-18T12:00:00.000Z" });
    assert.equal(needsDoubleCheck(anterior, { value: "230.00" }, 1000), false);
    // Un dedo de más en el teclado: 2.284,10 en vez de 228,41.
    assert.equal(needsDoubleCheck(anterior, { value: "2284.10" }, 1000), true);
  });

  test("la primera tasa del local se verifica dos veces: no hay con qué compararla", () => {
    assert.equal(needsDoubleCheck(null, { value: "228.41" }, 1000), true);
  });

  test("un umbral que no es un número de puntos básicos positivo se rechaza", () => {
    const anterior = tasa({ id: "r1", value: "228.41", capturedAt: "2026-09-18T12:00:00.000Z" });
    assert.throws(() => needsDoubleCheck(anterior, { value: "230.00" }, 0), InvalidRateError);
    assert.throws(() => needsDoubleCheck(anterior, { value: "230.00" }, -5), InvalidRateError);
  });
});
