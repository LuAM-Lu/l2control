/**
 * Pruebas del contrato de los descuentos — B3-6.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AplicarDescuentoCommandSchema,
  CrearReglaDescuentoCommandSchema,
  DescuentoAplicadoSchema,
  ValorDescuentoSchema,
} from "./descuentos.ts";
import { AjustesSucursalSchema } from "./sucursal.ts";

const UUID = "0192f1a2-0000-7000-8000-000000000001";
const ahora = "2026-10-01T15:00:00.000Z";
const quien = { id: UUID, name: "Luis Guerrero", role: "SUPERVISOR" as const };

describe("reglas", () => {
  test("el de medio dice su medio, los demás no; la vigencia no termina antes de empezar", () => {
    const base = { nombre: "Zelle 10 %", tipo: "MEDIO", valor: { tipo: "PORCENTAJE", basisPoints: 1000 }, alcance: { tipo: "CUENTA" }, desde: "2026-10-01" };
    assert.equal(CrearReglaDescuentoCommandSchema.safeParse({ ...base, medio: "ZELLE" }).success, true);
    assert.equal(CrearReglaDescuentoCommandSchema.safeParse(base).success, false);
    assert.equal(CrearReglaDescuentoCommandSchema.safeParse({ ...base, tipo: "MANUAL", medio: "ZELLE" }).success, false);
    assert.equal(CrearReglaDescuentoCommandSchema.safeParse({ ...base, medio: "ZELLE", hasta: "2026-09-30" }).success, false);
  });

  test("un valor es un porcentaje entero en puntos básicos o un monto en dólares mayor que cero", () => {
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "PORCENTAJE", basisPoints: 1250 }).success, true);
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "PORCENTAJE", basisPoints: 12.5 }).success, false);
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "PORCENTAJE", basisPoints: 10_001 }).success, false);
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "MONTO", monto: { minor: "500", currency: "USD" } }).success, true);
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "MONTO", monto: { minor: "0", currency: "USD" } }).success, false);
    assert.equal(ValorDescuentoSchema.safeParse({ tipo: "MONTO", monto: { minor: "500", currency: "VES" } }).success, false);
  });
});

describe("aplicarlo", () => {
  const cmd = { idempotencyKey: UUID, accountId: UUID, version: 3, quitar: false };

  test("con una regla, su id; el manual, su motivo; «Otro», explicado", () => {
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...cmd, origen: "MEDIO", reglaId: UUID }).success, true);
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...cmd, origen: "MANUAL", reglaId: UUID }).success, false);
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...cmd, origen: "MANUAL", reglaId: UUID, motivo: "PROMOCION" }).success, true);
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...cmd, origen: "MANUAL", reglaId: UUID, motivo: "OTRO" }).success, false);
  });

  test("el de administración trae su valor y su motivo escrito, sin regla", () => {
    const admin = { ...cmd, origen: "ADMIN", valor: { tipo: "PORCENTAJE", basisPoints: 5000 }, detalle: "Cumpleaños del dueño" };
    assert.equal(AplicarDescuentoCommandSchema.safeParse(admin).success, true);
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...admin, detalle: "ok" }).success, false);
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...admin, reglaId: UUID }).success, false);
  });

  test("quitarlo no pide nada más", () => {
    assert.equal(AplicarDescuentoCommandSchema.safeParse({ ...cmd, quitar: true }).success, true);
  });
});

describe("en la cuenta", () => {
  const d = {
    origen: "MANUAL",
    reglaId: UUID,
    nombre: "Cliente frecuente",
    valor: { tipo: "PORCENTAJE", basisPoints: 1000 },
    alcance: { tipo: "CUENTA" },
    medio: null,
    motivo: "CLIENTE_FRECUENTE",
    detalle: null,
    autorizadoPor: quien,
    en: ahora,
  };

  test("solo el VIP va sin quien autoriza; el de administración, solo de administración y con motivo", () => {
    assert.equal(DescuentoAplicadoSchema.safeParse(d).success, true);
    assert.equal(DescuentoAplicadoSchema.safeParse({ ...d, autorizadoPor: null }).success, false);
    assert.equal(DescuentoAplicadoSchema.safeParse({ ...d, origen: "VIP", motivo: null, autorizadoPor: null }).success, true);
    const admin = { ...d, origen: "ADMIN", reglaId: null, motivo: null, detalle: "Compensación por la espera" };
    assert.equal(DescuentoAplicadoSchema.safeParse(admin).success, false);
    assert.equal(DescuentoAplicadoSchema.safeParse({ ...admin, autorizadoPor: { ...quien, role: "ADMIN" } }).success, true);
  });
});

test("los ajustes publicados antes de B3-6 traen el tope de supervisión de fábrica: 20 %", () => {
  const viejos = {
    nombre: "Abby Kingdom",
    rif: null,
    direccionFiscal: null,
    telefono: null,
    monedaFuncional: "USD",
    formatoHora: "12h",
    zonaHoraria: "America/Caracas",
    horario: null,
    maxRetenido: { minor: "5", currency: "USD" },
    umbralArqueo: { minor: "100", currency: "USD" },
    horasHuerfana: 8,
    servicio: { kind: "SIN_SERVICIO" },
  };
  assert.equal(AjustesSucursalSchema.parse(viejos).topeDescuentoSupervision, 2000);
});
