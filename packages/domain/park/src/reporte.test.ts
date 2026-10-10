/**
 * Pruebas del aforo pico del informe del parque — B11-6 (M-37).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { picoDeAforo } from "./reporte.ts";

const MIN = 60_000;

test("el aforo pico: el máximo a la vez y cuándo; quien sale cuando otro entra no se suma", () => {
  assert.equal(picoDeAforo([]), null);
  const t0 = Date.parse("2026-10-10T14:00:00Z");
  const pico = picoDeAforo([
    { desde: t0, hasta: t0 + 60 * MIN },
    { desde: t0 + 10 * MIN, hasta: t0 + 30 * MIN },
    { desde: t0 + 20 * MIN, hasta: t0 + 90 * MIN },
    // Entra justo cuando sale el segundo: no hay cuatro, hay tres.
    { desde: t0 + 30 * MIN, hasta: t0 + 40 * MIN },
  ]);
  assert.deepEqual(pico, { ninos: 3, en: t0 + 20 * MIN });
});
