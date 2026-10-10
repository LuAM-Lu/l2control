/**
 * Pruebas de los puestos por uso — T-20 (M-37, U-14).
 *
 * Lo que fijan: lo que se hizo dice de qué puesto es, sea del rol que sea; lo que no lo dice cuenta para el punto de
 * cobro o el rol; ocupado es haber trabajado hace menos de los minutos; y con la caja abierta, un puesto vigilado avisa
 * una vez cuando pasa de los minutos sin nadie (contando desde que se abrió la caja si nadie vino).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { claveDeAusencia, estadoDelPuesto, puestoDeLaActividad } from "./puestos.ts";

const MIN = 60_000;
const AHORA = Date.parse("2026-10-10T18:00:00Z");

describe("de qué puesto es lo que alguien hizo (T-20)", () => {
  test("por lo que hizo, sea del rol que sea: administración cobrando ocupa la caja", () => {
    assert.equal(puestoDeLaActividad({ accion: "cuenta.cobrar", rol: "ADMIN", enPuntoDeCobro: false }), "CAJA");
    assert.equal(puestoDeLaActividad({ accion: "parque.entrada", rol: "CAJERO", enPuntoDeCobro: true }), "PARQUE");
    assert.equal(puestoDeLaActividad({ accion: "pedido.enviar", rol: "SUPERVISOR", enPuntoDeCobro: false }), "MESAS");
    assert.equal(puestoDeLaActividad({ accion: "turno.abrir", rol: "SUPERVISOR", enPuntoDeCobro: false }), "CAJA");
  });

  test("lo que no lo dice cuenta para el punto de cobro o para el rol; la oficina, para ninguno", () => {
    assert.equal(puestoDeLaActividad({ accion: "sesion.abrir", rol: "ADMIN", enPuntoDeCobro: true }), "CAJA");
    assert.equal(puestoDeLaActividad({ accion: "sesion.abrir", rol: "MONITOR_PARQUE", enPuntoDeCobro: false }), "PARQUE");
    assert.equal(puestoDeLaActividad({ accion: "cuenta.guardar", rol: "MESERO", enPuntoDeCobro: false }), "MESAS");
    assert.equal(puestoDeLaActividad({ accion: "sucursal.ajustar", rol: "ADMIN", enPuntoDeCobro: false }), null);
    assert.equal(puestoDeLaActividad({ accion: "sesion.abrir", rol: "COCINA", enPuntoDeCobro: false }), null);
  });
});

describe("ocupado, sin actividad y el aviso (T-20)", () => {
  const base = { cajaAbiertaDesde: AHORA - 60 * MIN, ahora: AHORA, minutos: 15, vigilado: true };

  test("ocupado si trabajó hace menos de los minutos", () => {
    assert.deepEqual(estadoDelPuesto({ ...base, ultima: AHORA - 14 * MIN }), { ocupado: true, avisar: false, sinNadieDesde: null });
  });

  test("sin nadie: dice desde cuándo y, con la caja abierta y vigilado, avisa", () => {
    const e = estadoDelPuesto({ ...base, ultima: AHORA - 20 * MIN });
    assert.deepEqual(e, { ocupado: false, avisar: true, sinNadieDesde: AHORA - 20 * MIN });
    assert.equal(estadoDelPuesto({ ...base, ultima: AHORA - 20 * MIN, vigilado: false }).avisar, false, "si no se vigila, sin aviso");
    assert.equal(estadoDelPuesto({ ...base, ultima: AHORA - 20 * MIN, cajaAbiertaDesde: null }).avisar, false, "con la caja cerrada, sin aviso");
  });

  test("si nadie vino, cuenta desde que se abrió la caja", () => {
    assert.equal(estadoDelPuesto({ ...base, ultima: null, cajaAbiertaDesde: AHORA - 10 * MIN }).avisar, false);
    assert.equal(estadoDelPuesto({ ...base, ultima: null, cajaAbiertaDesde: AHORA - 16 * MIN }).avisar, true);
    // Se fue antes de abrir la caja: cuenta desde la apertura.
    assert.equal(estadoDelPuesto({ ...base, ultima: AHORA - 90 * MIN, cajaAbiertaDesde: AHORA - 5 * MIN }).avisar, false);
  });

  test("una ausencia es la misma hasta que alguien vuelve", () => {
    assert.equal(claveDeAusencia("CAJA", AHORA - 20 * MIN), claveDeAusencia("CAJA", AHORA - 20 * MIN));
    assert.notEqual(claveDeAusencia("CAJA", AHORA - 20 * MIN), claveDeAusencia("CAJA", AHORA - 2 * MIN));
  });
});
