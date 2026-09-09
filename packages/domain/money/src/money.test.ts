/**
 * Pruebas del núcleo monetario — §5.1 y §10.1 del plan.
 *
 * §10.1 exige cobertura ≥ 95 % en `domain/money`, sin excepción: este módulo
 * decide cuánto cobra el negocio. Las pruebas de reparto son de PROPIEDAD —
 * comprueban que la suma de las partes es siempre el total, para cualquier
 * entrada — no de un caso suelto.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CurrencyMismatchError,
  InvalidAmountError,
  add,
  allocate,
  allocateByRatios,
  fromMajor,
  money,
  multiply,
  multiplyByRate,
  convert,
  invertRate,
  RateMismatchError,
  type FrozenRate,
  subtract,
  sum,
  toMajor,
  zero,
} from "./index.ts";

describe("representación", () => {
  test("convierte unidades mayores a menores sin punto flotante", () => {
    assert.equal(fromMajor("17.50", "USD").amount, 1750n);
    assert.equal(fromMajor("0.01", "USD").amount, 1n);
    assert.equal(fromMajor("-3.07", "USD").amount, -307n);
  });

  test("ida y vuelta preserva el valor exacto", () => {
    for (const v of ["0.00", "0.01", "1.00", "17.50", "999999.99"]) {
      assert.equal(toMajor(fromMajor(v, "USD")), v);
    }
  });

  test("0.1 + 0.2 es exactamente 0.3 (lo que el punto flotante no logra)", () => {
    const result = add(fromMajor("0.1", "USD"), fromMajor("0.2", "USD"));
    assert.equal(toMajor(result), "0.30");
    // La contraprueba de por qué existe este módulo:
    assert.notEqual(0.1 + 0.2, 0.3);
  });

  test("rechaza más decimales de los que admite la moneda", () => {
    assert.throws(() => fromMajor("1.005", "USD"), InvalidAmountError);
  });

  test("rechaza texto que no es un número", () => {
    assert.throws(() => fromMajor("doce dólares", "USD"), InvalidAmountError);
  });
});

describe("aritmética", () => {
  test("no permite mezclar monedas", () => {
    assert.throws(
      () => add(fromMajor("1.00", "USD"), fromMajor("1.00", "VES")),
      CurrencyMismatchError,
    );
    assert.throws(
      () => subtract(fromMajor("1.00", "USD"), fromMajor("1.00", "USDT")),
      CurrencyMismatchError,
    );
  });

  test("suma una lista vacía sin fallar", () => {
    assert.deepEqual(sum([], "USD"), zero("USD"));
  });

  test("multiplica por cantidades enteras", () => {
    assert.equal(toMajor(multiply(fromMajor("2.50", "USD"), 3n)), "7.50");
  });
});

describe("multiplicación por tasa", () => {
  const bs = (v: string) => fromMajor(v, "USD");

  test("calcula el IVA del 16 % sin pasar por decimales", () => {
    assert.equal(toMajor(multiplyByRate(bs("100.00"), 1600n, 10000n)), "16.00");
    assert.equal(toMajor(multiplyByRate(bs("17.50"), 1600n, 10000n)), "2.80");
  });

  test("redondea la mitad hacia arriba, que es la convención fiscal", () => {
    // 0,01 × 50 % = 0,005 → medio céntimo
    assert.equal(toMajor(multiplyByRate(bs("0.01"), 5000n, 10000n, "HALF_UP")), "0.01");
    assert.equal(toMajor(multiplyByRate(bs("0.01"), 5000n, 10000n, "DOWN")), "0.00");
  });

  test("HALF_EVEN parte los empates hacia el par", () => {
    assert.equal(toMajor(multiplyByRate(bs("0.01"), 5000n, 10000n, "HALF_EVEN")), "0.00");
    assert.equal(toMajor(multiplyByRate(bs("0.03"), 5000n, 10000n, "HALF_EVEN")), "0.02");
  });

  test("un monto negativo (nota de crédito) se aleja del cero igual", () => {
    assert.equal(toMajor(multiplyByRate(bs("-0.01"), 5000n, 10000n, "HALF_UP")), "-0.01");
    assert.equal(toMajor(multiplyByRate(bs("-100.00"), 1600n, 10000n)), "-16.00");
  });

  test("una tasa del 0 % da cero, no un error", () => {
    assert.equal(toMajor(multiplyByRate(bs("100.00"), 0n, 10000n)), "0.00");
  });

  test("un denominador de cero se rechaza", () => {
    assert.throws(() => multiplyByRate(bs("100.00"), 1600n, 0n), InvalidAmountError);
  });

  test("la moneda se conserva", () => {
    assert.equal(multiplyByRate(fromMajor("100.00", "VES"), 1600n, 10000n).currency, "VES");
  });
});

describe("conversión con tasa congelada (ADR-005)", () => {
  const TASA: FrozenRate = { from: "VES", to: "USD", numerator: 22841n, denominator: 100n };

  test("convierte bolívares a dólares con la tasa dada", () => {
    assert.equal(toMajor(convert(fromMajor("11420.50", "VES"), TASA)), "50.00");
    assert.equal(toMajor(convert(fromMajor("228.41", "VES"), TASA)), "1.00");
  });

  test("rechaza una tasa que no corresponde a la moneda del monto", () => {
    assert.throws(() => convert(fromMajor("100.00", "USD"), TASA), RateMismatchError);
  });

  test("una tasa de cero se rechaza: nunca es gratis", () => {
    const cero: FrozenRate = { ...TASA, numerator: 0n };
    assert.throws(() => convert(fromMajor("100.00", "VES"), cero), InvalidAmountError);
  });

  test("la tasa se puede dar la vuelta sin cambiar de tasa", () => {
    const alReves = invertRate(TASA);
    assert.equal(alReves.from, "USD");
    assert.equal(alReves.to, "VES");
    // 1 USD son 228,41 Bs, que es exactamente lo que decía la tasa original.
    assert.equal(toMajor(convert(fromMajor("1.00", "USD"), alReves)), "228.41");
    assert.equal(toMajor(convert(fromMajor("11.02", "USD"), alReves)), "2517.08");
  });

  test("invertir dos veces devuelve la tasa original: no se pierde precisión", () => {
    const ida = invertRate(TASA);
    const vuelta = invertRate(ida);
    assert.deepEqual({ ...vuelta }, { ...TASA });
    // Y el importe sobrevive el viaje de ida y vuelta.
    assert.equal(toMajor(convert(convert(fromMajor("228.41", "VES"), TASA), ida)), "228.41");
  });

  test("una tasa de cero tampoco se puede invertir", () => {
    assert.throws(() => invertRate({ ...TASA, numerator: 0n }), InvalidAmountError);
    assert.throws(() => invertRate({ ...TASA, denominator: 0n }), InvalidAmountError);
  });

  test("no existe una versión sin tasa: convertir con «la tasa actual» es el bug de ADR-005", () => {
    // Comprobación de diseño: la única forma de convertir exige una tasa.
    assert.equal(typeof convert, "function");
    assert.equal(convert.length, 2);
  });
});

describe("reparto por mayor resto", () => {
  test("100 entre 3 da 34/33/33, no 33.33 tres veces", () => {
    const parts = allocate(fromMajor("1.00", "USD"), 3);
    assert.deepEqual(
      parts.map((p) => p.amount),
      [34n, 33n, 33n],
    );
  });

  test("PROPIEDAD: la suma de las partes es siempre el total", () => {
    const casos = ["0.01", "1.00", "17.53", "99.99", "1234.56"];
    for (const valor of casos) {
      for (let n = 1; n <= 9; n++) {
        const total = fromMajor(valor, "USD");
        const partes = allocate(total, n);
        assert.equal(
          sum(partes, "USD").amount,
          total.amount,
          `Se perdieron céntimos repartiendo ${valor} entre ${n}`,
        );
      }
    }
  });

  test("PROPIEDAD: el reparto por pesos también cuadra al céntimo", () => {
    const total = fromMajor("100.00", "USD");
    const pesos = [
      [1n, 1n, 1n],
      [7n, 3n],
      [1n, 2n, 3n, 4n],
      [5n],
      [1n, 1n, 1n, 1n, 1n, 1n, 1n],
    ];
    for (const p of pesos) {
      const partes = allocateByRatios(total, p);
      assert.equal(sum(partes, "USD").amount, total.amount);
      assert.equal(partes.length, p.length);
    }
  });

  test("reparte proporcionalmente al peso", () => {
    const partes = allocateByRatios(fromMajor("100.00", "USD"), [7n, 3n]);
    assert.deepEqual(
      partes.map((p) => toMajor(p)),
      ["70.00", "30.00"],
    );
  });

  test("un monto negativo (reversión) también cuadra", () => {
    const total = money(-100n, "USD");
    const partes = allocate(total, 3);
    assert.equal(sum(partes, "USD").amount, -100n);
  });

  test("rechaza un número de partes inválido", () => {
    assert.throws(() => allocate(fromMajor("1.00", "USD"), 0), InvalidAmountError);
    assert.throws(() => allocate(fromMajor("1.00", "USD"), 2.5), InvalidAmountError);
  });
});
