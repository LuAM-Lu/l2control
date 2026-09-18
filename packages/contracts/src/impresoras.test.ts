/**
 * Pruebas de las impresoras — F1-12, F6-09b, ADR-015, DEC-8.
 *
 * Se prueba lo que impide: una impresora con IP pública, dos nombres para el
 * mismo aparato, encender una sin las garantías de red, y quedarse sin
 * impresora de cocina sin decirlo.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ImpresoraCommandSchema,
  ImpresoraSchema,
  ImpresorasSchema,
  IpLocalSchema,
} from "./impresoras.ts";

const cocina = {
  id: "imp-cocina",
  name: "Cocina",
  oficio: "COCINA",
  ip: "192.168.10.21",
  puerto: 9100,
  ancho: 80,
  enVlanDeHardware: true,
  ipFija: true,
  activa: true,
} as const;

const caja = { ...cocina, id: "imp-caja", name: "Caja", oficio: "CAJA", ip: "192.168.10.22", ancho: 58 } as const;

const config = { impresoras: [cocina, caja], sinImpresoraDeCocina: false };

describe("la dirección de una impresora (ADR-015, §7.1)", () => {
  test("solo redes locales: una impresora con IP pública está expuesta a internet", () => {
    for (const ip of ["192.168.1.50", "10.0.0.7", "172.20.5.9"]) {
      assert.equal(IpLocalSchema.safeParse(ip).success, true, ip);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "impresora.local", "192.168.1.999"]) {
      assert.equal(IpLocalSchema.safeParse(ip).success, false, ip);
    }
  });

  test("el ancho es 58 u 80, los dos rollos que existen (DEC-8)", () => {
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, ancho: 80 }).success, true);
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, ancho: 58 }).success, true);
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, ancho: 72 }).success, false);
  });

  test("el puerto es un puerto", () => {
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, puerto: 0 }).success, false);
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, puerto: 70_000 }).success, false);
    assert.equal(ImpresoraSchema.safeParse({ ...cocina, puerto: 9100 }).success, true);
  });
});

describe("las impresoras del local", () => {
  test("una de cocina y una de caja, en la VLAN y con IP fija", () => {
    assert.equal(ImpresorasSchema.safeParse(config).success, true);
  });

  test("dos nombres para el mismo aparato no: al fallar uno, el otro parecería sano", () => {
    const r = ImpresorasSchema.safeParse({
      ...config,
      impresoras: [cocina, { ...caja, ip: cocina.ip, puerto: cocina.puerto }],
    });
    assert.equal(r.success, false);
  });

  test("una impresora activa sin VLAN o sin IP fija no se enciende", () => {
    assert.equal(
      ImpresorasSchema.safeParse({ ...config, impresoras: [{ ...cocina, enVlanDeHardware: false }, caja] })
        .success,
      false,
    );
    assert.equal(
      ImpresorasSchema.safeParse({ ...config, impresoras: [{ ...cocina, ipFija: false }, caja] }).success,
      false,
    );
  });

  test("pero apagada sí puede estar a medio configurar: todavía no imprime nada", () => {
    const r = ImpresorasSchema.safeParse({
      impresoras: [cocina, { ...caja, activa: false, ipFija: false }],
      sinImpresoraDeCocina: false,
    });
    assert.equal(r.success, true);
  });

  test("quedarse sin impresora de cocina se dice, no se descubre", () => {
    const sinCocina = { impresoras: [caja], sinImpresoraDeCocina: false };
    assert.equal(ImpresorasSchema.safeParse(sinCocina).success, false);
    // Operar sin papel es legítimo —el KDS manda— pero es una decisión escrita.
    assert.equal(
      ImpresorasSchema.safeParse({ ...sinCocina, sinImpresoraDeCocina: true }).success,
      true,
    );
  });

  test("una cocina apagada es quedarse sin cocina", () => {
    const r = ImpresorasSchema.safeParse({
      impresoras: [{ ...cocina, activa: false }, caja],
      sinImpresoraDeCocina: false,
    });
    assert.equal(r.success, false);
  });

  test("un local sin ninguna impresora, si lo dice, es válido", () => {
    assert.equal(
      ImpresorasSchema.safeParse({ impresoras: [], sinImpresoraDeCocina: true }).success,
      true,
    );
  });
});

describe("los cambios", () => {
  test("añadir, editar, retirar, encender y declarar que no hay cocina", () => {
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "AÑADIR", impresora: cocina }).success, true);
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "EDITAR", impresora: caja }).success, true);
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "RETIRAR", impresoraId: "imp-caja" }).success, true);
    assert.equal(
      ImpresoraCommandSchema.safeParse({ kind: "ACTIVAR", impresoraId: "imp-caja", activa: false }).success,
      true,
    );
    assert.equal(
      ImpresoraCommandSchema.safeParse({ kind: "SIN_COCINA", sinImpresoraDeCocina: true }).success,
      true,
    );
  });

  test("un mando desconocido no pasa", () => {
    assert.equal(ImpresoraCommandSchema.safeParse({ kind: "IMPRIMIR", impresoraId: "imp-caja" }).success, false);
  });
});
