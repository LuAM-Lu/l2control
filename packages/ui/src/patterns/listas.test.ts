import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { esVista, letraDe, textoDeCargarMas, verLista } from "./listas.ts";

/** Las listas largas (T-22, M-38): lo buscado, el chip, los grupos y «Cargar más». */
type Producto = { nombre: string; categoria: string; agotado: boolean };
const productos: Producto[] = [
  { nombre: "Jugo de naranja", categoria: "Bebidas", agotado: false },
  { nombre: "Agua mineral", categoria: "Bebidas", agotado: true },
  { nombre: "Tequeños", categoria: "Carta", agotado: false },
  { nombre: "Jugo de piña", categoria: "Bebidas", agotado: false },
];
const coincide = (p: Producto, q: string) => p.nombre.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(q);
const chips = [
  { id: "todos", nombre: "Todos", filtro: () => true },
  { id: "agotados", nombre: "Agotados", filtro: (p: Producto) => p.agotado },
];

describe("las listas largas (T-22)", () => {
  test("lo buscado, sin acentos ni mayúsculas; cada chip cuenta lo que dejaría", () => {
    const r = verLista(productos, { buscado: "JUGO de piná", coincide, chips });
    assert.deepEqual(r.grupos[0]!.elementos.map((p) => p.nombre), ["Jugo de piña"]);
    const todos = verLista(productos, { buscado: "", coincide, chips, chip: "agotados" });
    assert.deepEqual(todos.cuentas, { todos: 4, agotados: 1 });
    assert.equal(todos.visibles, 1);
  });

  test("los grupos van en el orden en que aparecen, cada uno con lo suyo", () => {
    const r = verLista(productos, { grupo: (p) => p.categoria });
    assert.deepEqual(
      r.grupos.map((g) => [g.titulo, g.elementos.length]),
      [
        ["Bebidas", 3],
        ["Carta", 1],
      ],
    );
  });

  test("«Cargar más» dice cuántos van de cuántos y cuántos faltan", () => {
    assert.deepEqual(textoDeCargarMas(50, 2000), { boton: "Cargar más · 50 de 2.000", faltan: "Faltan 1.950" });
    assert.deepEqual(textoDeCargarMas(2000, 2000), { boton: null, faltan: "Son todos: 2.000" });
    assert.deepEqual(textoDeCargarMas(49, 50).faltan, "Falta 1");
  });

  test("la letra de un nombre: sin acento, con la Ñ en su sitio", () => {
    assert.deepEqual(["Ángela", "ñame", "Óscar", "luis", "3D"].map(letraDe), ["A", "Ñ", "O", "L", "#"]);
  });

  test("una vista se reconoce; lo demás, no", () => {
    assert.equal(esVista("COMPACTA"), true);
    assert.equal(esVista("tabla"), false);
  });
});
