/**
 * Pruebas del turno de caja — F4-01, DEC-26, I-06.
 *
 * Se prueba lo que impide: dos turnos abiertos en el mismo equipo, un fondo
 * negativo, la misma moneda declarada dos veces, un corte Z sin firma y
 * reabrir un turno cerrado.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { AbrirTurnoCommandSchema, TurnoCommandSchema, TurnoSchema, TurnosSchema } from "./turno.ts";

const persona = { id: "u-1", name: "Marisol Prieto" };

const fondos = [
  { currency: "USD", amount: { minor: "5000", currency: "USD" } },
  { currency: "VES", amount: { minor: "100000", currency: "VES" } },
];

const abierto = {
  id: "t-1",
  deviceId: "dev-mostrador",
  punto: "Caja mostrador",
  businessDate: "2026-09-18",
  estado: "ABIERTO",
  abiertoPor: persona,
  abiertoEn: "2026-09-18T14:00:00.000Z",
  fondos,
} as const;

const cerrado = {
  ...abierto,
  id: "t-0",
  estado: "CERRADO_Z",
  abiertoEn: "2026-09-17T14:00:00.000Z",
  cerradoPor: { id: "u-2", name: "Abigail Karam" },
  cerradoEn: "2026-09-17T23:30:00.000Z",
} as const;

describe("un turno (F4-01)", () => {
  test("abierto, con su fondo por moneda y quién lo abrió", () => {
    assert.equal(TurnoSchema.safeParse(abierto).success, true);
  });

  test("el fondo va por moneda, y una moneda se declara una sola vez", () => {
    const repetida = { ...abierto, fondos: [fondos[0], fondos[0]] };
    assert.equal(TurnoSchema.safeParse(repetida).success, false);
  });

  test("cero es un fondo válido: se empieza sin cambio, y se dice", () => {
    const sinCambio = {
      ...abierto,
      fondos: [{ currency: "USD", amount: { minor: "0", currency: "USD" } }],
    };
    assert.equal(TurnoSchema.safeParse(sinCambio).success, true);
  });

  test("negativo no: una gaveta no empieza debiendo dinero", () => {
    const enRojo = {
      ...abierto,
      fondos: [{ currency: "USD", amount: { minor: "-500", currency: "USD" } }],
    };
    assert.equal(TurnoSchema.safeParse(enRojo).success, false);
  });

  test("el fondo tiene que estar en la moneda que declara", () => {
    const cruzado = {
      ...abierto,
      fondos: [{ currency: "USD", amount: { minor: "5000", currency: "VES" } }],
    };
    assert.equal(TurnoSchema.safeParse(cruzado).success, false);
  });

  test("sin declarar ningún fondo no se abre", () => {
    assert.equal(TurnoSchema.safeParse({ ...abierto, fondos: [] }).success, false);
  });

  test("un corte Z dice quién lo hizo y cuándo", () => {
    assert.equal(TurnoSchema.safeParse(cerrado).success, true);
    const { cerradoPor: _fuera, ...sinQuien } = cerrado;
    assert.equal(TurnoSchema.safeParse(sinQuien).success, false);
  });

  test("una firma sobre un turno abierto es un cierre que no ocurrió", () => {
    assert.equal(TurnoSchema.safeParse({ ...cerrado, estado: "ABIERTO" }).success, false);
  });

  test("un turno no se cierra antes de abrirse", () => {
    const r = TurnoSchema.safeParse({ ...cerrado, cerradoEn: "2026-09-16T10:00:00.000Z" });
    assert.equal(r.success, false);
  });
});

describe("los turnos del local (I-06)", () => {
  test("uno abierto y los cerrados de días anteriores", () => {
    assert.equal(TurnosSchema.safeParse({ turnos: [cerrado, abierto] }).success, true);
  });

  test("dos turnos abiertos en el mismo equipo no: el dinero se contaría dos veces", () => {
    const dos = { turnos: [abierto, { ...abierto, id: "t-2" }] };
    assert.equal(TurnosSchema.safeParse(dos).success, false);
  });

  test("pero en equipos distintos sí, por si el local crece (DEC-26)", () => {
    const dos = { turnos: [abierto, { ...abierto, id: "t-2", deviceId: "dev-taquilla" }] };
    assert.equal(TurnosSchema.safeParse(dos).success, true);
  });

  test("un turno en cierre sigue ocupando el equipo: todavía no está sellado", () => {
    const enCierre = { ...abierto, id: "t-2", estado: "EN_CIERRE" };
    assert.equal(TurnosSchema.safeParse({ turnos: [abierto, enCierre] }).success, false);
  });
});

describe("los mandos del turno", () => {
  test("abrir declara solo el fondo en dólares y en bolívares", () => {
    assert.equal(TurnoCommandSchema.safeParse({ kind: "ABRIR", fondos }).success, true);
    assert.equal(AbrirTurnoCommandSchema.safeParse({ fondos }).success, true);
    assert.equal(AbrirTurnoCommandSchema.safeParse({ fondos: [fondos[0]] }).success, false);
    assert.equal(AbrirTurnoCommandSchema.safeParse({ fondos: [fondos[0], fondos[0]] }).success, false);
  });

  test("abrir no trae equipo, persona, estado ni hora: los pone el servidor (ADR-017)", () => {
    for (const extra of [
      { deviceId: "dev-mostrador" },
      { abiertoPor: persona },
      { estado: "CERRADO_Z" },
      { abiertoEn: "2020-01-01T00:00:00.000Z" },
      { businessDate: "2020-01-01" },
    ]) {
      assert.equal(AbrirTurnoCommandSchema.safeParse({ fondos, ...extra }).success, false, Object.keys(extra)[0]);
    }
  });

  test("el corte Z no declara quién lo firma: sale de la sesión", () => {
    assert.equal(TurnoCommandSchema.safeParse({ kind: "CORTE_Z", turnoId: "t-1" }).success, true);
    assert.equal(TurnoCommandSchema.safeParse({ kind: "CORTE_Z", turnoId: "t-1", por: persona }).success, false);
  });

  test("no existe reabrir un turno cerrado (F4-06)", () => {
    for (const kind of ["REABRIR", "ANULAR_Z", "EDITAR_FONDO"]) {
      assert.equal(TurnoCommandSchema.safeParse({ kind, turnoId: "t-1" }).success, false);
    }
  });
});
