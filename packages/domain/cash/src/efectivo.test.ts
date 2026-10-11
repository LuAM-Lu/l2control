import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { money } from "@l2/domain-money";
import { motivoDelTipo, movimientosDeEfectivo, pideAutorizacion, tallyShift, openingMovements } from "./index.ts";

/**
 * Mover efectivo (B3-21, M-38): cada tipo con sus motivos, todo retiro y lo que pase del tope piden el PIN de
 * supervisión, y la gaveta cuenta lo que se movió sin contarlo como venta.
 */
const usd = (minor: number) => money(BigInt(minor), "USD");
const ves = (minor: number) => money(BigInt(minor), "VES");
const TOPE = usd(2000);

describe("mover efectivo (B3-21)", () => {
  test("cada tipo con sus motivos: el adelanto es una salida; el resguardo, un retiro", () => {
    assert.equal(motivoDelTipo("SALIDA", "ADELANTO"), true);
    assert.equal(motivoDelTipo("ENTRADA", "COMPRAS"), false);
    assert.equal(motivoDelTipo("RETIRO", "RESGUARDO"), true);
    assert.equal(motivoDelTipo("SALIDA", "RESGUARDO"), false);
  });

  test("todo retiro y lo que pase del tope piden el PIN de supervisión; lo justo en el tope, no", () => {
    assert.equal(pideAutorizacion("RETIRO", usd(100), TOPE), true);
    assert.equal(pideAutorizacion("SALIDA", usd(2000), TOPE), false);
    assert.equal(pideAutorizacion("SALIDA", usd(2001), TOPE), true);
    assert.equal(pideAutorizacion("ENTRADA", usd(5000), TOPE), true);
  });

  test("la gaveta: la entrada suma, la salida resta, y nada de eso es lo cobrado", () => {
    const t = tallyShift([
      ...openingMovements([usd(5000), ves(0)]),
      ...movimientosDeEfectivo([
        { tipo: "ENTRADA", monto: usd(1000) },
        { tipo: "SALIDA", monto: usd(350) },
        { tipo: "RETIRO", monto: usd(4000) },
        { tipo: "SALIDA", monto: ves(120000) },
      ]),
    ]);
    const enDolares = t.drawer.find((d) => d.currency === "USD")!;
    assert.equal(enDolares.expected.amount, 5000n + 1000n - 350n - 4000n);
    assert.equal(enDolares.cashIn.amount, 1000n);
    assert.equal(enDolares.cashOut.amount, 4350n);
    assert.equal(t.drawer.find((d) => d.currency === "VES")!.expected.amount, -120000n);
    assert.ok(t.byMethod.every((m) => m.charged.amount === 0n), "no es venta");
  });
});
