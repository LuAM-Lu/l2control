/** Notas rápidas del mesero (B6-12): las más escritas, sin mayúsculas ni espacios de más, y las de la categoría. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { claveDeNota, conNotaRapida, notasSugeridas } from "./index.ts";

describe("notas rápidas", () => {
  test("las más escritas para el producto, iguales sin mayúsculas ni espacios de más, en su forma más escrita", () => {
    const notas = ["sin cebolla", "Sin  cebolla", "sin cebolla ", "bien cocida", "Bien cocida", "sin salsa", "SIN CEBOLLA"];
    const s = notasSugeridas(notas, []);
    assert.equal(s[0], "sin cebolla", "4 veces, y su forma más escrita");
    assert.equal(claveDeNota(s[1]!), "bien cocida");
    assert.equal(s[2], "sin salsa");
    assert.equal(s.length, 3);
  });

  test("hasta 5; con pocas, completa con las de su categoría sin repetir", () => {
    const propias = ["sin hielo", "sin hielo", "con limón"];
    const categoria = ["Sin hielo", "bien fría", "bien fría", "sin azúcar", "con pitillo", "light", "x"];
    assert.deepEqual(notasSugeridas(propias, categoria), ["sin hielo", "con limón", "bien fría", "sin azúcar", "con pitillo"]);
    const muchas = ["a", "b", "c", "d", "e", "f"];
    assert.equal(notasSugeridas(muchas, categoria).length, 5);
    assert.deepEqual(notasSugeridas([], []), []);
    assert.deepEqual(notasSugeridas(["  ", ""], []), []);
  });

  test("un toque la añade a lo escrito, que se queda; una que ya está no se repite", () => {
    assert.equal(conNotaRapida("", "sin cebolla"), "sin cebolla");
    assert.equal(conNotaRapida("para el niño", "sin cebolla"), "para el niño, sin cebolla");
    assert.equal(conNotaRapida("Sin cebolla", "sin  cebolla"), "Sin cebolla");
    assert.equal(conNotaRapida("x".repeat(78), "sin sal").length, 80);
  });
});
