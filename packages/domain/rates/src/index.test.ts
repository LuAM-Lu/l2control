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
  rateAsShown,
  typedRateMatches,
  InvalidRateError,
  addDays,
  autoApplyDecision,
  heldRates,
  isBusinessDay,
  missingNextBusinessDayRate,
  nextBusinessDay,
  calendarDay,
  coversDay,
  holidayProblem,
  startOfDay,
  currenciesOf,
  currentRate,
  rateOfDay,
  citedRateValid,
  COBRO_GRACE_MS,
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

  test("la de ayer no sirve hoy aunque sea la última confirmada: se bloquea (jueves → viernes)", () => {
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

  test("la del viernes vale el sábado y el domingo, que el BCV no publica", () => {
    // 2026-09-25 es viernes.
    const viernes = tasa({ id: "v", value: "855.66", capturedAt: "2026-09-24T21:00:00.000Z", effectiveDate: "2026-09-25" });
    assert.equal(rateOfDay([viernes], "USD/VES", "2026-09-26", "2026-09-26T15:00:00.000Z")?.id, "v");
    assert.equal(rateOfDay([viernes], "USD/VES", "2026-09-27", "2026-09-27T15:00:00.000Z")?.id, "v");
  });

  test("el lunes ya no vale la del viernes: exige la del lunes", () => {
    const viernes = tasa({ id: "v", value: "855.66", capturedAt: "2026-09-24T21:00:00.000Z", effectiveDate: "2026-09-25" });
    assert.equal(rateOfDay([viernes], "USD/VES", "2026-09-28", "2026-09-28T15:00:00.000Z"), null);
    const lunes = tasa({ id: "l", value: "857.0058", capturedAt: "2026-09-25T21:00:00.000Z", effectiveDate: "2026-09-28" });
    assert.equal(rateOfDay([viernes, lunes], "USD/VES", "2026-09-28", "2026-09-28T15:00:00.000Z")?.id, "l");
    // Y el sábado anterior sigue cobrando con la del viernes, aunque la del lunes ya esté confirmada.
    assert.equal(rateOfDay([viernes, lunes], "USD/VES", "2026-09-26", "2026-09-26T15:00:00.000Z")?.id, "v");
  });

  test("si la del lunes sigue pendiente, el lunes se bloquea (no cae a la del viernes)", () => {
    const viernes = tasa({ id: "v", value: "855.66", capturedAt: "2026-09-24T21:00:00.000Z", effectiveDate: "2026-09-25" });
    const lunes = tasa({ id: "l", value: "857.0058", capturedAt: "2026-09-25T21:00:00.000Z", effectiveDate: "2026-09-28", confirmed: false });
    assert.equal(rateOfDay([viernes, lunes], "USD/VES", "2026-09-28", "2026-09-28T15:00:00.000Z"), null);
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

describe("la tasa del BCV se aplica sola salvo que no sea oficial o sea la primera (ADR-019, ADR-024)", () => {
  const vigente = { value: "855.6625" };

  test("de la web oficial, con vigente: se aplica", () => {
    assert.deepEqual(autoApplyDecision({ previous: vigente, candidate: { value: "857.0100" }, official: true }), { apply: true });
  });

  test("solo de un tercero: espera, aunque el valor sea razonable (T6)", () => {
    assert.deepEqual(
      autoApplyDecision({ previous: vigente, candidate: { value: "857.01" }, official: false }),
      { apply: false, reason: "SOLO_TERCERO" },
    );
  });

  test("la primera del local: espera, no hay con qué compararla", () => {
    assert.deepEqual(
      autoApplyDecision({ previous: null, candidate: { value: "857.01" }, official: true }),
      { apply: false, reason: "PRIMERA" },
    );
  });

  test("un salto grande, hacia arriba o hacia abajo, se aplica igual: la del BCV manda (V-14)", () => {
    for (const value of ["950.00", "760.00", "1711.325"]) {
      assert.deepEqual(autoApplyDecision({ previous: vigente, candidate: { value }, official: true }), { apply: true }, value);
    }
  });
});

describe("días hábiles", () => {
  test("de lunes a viernes; el sábado y el domingo no", () => {
    assert.equal(isBusinessDay("2026-09-25"), true); // viernes
    assert.equal(isBusinessDay("2026-09-26"), false); // sábado
    assert.equal(isBusinessDay("2026-09-27"), false); // domingo
    assert.equal(isBusinessDay("2026-09-28"), true); // lunes
  });

  test("el siguiente del viernes es el lunes; del lunes, el martes", () => {
    assert.equal(nextBusinessDay("2026-09-25"), "2026-09-28");
    assert.equal(nextBusinessDay("2026-09-26"), "2026-09-28");
    assert.equal(nextBusinessDay("2026-09-28"), "2026-09-29");
  });
});

describe("las retenidas que piden a una persona (ADR-019)", () => {
  const retenida = tasa({ id: "h1", value: "950.00", capturedAt: "2026-09-25T21:00:00.000Z", effectiveDate: "2026-09-28", confirmed: false, heldBack: "SALTO" });

  test("una retenida para un día que viene es alerta", () => {
    assert.deepEqual(heldRates([retenida], "USD/VES", "2026-09-26").map((t) => t.id), ["h1"]);
  });

  test("deja de serlo si alguien confirma otra para ese día después", () => {
    const otra = tasa({ id: "c1", value: "857.01", capturedAt: "2026-09-25T22:00:00.000Z", effectiveDate: "2026-09-28" });
    assert.deepEqual(heldRates([retenida, otra], "USD/VES", "2026-09-26"), []);
  });

  test("y cuando su día ya no rige", () => {
    assert.deepEqual(heldRates([retenida], "USD/VES", "2026-09-29"), []);
  });

  test("una pendiente capturada a mano no es retenida", () => {
    const manual = tasa({ id: "m1", value: "857.01", capturedAt: "2026-09-25T21:00:00.000Z", effectiveDate: "2026-09-28", confirmed: false, source: "MANUAL" });
    assert.deepEqual(heldRates([manual], "USD/VES", "2026-09-26"), []);
  });
});

describe("aviso si el BCV no publicó la del siguiente día hábil (ADR-019 §8)", () => {
  const zona = "America/Caracas";
  const viernes = tasa({ id: "v", value: "855.66", capturedAt: "2026-09-24T21:00:00.000Z", effectiveDate: "2026-09-25" });

  test("viernes a las 6:30 pm sin la del lunes: avisa con el lunes", () => {
    assert.equal(missingNextBusinessDayRate([viernes], "USD/VES", "2026-09-25T22:30:00.000Z", zona, 18), "2026-09-28");
  });

  test("antes de la hora habitual no avisa", () => {
    assert.equal(missingNextBusinessDayRate([viernes], "USD/VES", "2026-09-25T20:30:00.000Z", zona, 18), null);
  });

  test("con la del lunes ya traída, aunque esté pendiente, no avisa", () => {
    const lunes = tasa({ id: "l", value: "857.01", capturedAt: "2026-09-25T21:00:00.000Z", effectiveDate: "2026-09-28", confirmed: false });
    assert.equal(missingNextBusinessDayRate([viernes, lunes], "USD/VES", "2026-09-25T22:30:00.000Z", zona, 18), null);
  });

  test("el fin de semana no avisa: el BCV no publica", () => {
    assert.equal(missingNextBusinessDayRate([viernes], "USD/VES", "2026-09-26T23:00:00.000Z", zona, 18), null);
  });

  test("la hora es la del local, no la de UTC", () => {
    // 23:30 UTC del jueves son las 7:30 pm en Caracas: ya toca.
    assert.equal(missingNextBusinessDayRate([], "USD/VES", "2026-09-24T23:30:00.000Z", zona, 18), "2026-09-25");
  });
});

describe("el comienzo del día en la zona del local", () => {
  test("la medianoche de Caracas es a las 4:00 UTC", () => {
    assert.equal(new Date(startOfDay("2026-10-01", "America/Caracas")).toISOString(), "2026-10-01T04:00:00.000Z");
  });

  test("es el primer instante que ya pertenece a ese día", () => {
    const t = startOfDay("2026-09-27", "America/Caracas");
    assert.equal(calendarDay(new Date(t).toISOString(), "America/Caracas"), "2026-09-27");
    assert.equal(calendarDay(new Date(t - 1).toISOString(), "America/Caracas"), "2026-09-26");
  });

  test("con horario de verano mide el desfase de ese día (Madrid: +2 en verano, +1 en invierno)", () => {
    assert.equal(new Date(startOfDay("2026-07-01", "Europe/Madrid")).toISOString(), "2026-06-30T22:00:00.000Z");
    assert.equal(new Date(startOfDay("2026-12-01", "Europe/Madrid")).toISOString(), "2026-11-30T23:00:00.000Z");
  });
});

describe("feriados bancarios (B2-4, D-FER)", () => {
  // Martes 13 de octubre de 2026, feriado de prueba entre semana.
  const FERIADO = "2026-10-13";
  const feriados = [FERIADO];
  const zona = "America/Caracas";
  const lunes = tasa({ id: "lun", value: "860.00", capturedAt: "2026-10-09T20:00:00.000Z", effectiveDate: "2026-10-12" });

  test("un feriado entre semana no es día hábil", () => {
    assert.equal(isBusinessDay(FERIADO), true);
    assert.equal(isBusinessDay(FERIADO, feriados), false);
    assert.equal(nextBusinessDay("2026-10-12", feriados), "2026-10-14");
  });

  test("el feriado cobra con la tasa del día hábil anterior, sin carga manual", () => {
    assert.equal(coversDay("2026-10-12", FERIADO), false);
    assert.equal(coversDay("2026-10-12", FERIADO, feriados), true);
    assert.equal(rateOfDay([lunes], "USD/VES", FERIADO, "2026-10-13T14:00:00.000Z", feriados)?.id, "lun");
    // Pasado el feriado, el miércoles exige la suya.
    assert.equal(rateOfDay([lunes], "USD/VES", "2026-10-14", "2026-10-14T14:00:00.000Z", feriados), null);
  });

  test("la víspera de un feriado se avisa por la del día hábil siguiente, no por la del feriado", () => {
    assert.equal(missingNextBusinessDayRate([lunes], "USD/VES", "2026-10-12T23:30:00.000Z", zona, 18, feriados), "2026-10-14");
    // El feriado mismo no es día hábil: no se avisa.
    assert.equal(missingNextBusinessDayRate([], "USD/VES", "2026-10-13T23:30:00.000Z", zona, 18, feriados), null);
  });

  test("qué vale como feriado", () => {
    assert.equal(holidayProblem(FERIADO), null);
    assert.equal(holidayProblem("2026-10-17"), "FIN_DE_SEMANA");
    for (const d of ["2026-02-30", "2026-13-01", "13/10/2026", ""]) assert.equal(holidayProblem(d), "DIA_INVALIDO", d);
  });
});

describe("la tasa de un cobro en curso (ADR-019 §7, B3-3)", () => {
  // Lunes 28 sep 2026: rige la de las 9:00 am («v») hasta que se corrige a las 10:00 am («l»).
  const viernes = tasa({ id: "v", value: "860.00", capturedAt: "2026-09-28T13:00:00.000Z", effectiveDate: "2026-09-28" });
  const lunes = tasa({ id: "l", value: "855.6625", capturedAt: "2026-09-28T14:00:00.000Z", effectiveDate: "2026-09-28" });
  const historia = [viernes, lunes];
  const zona = "America/Caracas";
  const aplicada = Date.parse(lunes.capturedAt);

  test("la vigente siempre cierra el cobro", () => {
    assert.equal(citedRateValid(historia, "USD/VES", "l", aplicada + 60_000, zona), true);
  });

  test("la anterior, solo dentro del margen", () => {
    assert.equal(citedRateValid(historia, "USD/VES", "v", aplicada + COBRO_GRACE_MS - 60_000, zona), true);
    assert.equal(citedRateValid(historia, "USD/VES", "v", aplicada + COBRO_GRACE_MS + 60_000, zona), false);
  });

  test("una que no existe o no está confirmada, nunca", () => {
    assert.equal(citedRateValid(historia, "USD/VES", "otra", aplicada, zona), false);
    const sinConfirmar = [viernes, { ...lunes, confirmed: false }];
    assert.equal(citedRateValid(sinConfirmar, "USD/VES", "l", aplicada + 60_000, zona), false);
  });
});

describe("lo tecleado otra vez al confirmar (§5.2, v0.27.1)", () => {
  test("vale la tasa completa, con o sin ceros de más", () => {
    assert.equal(typedRateMatches("866.5612", "866.5612"), true);
    assert.equal(typedRateMatches("871.36890000", "871.3689"), true);
  });

  test("vale la tasa como se ve en pantalla, redondeada a dos decimales", () => {
    assert.equal(rateAsShown("866.5612"), 86656n);
    assert.equal(rateAsShown("857.0058"), 85701n);
    assert.equal(rateAsShown("871.365"), 87137n, "la mitad, hacia arriba");
    assert.equal(rateAsShown("228.4"), 22840n);
    assert.equal(typedRateMatches("866.5612", "866.56"), true);
    assert.equal(typedRateMatches("857.0058", "857.01"), true);
    assert.equal(typedRateMatches("228.4", "228.40"), true);
  });

  test("una tecla equivocada no pasa, ni un redondeo a medias", () => {
    assert.equal(typedRateMatches("866.5612", "866.65"), false);
    assert.equal(typedRateMatches("866.5612", "866.57"), false);
    assert.equal(typedRateMatches("866.5612", "866.5"), false, "866,50 no es lo que se ve");
    assert.equal(typedRateMatches("866.5612", "866.561"), false, "con más de dos decimales se compara la completa");
  });
});
