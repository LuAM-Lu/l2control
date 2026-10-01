/**
 * Pruebas del contrato de impresión — F1-12, ADR-015, ADR-026, B5-2.
 *
 * Se prueba lo que impide: una impresora con IP pública, una que no sirve para nada, dos activas para
 * el mismo papel y un mensaje del agente mal formado.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  DatosImpresoraSchema,
  ImpresoraCommandSchema,
  ImpresorasDelLocalSchema,
  IpLocalSchema,
  ResultadoDelAgenteSchema,
  VincularAgenteSchema,
} from "./impresoras.ts";

const caja = { nombre: "Caja", ip: "192.168.10.22", puerto: 9100, ancho: 80, recibos: true, comandas: true, enVlanDeHardware: true, ipFija: true } as const;
const UUID = "0192f1a2-0000-7000-8000-000000000001";

describe("la dirección de una impresora (ADR-015, §7.1)", () => {
  test("solo redes locales: una impresora con IP pública está expuesta a internet", () => {
    for (const ip of ["192.168.1.50", "10.0.0.7", "172.20.5.9"]) assert.equal(IpLocalSchema.safeParse(ip).success, true, ip);
    for (const ip of ["8.8.8.8", "172.32.0.1", "impresora.local", "192.168.1.999", "127.0.0.1"]) assert.equal(IpLocalSchema.safeParse(ip).success, false, ip);
  });

  test("el ancho es 58 u 80, el puerto es un puerto y sirve para algo", () => {
    assert.equal(DatosImpresoraSchema.safeParse(caja).success, true);
    assert.equal(DatosImpresoraSchema.safeParse({ ...caja, ancho: 72 }).success, false);
    assert.equal(DatosImpresoraSchema.safeParse({ ...caja, puerto: 70_000 }).success, false);
    assert.equal(DatosImpresoraSchema.safeParse({ ...caja, recibos: false, comandas: false }).success, false);
  });
});

describe("las impresoras del local", () => {
  const imp = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...caja, activa: true, ultimo: null, ...extra });

  test("a lo sumo una activa para recibos y una para comandas", () => {
    assert.equal(ImpresorasDelLocalSchema.safeParse({ impresoras: [imp("a"), imp("b", { activa: false })], agentes: [] }).success, true);
    assert.equal(ImpresorasDelLocalSchema.safeParse({ impresoras: [imp("a"), imp("b", { comandas: false })], agentes: [] }).success, false);
    assert.equal(ImpresorasDelLocalSchema.safeParse({ impresoras: [imp("a", { comandas: false }), imp("b", { recibos: false })], agentes: [] }).success, true);
  });

  test("los mandos: vincular un agente pide un nombre", () => {
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "CREAR", datos: caja }).success, true);
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "VINCULAR_AGENTE", nombre: "" }).success, false);
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "ACTIVAR", impresoraId: UUID, activa: true }).success, true);
  });
});

describe("lo que habla el agente (ADR-026)", () => {
  test("el código es de 8 caracteres sin los que se confunden, con o sin guion", () => {
    assert.equal(VincularAgenteSchema.parse({ codigo: "k7mq-4xpz" }).codigo, "K7MQ-4XPZ");
    assert.equal(VincularAgenteSchema.safeParse({ codigo: "K7MQ4XPZ" }).success, true);
    assert.equal(VincularAgenteSchema.safeParse({ codigo: "K7MQ-4XP0" }).success, false, "sin ceros ni unos");
  });

  test("un resultado dice qué trabajo y cómo le fue", () => {
    assert.equal(ResultadoDelAgenteSchema.safeParse({ trabajoId: UUID, ok: false, error: "Sin papel" }).success, true);
    assert.equal(ResultadoDelAgenteSchema.safeParse({ trabajoId: "x", ok: true }).success, false);
    assert.equal(ResultadoDelAgenteSchema.safeParse({ trabajoId: UUID, ok: true, extra: 1 }).success, false);
  });
});
