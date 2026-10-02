/**
 * El historial de tasas por páginas (T-7, M-17) contra l2control_test: lo más reciente primero, en qué
 * quedó cada una (aplicada, por confirmar o no usada) con su cuenta, por par, la página que ya no
 * existe se ajusta y cada local ve lo suyo. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Jueves 1 de octubre de 2026, 11:00 am en Caracas. */
const AHORA = Date.parse("2026-10-01T15:00:00.000Z");
const DIA = 86_400_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba tasas por páginas");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba tasas por páginas B");
  const abigail = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const luis = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const admin: Contexto = await contextoDe(l, await crearEquipo(l, "Oficina"), abigail, "4826");
  const supervisor: Contexto = await contextoDe(l, await crearEquipo(l, "Supervisión"), luis, "5937");
  const tasa = (pair: string, value: string, effectiveDate: string) => ({ pair, value, source: "BCV", effectiveDate, valorVerificado: value });
  // El martes, supervisión deja una sin confirmar para ese día: su día pasa sin usarse.
  valor(await l.app.tasas.capturar(supervisor, tasa("USD/VES", "855.10", "2026-09-29"), AHORA - 2 * DIA));
  // Hoy, administración aplica las dos de hoy y supervisión deja la de mañana por confirmar.
  valor(await l.app.tasas.capturar(admin, tasa("USD/VES", "860.00", "2026-10-01"), AHORA));
  valor(await l.app.tasas.capturar(admin, tasa("USDT/VES", "870.00", "2026-10-01"), AHORA + 1000));
  valor(await l.app.tasas.capturar(supervisor, tasa("USD/VES", "865.00", "2026-10-02"), AHORA + 2000));
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("el historial de tasas por páginas", () => {
  test("lo más reciente primero, con lo que cuenta cada estado", async () => {
    const p = valor(await l.app.tasas.pagina(l.sistema, {}, AHORA + 5000));
    assert.deepEqual(p.tasas.map((t) => t.value), ["865.00", "870.00", "860.00", "855.10"]);
    assert.deepEqual(p.conteos, { TODAS: 4, APLICADAS: 2, POR_CONFIRMAR: 1, NO_USADAS: 1 });
  });

  test("por estado y por par", async () => {
    const pendientes = valor(await l.app.tasas.pagina(l.sistema, { filtro: "POR_CONFIRMAR" }, AHORA + 5000));
    assert.deepEqual(pendientes.tasas.map((t) => t.value), ["865.00"]);
    const noUsadas = valor(await l.app.tasas.pagina(l.sistema, { filtro: "NO_USADAS" }, AHORA + 5000));
    assert.deepEqual(noUsadas.tasas.map((t) => t.effectiveDate), ["2026-09-29"]);
    const usdt = valor(await l.app.tasas.pagina(l.sistema, { par: "USDT/VES" }, AHORA + 5000));
    assert.equal(usdt.total, 1);
    assert.deepEqual(usdt.conteos, { TODAS: 1, APLICADAS: 1, POR_CONFIRMAR: 0, NO_USADAS: 0 });
  });

  test("de diez en diez, y la página que ya no existe se ajusta", async () => {
    const p = valor(await l.app.tasas.pagina(l.sistema, { porPagina: 10, pagina: 3 }, AHORA + 5000));
    assert.equal(p.pagina, 1);
    assert.equal(p.tasas.length, 4);
    assert.equal((await l.app.tasas.pagina(l.sistema, { porPagina: 7 })).ok, false);
  });

  test("otro local no ve las tasas de este", async () => {
    assert.equal(valor(await otro.app.tasas.pagina(otro.sistema, {}, AHORA)).total, 0);
  });
});
