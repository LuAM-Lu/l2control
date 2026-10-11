/**
 * Pruebas del día de negocio — ADR-009, B3-24 (M-38, W-2).
 *
 * Caracas va a UTC−4 todo el año: las 4:00 am del 10 de octubre son las 08:00 UTC.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { businessDayAt, businessDayEnd, isAfterHours, isFromAnEarlierDay, localMinutesAt } from "./index.ts";

const CCS = "America/Caracas";
const en = (iso: string) => Date.parse(iso);

describe("el día de negocio (B3-24)", () => {
  test("pasada la medianoche sigue siendo el día, hasta la hora en que termina", () => {
    assert.equal(businessDayAt(en("2026-10-10T02:00:00Z"), CCS, 240), "2026-10-09"); // 10:00 pm del 9
    assert.equal(businessDayAt(en("2026-10-10T05:30:00Z"), CCS, 240), "2026-10-09"); // 1:30 am del 10
    assert.equal(businessDayAt(en("2026-10-10T07:59:00Z"), CCS, 240), "2026-10-09"); // 3:59 am
    assert.equal(businessDayAt(en("2026-10-10T08:00:00Z"), CCS, 240), "2026-10-10"); // 4:00 am: ya es el 10
  });

  test("con el fin a medianoche, el día es el del calendario", () => {
    assert.equal(businessDayAt(en("2026-10-10T03:59:00Z"), CCS, 0), "2026-10-09");
    assert.equal(businessDayAt(en("2026-10-10T04:00:00Z"), CCS, 0), "2026-10-10");
  });

  test("el fin del día es el instante del día siguiente a esa hora", () => {
    assert.equal(new Date(businessDayEnd("2026-10-09", CCS, 240)).toISOString(), "2026-10-10T08:00:00.000Z");
    assert.equal(new Date(businessDayEnd("2026-10-09", CCS, 0)).toISOString(), "2026-10-10T04:00:00.000Z");
    // Fin de mes y de año.
    assert.equal(new Date(businessDayEnd("2026-12-31", CCS, 240)).toISOString(), "2027-01-01T08:00:00.000Z");
  });

  test("en una zona con cambio de hora, el fin cae a la hora de pared del local", () => {
    // Madrid pasa a horario de invierno la madrugada del 25 de octubre de 2026 (a las 3:00 vuelve a las 2:00).
    assert.equal(new Date(businessDayEnd("2026-10-24", "Europe/Madrid", 240)).toISOString(), "2026-10-25T03:00:00.000Z");
    assert.equal(new Date(businessDayEnd("2026-10-23", "Europe/Madrid", 240)).toISOString(), "2026-10-24T02:00:00.000Z");
  });

  test("la caja del 9 es de un día anterior desde las 4:00 am del 10, no antes", () => {
    assert.equal(isFromAnEarlierDay("2026-10-09", en("2026-10-10T07:59:59Z"), CCS, 240), false);
    assert.equal(isFromAnEarlierDay("2026-10-09", en("2026-10-10T08:00:00Z"), CCS, 240), true);
    assert.equal(isFromAnEarlierDay("2026-10-09", en("2026-10-11T15:00:00Z"), CCS, 240), true);
  });

  test("un fin del día fuera de 12:00 am a 10:00 am no se acepta", () => {
    assert.throws(() => businessDayAt(0, CCS, -1), RangeError);
    assert.throws(() => businessDayAt(0, CCS, 601), RangeError);
    assert.throws(() => businessDayAt(0, CCS, 30.5), RangeError);
    assert.throws(() => businessDayEnd("9 de octubre", CCS, 240), RangeError);
  });
});

describe("de noche (Inicio avisa que el día sigue abierto)", () => {
  test("sin horario, desde las 10:00 pm hasta que termina el día", () => {
    assert.equal(isAfterHours(en("2026-10-10T01:59:00Z"), CCS, 240, null), false); // 9:59 pm
    assert.equal(isAfterHours(en("2026-10-10T02:00:00Z"), CCS, 240, null), true); // 10:00 pm
    assert.equal(isAfterHours(en("2026-10-10T07:00:00Z"), CCS, 240, null), true); // 3:00 am
    assert.equal(isAfterHours(en("2026-10-10T08:00:00Z"), CCS, 240, null), false); // 4:00 am
    assert.equal(isAfterHours(en("2026-10-10T16:00:00Z"), CCS, 240, null), false); // mediodía
  });

  test("con horario, desde la hora en que cierra el local", () => {
    assert.equal(isAfterHours(en("2026-10-10T00:30:00Z"), CCS, 240, 20 * 60), true); // 8:30 pm, cierra a las 8:00 pm
    assert.equal(isAfterHours(en("2026-10-09T23:30:00Z"), CCS, 240, 20 * 60), false); // 7:30 pm
  });

  test("los minutos del local", () => {
    assert.equal(localMinutesAt(en("2026-10-10T02:15:00Z"), CCS), 22 * 60 + 15);
    assert.equal(localMinutesAt(en("2026-10-10T04:00:00Z"), CCS), 0);
  });
});
