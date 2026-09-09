/**
 * Pruebas de contrato.
 *
 * Un contrato sin pruebas es una intención. Estas comprueban que las reglas
 * que el plan da por sentadas —minimización de datos de menores, ausencia de
 * duración cero, representante inequívoco— las impone el esquema y no la
 * buena voluntad de quien llame.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CheckInCommandSchema,
  DurationSchema,
  GuardianSchema,
  KidSchema,
  MoneySchema,
  ParkPolicySchema,
  WristbandCodeSchema,
} from "./index.ts";

const UUID = "3f2b1c8e-5a4d-4e7f-9b1a-2c6d8e0f4a71";

describe("código de pulsera", () => {
  test("normaliza a mayúsculas y recorta espacios", () => {
    assert.equal(WristbandCodeSchema.parse("  ak-0142 "), "AK-0142");
  });

  test("rechaza lo que no puede venir de un lector", () => {
    for (const malo of ["ab", "", "AK 0142", "AK_0142", "<script>", "x".repeat(33)]) {
      assert.equal(WristbandCodeSchema.safeParse(malo).success, false, `aceptó "${malo}"`);
    }
  });
});

describe("minimización de datos de menores (DEC-9)", () => {
  test("acepta solo lo autorizado", () => {
    const kid = KidSchema.parse({ name: "Valentina Rojas", nickname: "Vale", ageYears: 7 });
    assert.equal(kid.name, "Valentina Rojas");
  });

  test("nombre y contacto del representante son obligatorios", () => {
    assert.equal(GuardianSchema.safeParse({ fullName: "A" }).success, false);
    assert.equal(
      GuardianSchema.safeParse({ fullName: "Ana Rojas", contactReference: "0412-1234567" }).success,
      true,
    );
  });

  test("descarta campos que DEC-9 no autorizó", () => {
    const kid = KidSchema.parse({
      name: "Mateo Guerrero",
      cedula: "V-12345678",
      direccion: "Calle 5",
      foto: "data:image/png;base64,AAA",
    } as Record<string, unknown>);
    assert.equal("cedula" in kid, false);
    assert.equal("direccion" in kid, false);
    assert.equal("foto" in kid, false);
  });
});

describe("duración (ADR-011)", () => {
  test("no existe la duración cero", () => {
    assert.equal(DurationSchema.safeParse({ kind: "fixed", minutes: 0 }).success, false);
    assert.equal(DurationSchema.safeParse({ kind: "fixed", minutes: -30 }).success, false);
  });

  test("el tiempo abierto es otra variante, no un número", () => {
    assert.deepEqual(DurationSchema.parse({ kind: "openEnded" }), { kind: "openEnded" });
  });
});

describe("política del parque", () => {
  test("gracia 0 es válida y significa «sin gracia»", () => {
    const p = ParkPolicySchema.parse({
      graceMinutes: 0,
      penaltyBlockMinutes: 15,
      penaltyPricePerBlock: { minor: "150", currency: "USD" },
      warnBeforeMinutes: 10,
      capacityLimit: 30,
    });
    assert.equal(p.graceMinutes, 0);
  });

  test("un bloque de penalización de 0 se rechaza: sería división por cero", () => {
    const r = ParkPolicySchema.safeParse({
      graceMinutes: 5,
      penaltyBlockMinutes: 0,
      penaltyPricePerBlock: { minor: "150", currency: "USD" },
      warnBeforeMinutes: 10,
      capacityLimit: 30,
    });
    assert.equal(r.success, false);
  });
});

describe("dinero en el cable", () => {
  test("acepta enteros como texto, no decimales", () => {
    assert.equal(MoneySchema.safeParse({ minor: "1750", currency: "USD" }).success, true);
    assert.equal(MoneySchema.safeParse({ minor: "17.50", currency: "USD" }).success, false);
  });

  test("un monto sin moneda no es un monto", () => {
    assert.equal(MoneySchema.safeParse({ minor: "1750" }).success, false);
  });
});

describe("registro de entrada (F5-02)", () => {
  const entrada = {
    idempotencyKey: UUID,
    entries: [
      { wristbandCode: "AK-0142", kid: { name: "Valentina Rojas" }, packageId: "pkg-60" },
    ],
  };

  test("acepta un representante nuevo", () => {
    const r = CheckInCommandSchema.safeParse({
      ...entrada,
      guardian: { fullName: "Ana Rojas", contactReference: "0412-1234567" },
    });
    assert.equal(r.success, true);
  });

  test("acepta un representante ya conocido", () => {
    const r = CheckInCommandSchema.safeParse({ ...entrada, guardianId: "g-1" });
    assert.equal(r.success, true);
  });

  test("rechaza que no haya representante: sin él no hay a quién llamar", () => {
    assert.equal(CheckInCommandSchema.safeParse(entrada).success, false);
  });

  test("rechaza los dos a la vez", () => {
    const r = CheckInCommandSchema.safeParse({
      ...entrada,
      guardianId: "g-1",
      guardian: { fullName: "Ana Rojas", contactReference: "0412-1234567" },
    });
    assert.equal(r.success, false);
  });

  test("exige clave de idempotencia: sin ella, un doble clic cobra dos veces", () => {
    const { idempotencyKey: _omitida, ...sinClave } = entrada;
    const r = CheckInCommandSchema.safeParse({
      ...sinClave,
      guardianId: "g-1",
    });
    assert.equal(r.success, false);
  });

  test("exige al menos un niño", () => {
    const r = CheckInCommandSchema.safeParse({
      idempotencyKey: UUID,
      entries: [],
      guardianId: "g-1",
    });
    assert.equal(r.success, false);
  });
});
