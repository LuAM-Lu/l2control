/**
 * Pruebas del contrato de tasas — §5.2, ADR-005.
 *
 * Se prueba lo que impide: una tasa cero, una confirmada sin firma, dos
 * capturas del mismo par en el mismo instante, y un mando que intente entrar
 * ya confirmado o borrar una tasa.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CapturarTasaCommandSchema,
  ConfirmarTasaCommandSchema,
  ExchangeRateSchema,
  HistorialTasasSchema,
  TasaCommandSchema,
} from "./tasas.ts";

const capturada = {
  id: "r1",
  pair: "USD/VES",
  value: "228.41",
  source: "BCV",
  capturedAt: "2026-09-18T12:00:00.000Z",
  capturedBy: "Sincronización BCV",
  confirmed: false,
} as const;

const confirmada = {
  ...capturada,
  id: "r2",
  capturedAt: "2026-09-18T12:04:00.000Z",
  confirmed: true,
  confirmedBy: "Abigail Karam",
  confirmedAt: "2026-09-18T12:05:00.000Z",
} as const;

describe("una tasa capturada (F3-03)", () => {
  test("sin confirmar es válida, y dice de dónde salió", () => {
    assert.equal(ExchangeRateSchema.safeParse(capturada).success, true);
  });

  test("una tasa cero no existe: §5.2 lo pide como CHECK value > 0", () => {
    for (const value of ["0", "0.00", "0.000000"]) {
      assert.equal(ExchangeRateSchema.safeParse({ ...capturada, value }).success, false);
    }
  });

  test("el valor es texto decimal con punto: ni coma, ni negativo, ni notación científica", () => {
    for (const value of ["228,41", "-228.41", "2.2841e2", "228.41 Bs"]) {
      assert.equal(ExchangeRateSchema.safeParse({ ...capturada, value }).success, false);
    }
  });

  test("confirmada dice quién y cuándo (§7.4)", () => {
    assert.equal(ExchangeRateSchema.safeParse(confirmada).success, true);
  });

  test("confirmada sin firma no pasa: no se podría auditar quién movió los precios", () => {
    const { confirmedBy: _fuera, ...sinQuien } = confirmada;
    assert.equal(ExchangeRateSchema.safeParse(sinQuien).success, false);
    const { confirmedAt: _tampoco, ...sinCuando } = confirmada;
    assert.equal(ExchangeRateSchema.safeParse(sinCuando).success, false);
  });

  test("una firma sobre una tasa sin confirmar tampoco: es un estado a medias", () => {
    const r = ExchangeRateSchema.safeParse({ ...confirmada, confirmed: false });
    assert.equal(r.success, false);
  });
});

describe("el historial (F3-03: inmutable)", () => {
  const historial = { tasas: [capturada, confirmada], umbralVariacionBasisPoints: 1000 };

  test("un historial con su umbral es válido", () => {
    assert.equal(HistorialTasasSchema.safeParse(historial).success, true);
  });

  test("dos tasas no comparten identificador: cada pago referencia la suya", () => {
    const r = HistorialTasasSchema.safeParse({
      ...historial,
      tasas: [capturada, { ...confirmada, id: capturada.id }],
    });
    assert.equal(r.success, false);
  });

  test("dos capturas del mismo par en el mismo instante son una reescritura", () => {
    const r = HistorialTasasSchema.safeParse({
      ...historial,
      tasas: [capturada, { ...capturada, id: "r9", value: "999.00" }],
    });
    assert.equal(r.success, false);
  });

  test("el mismo instante en pares distintos sí se puede: son dos monedas", () => {
    const r = HistorialTasasSchema.safeParse({
      ...historial,
      tasas: [capturada, { ...capturada, id: "r9", pair: "USDT/VES" }],
    });
    assert.equal(r.success, true);
  });

  test("el umbral se mide en puntos básicos y no puede ser cero ni pasar del 100 %", () => {
    for (const umbralVariacionBasisPoints of [0, -100, 10_001, 12.5]) {
      assert.equal(HistorialTasasSchema.safeParse({ ...historial, umbralVariacionBasisPoints }).success, false);
    }
  });
});

describe("los mandos: capturar y confirmar (F3-04)", () => {
  test("capturar dice el par, el valor, la fuente y quién", () => {
    const r = CapturarTasaCommandSchema.safeParse({
      pair: "USD/VES",
      value: "228.41",
      source: "MANUAL",
      capturedBy: "Abigail Karam",
    });
    assert.equal(r.success, true);
  });

  test("capturar NO puede traer la tasa ya confirmada: eso lo decide una persona", () => {
    const r = CapturarTasaCommandSchema.safeParse({
      pair: "USD/VES",
      value: "228.41",
      source: "BCV",
      capturedBy: "Sincronización BCV",
      confirmed: true,
    });
    assert.equal(r.success, false);
  });

  test("confirmar puede llevar el valor tecleado de nuevo (doble verificación)", () => {
    assert.equal(
      ConfirmarTasaCommandSchema.safeParse({
        rateId: "r1",
        confirmadaPor: "Abigail Karam",
        valorVerificado: "228.41",
      }).success,
      true,
    );
    assert.equal(
      ConfirmarTasaCommandSchema.safeParse({ rateId: "r1", confirmadaPor: "Abigail Karam" }).success,
      true,
    );
  });

  test("confirmar sin decir quién no pasa", () => {
    assert.equal(ConfirmarTasaCommandSchema.safeParse({ rateId: "r1" }).success, false);
  });

  test("no existe un mando para editar ni para borrar una tasa (regla 5)", () => {
    for (const kind of ["EDITAR", "BORRAR", "ANULAR"]) {
      assert.equal(TasaCommandSchema.safeParse({ kind, rateId: "r1" }).success, false);
    }
    assert.equal(
      TasaCommandSchema.safeParse({
        kind: "CAPTURAR",
        pair: "USD/VES",
        value: "228.41",
        source: "MANUAL",
        capturedBy: "Abigail Karam",
      }).success,
      true,
    );
  });
});
