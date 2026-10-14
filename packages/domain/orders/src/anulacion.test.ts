import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { VENTANA_SIN_PIN_MS, anularSinPin, pedidoRepetido } from "./index.ts";

/** Anular por estado (B3-25, M-39): la ventana sin PIN de quien pidió y el pedido repetido. */
const AHORA = 1_000_000_000;
const MIN = 60_000;

describe("anular por estado (B3-25)", () => {
  test("quien lo pidió lo anula sin PIN en sus primeros 2 minutos; después, o si es otra persona, con PIN", () => {
    const pedido = { porId: "emily", en: AHORA - MIN };
    assert.equal(anularSinPin(pedido, "emily", AHORA), true);
    assert.equal(anularSinPin({ ...pedido, en: AHORA - VENTANA_SIN_PIN_MS }, "emily", AHORA), true, "justo en el borde");
    assert.equal(anularSinPin({ ...pedido, en: AHORA - 5 * MIN }, "emily", AHORA), false);
    assert.equal(anularSinPin(pedido, "dietina", AHORA), false);
    assert.equal(anularSinPin({ porId: null, en: AHORA }, "emily", AHORA), false);
    assert.equal(anularSinPin(pedido, null, AHORA), false);
  });

  test("el mismo pedido de hace menos de 2 minutos se repite; otro, o más tarde, no", () => {
    const anterior = { lineas: [{ productId: "tenders", cantidad: 1 }, { productId: "smoothie", cantidad: 2 }], en: AHORA - 40_000 };
    assert.equal(pedidoRepetido([{ productId: "smoothie", cantidad: 1 }, { productId: "tenders", cantidad: 1 }, { productId: "smoothie", cantidad: 1 }], anterior, AHORA), true);
    assert.equal(pedidoRepetido([{ productId: "tenders", cantidad: 1 }], anterior, AHORA), false, "otros platos");
    assert.equal(pedidoRepetido(anterior.lineas, { ...anterior, en: AHORA - 3 * MIN }, AHORA), false, "fuera de la ventana");
    assert.equal(pedidoRepetido(anterior.lineas, null, AHORA), false);
  });
});
