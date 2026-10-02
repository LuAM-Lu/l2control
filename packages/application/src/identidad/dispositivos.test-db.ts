/**
 * Los equipos por páginas (T-7, M-17) contra l2control_test: primero los pendientes y luego los más
 * nuevos, filtros por estado y «con sesión» con su cuenta, búsqueda por nombre o código, la página que
 * ya no existe se ajusta, el permiso y el aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { leerCredencial } from "./credenciales.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let cajera: Contexto;
let pendiente: string;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba equipos");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba equipos B");
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  // Doce aprobados (uno con sesión abierta), uno revocado y uno pendiente.
  for (let i = 1; i <= 11; i++) await crearEquipo(l, `Tablet ${String(i).padStart(2, "0")}`);
  cajera = await contextoDe(l, await crearEquipo(l, "Caja principal"), marisol, "7391");
  const viejo = await crearEquipo(l, "Laptop vieja");
  valor(await l.app.dispositivos.ordenar(l.sistema, { kind: "REVOCAR", deviceId: leerCredencial(viejo)!.id, reason: "Se dañó la pantalla del equipo" }));
  const r = valor(await l.app.dispositivos.solicitar(l.sistema, "Teléfono monitora", "10.7.7.7"));
  pendiente = leerCredencial(r.credencial)!.id;
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("los equipos por páginas", () => {
  test("primero el pendiente, luego los más nuevos; con lo que cuenta cada filtro", async () => {
    const p = valor(await l.app.dispositivos.pagina(l.sistema, { porPagina: 10 }));
    assert.equal(p.total, 14);
    assert.equal(p.dispositivos.length, 10);
    assert.equal(p.dispositivos[0]!.label, "Teléfono monitora");
    assert.equal(p.dispositivos[0]!.id, pendiente);
    assert.equal(p.dispositivos.at(-1)!.status, "APROBADO");
    assert.deepEqual(p.conteos, { TODOS: 14, PENDIENTES: 1, APROBADOS: 12, REVOCADOS: 1, EN_SESION: 1 });
  });

  test("la segunda página trae el resto, con el revocado al final", async () => {
    const p = valor(await l.app.dispositivos.pagina(l.sistema, { porPagina: 10, pagina: 2 }));
    assert.equal(p.pagina, 2);
    assert.equal(p.dispositivos.length, 4);
    assert.equal(p.dispositivos.at(-1)!.label, "Laptop vieja");
  });

  test("una página que ya no existe se ajusta a la última", async () => {
    const p = valor(await l.app.dispositivos.pagina(l.sistema, { porPagina: 50, pagina: 9 }));
    assert.equal(p.pagina, 1);
    assert.equal(p.dispositivos.length, 14);
  });

  test("por estado, con sesión abierta y por nombre o código", async () => {
    assert.deepEqual(valor(await l.app.dispositivos.pagina(l.sistema, { filtro: "REVOCADOS" })).dispositivos.map((d) => d.label), ["Laptop vieja"]);
    const enSesion = valor(await l.app.dispositivos.pagina(l.sistema, { filtro: "EN_SESION" }));
    assert.deepEqual(enSesion.dispositivos.map((d) => [d.label, d.session?.userName]), [["Caja principal", "Marisol Prieto"]]);
    const tablets = valor(await l.app.dispositivos.pagina(l.sistema, { busqueda: "tablet 0" }));
    assert.equal(tablets.total, 9);
    assert.equal(tablets.conteos.PENDIENTES, 0);
    const porCodigo = valor(await l.app.dispositivos.pagina(l.sistema, { busqueda: enSesion.dispositivos[0]!.pairingCode.toLowerCase() }));
    assert.deepEqual(porCodigo.dispositivos.map((d) => d.label), ["Caja principal"]);
  });

  test("lo que no es una página válida se rechaza", async () => {
    const r = await l.app.dispositivos.pagina(l.sistema, { porPagina: 15 });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("la caja no ve los equipos; otro local, solo los suyos", async () => {
    const r = await l.app.dispositivos.pagina(cajera, {});
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    assert.equal(valor(await otro.app.dispositivos.pagina(otro.sistema, {})).total, 0);
  });
});
