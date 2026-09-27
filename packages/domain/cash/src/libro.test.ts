/**
 * Pruebas del libro de pagos — §5.5, F3-09, F3-10 (B2-3).
 *
 * Lo que fijan: un asiento nuevo solo es válido en la moneda de su medio y con su tasa; revertir
 * deja el original intacto y el saldo en cero; una reversión no se revierte ni un asiento se
 * revierte dos veces; y el saldo se suma con la tasa de cada asiento, no con la de hoy.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fromMajor, toMajor, zero, type FrozenRate } from "@l2/domain-money";
import { entryProblem, ledgerBalance, reversalOf, reversalProblem, type LedgerEntry } from "./libro.ts";

/** 855,6625 Bs/$ y 860,00 Bs/$, como las congela un asiento (de bolívares a dólares). */
const TASA_VIERNES: FrozenRate = { from: "VES", to: "USD", numerator: 8556625n, denominator: 10000n };
const TASA_LUNES: FrozenRate = { from: "VES", to: "USD", numerator: 860n, denominator: 1n };

let n = 0;
const asiento = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "method" | "amount">): LedgerEntry => ({
  id: `a${++n}`,
  kind: "COBRO",
  igtf: zero(p.amount.currency),
  rate: null,
  reversesId: null,
  ...p,
});

describe("un asiento nuevo (F3-09)", () => {
  test("positivo, en la moneda de su medio, con tasa solo si es en bolívares", () => {
    assert.equal(entryProblem({ kind: "COBRO", method: "EFECTIVO_USD", amount: fromMajor("5.00", "USD"), rate: null }), null);
    assert.equal(entryProblem({ kind: "COBRO", method: "PAGO_MOVIL", amount: fromMajor("4278.31", "VES"), rate: TASA_VIERNES }), null);
    assert.equal(entryProblem({ kind: "COBRO", method: "USDT", amount: fromMajor("5.00", "USDT"), rate: null }), null);
  });

  test("lo que no se asienta", () => {
    const casos: [Parameters<typeof entryProblem>[0], string][] = [
      [{ kind: "COBRO", method: "EFECTIVO_USD", amount: fromMajor("0.00", "USD"), rate: null }, "IMPORTE_NO_POSITIVO"],
      [{ kind: "COBRO", method: "EFECTIVO_USD", amount: fromMajor("-1.00", "USD"), rate: null }, "IMPORTE_NO_POSITIVO"],
      [{ kind: "COBRO", method: "ZELLE", amount: fromMajor("5.00", "VES"), rate: TASA_VIERNES }, "MONEDA_DEL_MEDIO"],
      [{ kind: "COBRO", method: "PAGO_MOVIL", amount: fromMajor("100.00", "VES"), rate: null }, "FALTA_TASA"],
      [{ kind: "COBRO", method: "EFECTIVO_USD", amount: fromMajor("5.00", "USD"), rate: TASA_VIERNES }, "TASA_SOBRANTE"],
      [{ kind: "VUELTO", method: "PAGO_MOVIL", amount: fromMajor("100.00", "VES"), rate: TASA_VIERNES }, "VUELTO_SOLO_EN_EFECTIVO"],
    ];
    for (const [e, problema] of casos) assert.equal(entryProblem(e), problema, problema);
  });
});

describe("revertir (F3-10)", () => {
  const original = asiento({ method: "EFECTIVO_USD", amount: fromMajor("5.80", "USD"), igtf: fromMajor("0.17", "USD") });

  test("la reversión es el mismo asiento con el signo contrario, apuntando al original", () => {
    const r = reversalOf(original);
    assert.equal(toMajor(r.amount), "-5.80");
    assert.equal(toMajor(r.igtf), "-0.17");
    assert.equal(r.method, "EFECTIVO_USD");
    assert.equal(r.reversesId, original.id);
    // El original no cambia.
    assert.equal(toMajor(original.amount), "5.80");
  });

  test("con la reversión, el saldo vuelve a cero y los dos asientos siguen ahí", () => {
    const libro = [original, { ...reversalOf(original), id: "rev" }];
    const b = ledgerBalance(libro, "USD");
    assert.equal(toMajor(b.collected), "0.00");
    assert.equal(toMajor(b.igtf), "0.00");
    assert.equal(libro.length, 2);
  });

  test("una reversión no se revierte, y un asiento no se revierte dos veces", () => {
    const rev: LedgerEntry = { ...reversalOf(original), id: "rev" };
    assert.equal(reversalProblem(original, [original]), null);
    assert.equal(reversalProblem(original, [original, rev]), "YA_REVERTIDO");
    assert.equal(reversalProblem(rev, [original, rev]), "ES_UNA_REVERSION");
  });

  test("la reversión en bolívares lleva la tasa congelada del original, no la de hoy", () => {
    const enBs = asiento({ method: "PAGO_MOVIL", amount: fromMajor("4278.31", "VES"), rate: TASA_VIERNES });
    assert.deepEqual(reversalOf(enBs).rate, TASA_VIERNES);
  });
});

describe("el saldo es la suma del libro (§5.5)", () => {
  test("pago mixto: cada asiento con SU tasa congelada", () => {
    const libro = [
      asiento({ method: "EFECTIVO_USD", amount: fromMajor("3.00", "USD") }),
      // 2,00 $ a 855,6625 y 1,00 $ a 860: dos cobros del mismo documento con tasas distintas.
      asiento({ method: "PAGO_MOVIL", amount: fromMajor("1711.33", "VES"), rate: TASA_VIERNES }),
      asiento({ method: "EFECTIVO_VES", amount: fromMajor("860.00", "VES"), rate: TASA_LUNES }),
    ];
    const b = ledgerBalance(libro, "USD");
    assert.equal(toMajor(b.collected), "6.00");
    assert.equal(toMajor(b.byCurrency.VES!), "2571.33");
    assert.equal(toMajor(b.byCurrency.USD!), "3.00");
  });

  test("el vuelto, la propina y el residuo son asientos que se restan de lo aplicado", () => {
    const libro = [
      asiento({ method: "EFECTIVO_USD", amount: fromMajor("20.00", "USD") }),
      asiento({ kind: "VUELTO", method: "EFECTIVO_VES", amount: fromMajor("1711.33", "VES"), rate: TASA_VIERNES }),
      asiento({ kind: "PROPINA", method: "EFECTIVO_USD", amount: fromMajor("1.00", "USD") }),
      asiento({ kind: "RESIDUO", method: "EFECTIVO_USD", amount: fromMajor("0.05", "USD") }),
    ];
    const b = ledgerBalance(libro, "USD");
    assert.equal(toMajor(b.collected), "20.00");
    assert.equal(toMajor(b.changeOut), "2.00");
    assert.equal(toMajor(b.applied), "16.95");
  });

  test("el USDT va a la par del dólar", () => {
    const b = ledgerBalance([asiento({ method: "USDT", amount: fromMajor("5.00", "USDT") })], "USD");
    assert.equal(toMajor(b.collected), "5.00");
  });
});
