/**
 * Los recorridos guiados que vio cada persona, contra l2control_test — T-12 (M-27).
 *
 * Lo que fijan: se guarda por persona (otra persona en el mismo equipo no lo hereda); volver a verlo no añade otra
 * fila; una versión nueva del recorrido se cuenta aparte; sin persona no se guarda; un nombre de recorrido que no es
 * válido se rechaza. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-07T14:00:00.000Z");

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let ana: Contexto;
let marisol: Contexto;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba recorridos");
  const equipo = await crearEquipo(l, "Entrada");
  ana = await contextoDe(l, equipo, await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" }), "6284");
  marisol = await contextoDe(l, equipo, await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" }), "7391");
});

after(async () => {
  await l.cerrar();
});

describe("recorridos vistos", () => {
  test("se guarda por persona: en el mismo equipo, otra persona no lo hereda", async () => {
    const r = valor(await l.app.recorridos.marcar(ana, { recorrido: "entrada", version: 1, completo: true }, AHORA));
    assert.deepEqual(r.vistos, [{ recorrido: "entrada", version: 1 }]);
    assert.deepEqual(valor(await l.app.recorridos.vistos(marisol)).vistos, []);
  });

  test("volver a verlo no añade otra fila; una versión nueva se cuenta aparte", async () => {
    valor(await l.app.recorridos.marcar(ana, { recorrido: "entrada", version: 1, completo: false }, AHORA + 1000));
    const r = valor(await l.app.recorridos.marcar(ana, { recorrido: "entrada", version: 2, completo: false }, AHORA + 2000));
    assert.deepEqual(r.vistos, [{ recorrido: "entrada", version: 1 }, { recorrido: "entrada", version: 2 }]);
  });

  test("sin persona no se guarda, y un nombre que no es de un recorrido se rechaza", async () => {
    assert.equal((await l.app.recorridos.marcar(l.sistema, { recorrido: "entrada", version: 1, completo: true }, AHORA)).ok, false);
    const r = await l.app.recorridos.marcar(ana, { recorrido: "Entrada <script>", version: 1, completo: true }, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });
});
