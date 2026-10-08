import { test } from "node:test";
import assert from "node:assert/strict";
import { nombresConSabores, saboresDe } from "./sabores.ts";

test("los sabores de una lista tecleada: comas, saltos de línea o «y», sin repetir ni vacíos", () => {
  assert.deepEqual(saboresDe("Naranja, Manzana y Pera"), ["Naranja", "Manzana", "Pera"]);
  assert.deepEqual(saboresDe("Fresa\n  Mora ;; fresa,  Durazno  "), ["Fresa", "Mora", "Durazno"]);
  assert.deepEqual(saboresDe(" , ; "), []);
});

test("cada copia lleva la base y su sabor", () => {
  assert.deepEqual(nombresConSabores("Jugo ", "Naranja, Manzana"), ["Jugo Naranja", "Jugo Manzana"]);
  assert.deepEqual(nombresConSabores("", "Uva"), ["Uva"]);
});
