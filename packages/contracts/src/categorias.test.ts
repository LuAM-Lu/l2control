import { test } from "node:test";
import assert from "node:assert/strict";
import { CategoriaCommandSchema } from "./categorias.ts";

const A = "0199a0c0-0000-7000-8000-0000000000a1";
const B = "0199a0c0-0000-7000-8000-0000000000a2";

test("crear, renombrar, unir y retirar una categoría (T-10)", () => {
  for (const c of [
    { kind: "CREAR", nombre: "Bebidas" },
    { kind: "RENOMBRAR", id: A, nombre: "Bebidas frías" },
    { kind: "UNIR", id: A, en: B },
    { kind: "RETIRAR", id: A },
  ]) {
    assert.equal(CategoriaCommandSchema.safeParse(c).success, true, c.kind);
  }
});

test("lo que no entra: un nombre corto o largo, unir una consigo misma, campos de más", () => {
  for (const c of [
    { kind: "CREAR", nombre: "B" },
    { kind: "CREAR", nombre: "Una categoría demasiado larga" },
    { kind: "UNIR", id: A, en: A },
    { kind: "RETIRAR", id: A, nombre: "Bebidas" },
    { kind: "BORRAR", id: A },
  ]) {
    assert.equal(CategoriaCommandSchema.safeParse(c).success, false, JSON.stringify(c));
  }
});
