import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTER_CATEGORIES, categoryProblem, cleanCategory, findCategory } from "./categorias.ts";
import { nameKey } from "./catalogo.ts";

test("las de arranque caben en el nombre de una categoría y no se repiten", () => {
  assert.ok(STARTER_CATEGORIES.length >= 8);
  for (const c of STARTER_CATEGORIES) assert.equal(categoryProblem(c), null, c);
  assert.equal(new Set(STARTER_CATEGORIES.map(nameKey)).size, STARTER_CATEGORIES.length);
});

test("el nombre se limpia y tiene de 2 a 24 caracteres", () => {
  assert.equal(cleanCategory("  Bebidas   frías "), "Bebidas frías");
  assert.equal(categoryProblem(" B "), "CORTA");
  assert.equal(categoryProblem("Una categoría demasiado larga"), "LARGA");
  assert.equal(categoryProblem("Té"), null);
});

test("una categoría escrita con otras mayúsculas, acentos o espacios es la misma", () => {
  const lista = [{ name: "Bebidas" }, { name: "Cafés" }];
  assert.equal(findCategory(lista, "  bebidas ")?.name, "Bebidas");
  assert.equal(findCategory(lista, "CAFES")?.name, "Cafés");
  assert.equal(findCategory(lista, "Bebida"), undefined);
});
