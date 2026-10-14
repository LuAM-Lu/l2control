import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { paqueteQueCubre, paquetesParaPagarAntes } from "./index.ts";

/** Pagar el parque antes de salir (B4-19, M-39): el paquete que se sugiere. */
const MIN = 60_000;
const p30 = { name: "30 minutos", duration: { kind: "fixed", minutes: 30 } } as const;
const p60 = { name: "1 hora", duration: { kind: "fixed", minutes: 60 } } as const;
const abierto = { name: "Tiempo abierto", duration: { kind: "openEnded" } } as const;

describe("pagar el parque antes de salir (B4-19)", () => {
  test("se ofrecen los de tiempo fijo, del más corto al más largo", () => {
    assert.deepEqual(paquetesParaPagarAntes([p60, abierto, p30]).map((p) => p.name), ["30 minutos", "1 hora"]);
  });

  test("sugiere el más chico que cubre lo que lleva, con la gracia; si ninguno alcanza, el mayor", () => {
    const tarifa = [p60, p30, abierto];
    assert.equal(paqueteQueCubre(tarifa, 20 * MIN, 5)?.name, "30 minutos");
    assert.equal(paqueteQueCubre(tarifa, 34 * MIN, 5)?.name, "30 minutos", "34 min con 5 de gracia: 29");
    assert.equal(paqueteQueCubre(tarifa, 40 * MIN, 5)?.name, "1 hora");
    assert.equal(paqueteQueCubre(tarifa, 90 * MIN, 5)?.name, "1 hora", "ninguno alcanza: el mayor");
    assert.equal(paqueteQueCubre([abierto], 20 * MIN, 5), null);
  });
});
