/**
 * Las cuentas del cobro del recibo (B3-12): cada pago con su equivalente, lo pagado y el vuelto también en bolívares.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { money, type FrozenRate } from "@l2/domain-money";
import { cuentasDelCobro } from "./recibo.ts";

const usd = (c: bigint) => money(c, "USD");
const bs = (c: bigint) => money(c, "VES");
/** 874,73 Bs por dólar: 100 céntimos de dólar son 87.473 céntimos de bolívar. */
const A_BS: FrozenRate = { from: "USD", to: "VES", numerator: 100n, denominator: 87_473n };

describe("las cuentas del cobro del recibo", () => {
  test("un pago exacto en dólares: no hace falta decir «Pagado»", () => {
    const c = cuentasDelCobro({ total: usd(580n), pagos: [{ medio: "Efectivo $", pagado: usd(580n), referencia: null }], sobra: null, aBolivares: null });
    assert.equal(c.diceElPagado, false);
    assert.deepEqual(c.pagado, usd(580n));
    assert.deepEqual(c.diferencia, usd(0n));
    assert.equal(c.totalEnBolivares, null);
  });

  test("con vuelto: lo pagado menos el vuelto es el total", () => {
    const c = cuentasDelCobro({
      total: usd(580n),
      pagos: [{ medio: "Efectivo $", pagado: usd(5000n), referencia: null }],
      sobra: { monto: usd(4420n), destino: "VUELTO" },
      aBolivares: null,
    });
    assert.equal(c.diceElPagado, true);
    assert.deepEqual(c.diferencia, usd(0n));
    assert.equal(c.sobra?.enBolivares, null);
  });

  test("mixto: el pago en bolívares lleva su equivalente en dólares y todo suma el total", () => {
    const c = cuentasDelCobro({
      total: usd(1160n),
      pagos: [
        { medio: "Efectivo $", pagado: usd(1000n), referencia: null },
        { medio: "Pago Móvil", pagado: bs(139_957n), referencia: "****1234" },
      ],
      sobra: null,
      aBolivares: A_BS,
    });
    assert.equal(c.pagos[0]!.enFuncional, null);
    assert.deepEqual(c.pagos[1]!.enFuncional, usd(160n));
    assert.deepEqual(c.pagado, usd(1160n));
    assert.deepEqual(c.diferencia, usd(0n));
    assert.deepEqual(c.totalEnBolivares, bs(1_014_687n));
  });

  test("el vuelto también en bolívares, a la tasa del cobro", () => {
    const c = cuentasDelCobro({
      total: usd(580n),
      pagos: [{ medio: "Efectivo $", pagado: usd(1000n), referencia: null }],
      sobra: { monto: usd(420n), destino: "VUELTO" },
      aBolivares: A_BS,
    });
    assert.deepEqual(c.sobra?.enBolivares, bs(367_387n));
  });

  test("un pago en bolívares sin la tasa del cobro no se suma a ciegas", () => {
    assert.throws(() => cuentasDelCobro({ total: usd(100n), pagos: [{ medio: "Pago Móvil", pagado: bs(87_473n), referencia: null }], sobra: null, aBolivares: null }), /tasa/);
  });
});
