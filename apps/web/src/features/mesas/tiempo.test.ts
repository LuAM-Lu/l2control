import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { conSuHora, duracion, duracionCorta, transcurrido, type RelojDelLocal } from "./tiempo.ts";

/**
 * Los tiempos del salón (B6-17, M-38): minutos para lo corto, horas y minutos para lo de la tarde, y la hora en que
 * empezó para lo que viene de otro día.
 */
const ZONA = "America/Caracas";
const reloj: RelojDelLocal = {
  zona: ZONA,
  hora: (t) => new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONA }).format(t).replace(/\s?([ap])\.?\s?m\.?/i, " $1m"),
  dia: (t) => new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: ZONA }).format(t),
};
/** Domingo 11 de octubre de 2026, 8:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-12T00:00:00.000Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

describe("los tiempos del salón (B6-17)", () => {
  test("una duración se lee: minutos, horas y minutos, días", () => {
    assert.equal(duracion(0), "0 min");
    assert.equal(duracion(42), "42 min");
    assert.equal(duracion(60), "1 h");
    assert.equal(duracion(75), "1 h 15 min");
    assert.equal(duracion(24 * 60 + 3 * 60 + 20), "1 d 3 h");
    assert.equal(duracion(-5), "0 min");
  });

  test("en el plano, corto", () => {
    assert.deepEqual([42, 61, 190, 4711].map(duracionCorta), ["42′", "1 h", "3 h", "3 d"]);
  });

  test("lo de hoy, por cuánto lleva; lo de ayer o antes, por su hora", () => {
    assert.equal(transcurrido(hace(42), AHORA, reloj), "42 min");
    assert.equal(transcurrido(hace(75), AHORA, reloj), "1 h 15 min");
    // Ayer a las 7:29 pm en Caracas.
    assert.equal(transcurrido("2026-10-10T23:29:00.000Z", AHORA, reloj), "desde ayer 7:29 pm");
    assert.match(transcurrido("2026-10-08T23:29:00.000Z", AHORA, reloj), /^desde el 8 oct\.? 7:29 pm$/);
    // Más de medio día dentro del mismo día del local.
    assert.equal(transcurrido("2026-10-11T11:00:00.000Z", AHORA, reloj), "desde hoy 7:00 am");
    assert.equal(transcurrido(hace(30), 0, reloj), "0 min");
  });

  test("con su hora delante, lo de hoy; lo de antes ya la lleva", () => {
    assert.equal(conSuHora(hace(42), AHORA, reloj), "7:18 pm · 42 min");
    assert.equal(conSuHora("2026-10-10T23:29:00.000Z", AHORA, reloj), "desde ayer 7:29 pm");
  });
});
