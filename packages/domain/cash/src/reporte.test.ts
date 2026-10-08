import { test } from "node:test";
import assert from "node:assert/strict";
import { money } from "@l2/domain-money";
import { cuadreConZ, diasDelPeriodo, enDolaresConSuTasa, origenDeCuenta, periodoPredefinido } from "./reporte.ts";

/** 190,50 Bs por dólar, de bolívares a dólares (como la deja `frozenRateOf`). */
const TASA = { from: "VES", to: "USD", numerator: 19050n, denominator: 100n } as const;

test("el origen es la cuenta en que se cobró", () => {
  assert.deepEqual(
    (["FAMILIA", "MESA", "MOSTRADOR", "EVENTO"] as const).map((k) => origenDeCuenta(k)),
    ["PARQUE", "RESTAURANTE", "MOSTRADOR", "CUMPLEANOS"],
  );
  assert.equal(origenDeCuenta("MOSTRADOR", true), "RESTAURANTE", "la cuenta de pie la abre el mesero");
});

test("cada asiento en dólares con su propia tasa; en bolívares sin tasa no se inventa", () => {
  assert.deepEqual(enDolaresConSuTasa(money(1250n, "USD"), null), money(1250n, "USD"));
  assert.deepEqual(enDolaresConSuTasa(money(500n, "USDT"), null), money(500n, "USD"));
  // 1.905,00 Bs a 190,50 son 10,00 $.
  assert.deepEqual(enDolaresConSuTasa(money(190_500n, "VES"), TASA), money(1000n, "USD"));
  assert.equal(enDolaresConSuTasa(money(190_500n, "VES"), null), null);
});

test("el cuadre con el Z: lo que no coincide, dicho; un medio en cero en uno y ausente en el otro cuadra", () => {
  const base = { cantidad: 3, anuladas: 1, total: money(4500n, "USD"), porMedio: new Map([["EFECTIVO_USD|USD", money(3000n, "USD")], ["PAGO_MOVIL|VES", money(285_750n, "VES")]]) };
  assert.deepEqual(cuadreConZ(base, { ...base, porMedio: new Map([...base.porMedio, ["ZELLE|USD", money(0n, "USD")]]) }), []);
  const otro = cuadreConZ(base, { ...base, cantidad: 4, porMedio: new Map([["EFECTIVO_USD|USD", money(2000n, "USD")]]) });
  assert.deepEqual(otro, ["ventas: 3 y el Z dice 4", "lo neto de EFECTIVO_USD en USD", "lo neto de PAGO_MOVIL en VES"]);
});

test("los periodos de un toque, desde el día del local", () => {
  // Jueves 8 de octubre de 2026.
  assert.deepEqual(periodoPredefinido("HOY", "2026-10-08"), { desde: "2026-10-08", hasta: "2026-10-08" });
  assert.deepEqual(periodoPredefinido("AYER", "2026-10-08"), { desde: "2026-10-07", hasta: "2026-10-07" });
  assert.deepEqual(periodoPredefinido("SEMANA", "2026-10-08"), { desde: "2026-10-05", hasta: "2026-10-08" });
  assert.deepEqual(periodoPredefinido("SEMANA", "2026-10-05"), { desde: "2026-10-05", hasta: "2026-10-05" }, "el lunes empieza la semana");
  assert.deepEqual(periodoPredefinido("MES", "2026-10-08"), { desde: "2026-10-01", hasta: "2026-10-08" });
  assert.deepEqual(periodoPredefinido("MES_ANTERIOR", "2026-10-08"), { desde: "2026-09-01", hasta: "2026-09-30" });
  assert.deepEqual(periodoPredefinido("MES_ANTERIOR", "2026-03-15"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(periodoPredefinido("AYER", "2027-01-01"), { desde: "2026-12-31", hasta: "2026-12-31" });
  assert.equal(diasDelPeriodo("2026-10-01", "2026-10-31"), 31);
  assert.equal(diasDelPeriodo("2026-10-08", "2026-10-08"), 1);
});
