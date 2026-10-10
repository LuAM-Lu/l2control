/**
 * Los puestos por uso, contra l2control_test — T-20 (M-37, U-14).
 *
 * Lo que fijan: cada puesto toma su llegada y su última actividad de la auditoría del día; lo que se hizo dice de qué
 * puesto es (administración abriendo la caja ocupa la caja), y entrar sin hacer nada cuenta para el puesto del equipo
 * (el punto de cobro) o del rol; la cuenta de soporte no ocupa puestos; y se dice desde cuándo está abierta la caja.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let local: LocalDePrueba;
let admin: Contexto;
let monitora: Contexto;
let cajera: Contexto;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const delDia = async (ctx: Contexto) => valor(await local.app.puestos.delDia(ctx));
const puesto = async (ctx: Contexto, p: "CAJA" | "PARQUE" | "MESAS") => (await delDia(ctx)).puestos.find((x) => x.puesto === p)!;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Los puestos");
  const a = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const m = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const c = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  admin = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "4826");
  monitora = await contextoDe(local, await crearEquipo(local, "Entrada", true, false), m, "6284");
  cajera = await contextoDe(local, await crearEquipo(local, "Caja 2"), c, "7391");
});

after(async () => {
  await local.cerrar();
});

describe("los puestos, por uso (T-20)", () => {
  test("entrar cuenta para el puesto del equipo o del rol; la oficina no ocupa ninguno", async () => {
    const d = await delDia(admin);
    assert.equal(d.cajaAbiertaDesde, null, "sin turno abierto");
    const caja = d.puestos.find((p) => p.puesto === "CAJA")!;
    // Abigail entró en «Caja 1», que es punto de cobro: la caja la ocupa ella, aunque sea de administración.
    assert.equal(caja.primera?.quien, "Abigail Karam");
    assert.equal(caja.ultima?.quien, "Marisol Prieto", "y después entró Marisol en «Caja 2»");
    assert.equal(caja.ultima?.equipo, "Caja 2");
    const parque = d.puestos.find((p) => p.puesto === "PARQUE")!;
    assert.equal(parque.primera?.quien, "Ana Rojas", "la monitora en un equipo que no es de cobro: el parque, por su rol");
    assert.equal(d.puestos.find((p) => p.puesto === "MESAS")!.ultima, null);
  });

  test("lo que se hizo dice de qué puesto es: abrir el turno es de la caja; y la caja dice desde cuándo está abierta", async () => {
    const FONDO = { fondos: [{ currency: "USD", amount: usd("1000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
    const t = valor(await local.app.turnos.abrir(admin, FONDO));
    const d = await delDia(admin);
    assert.equal(d.cajaAbiertaDesde, t.abiertoEn);
    assert.equal(d.puestos.find((p) => p.puesto === "CAJA")!.ultima?.quien, "Abigail Karam");
  });

  test("la cuenta de soporte no ocupa puestos, y lo lee quien ve la sucursal", async () => {
    const s = await crearPersona(local, { nombre: "Soporte Técnico", role: "ADMIN", pin: "3141" });
    await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.update({ where: { id: s }, data: { supportLogin: "soporte-puestos" } }));
    await contextoDe(local, await crearEquipo(local, "Soporte"), s, "3141");
    assert.notEqual((await puesto(admin, "CAJA")).ultima?.quien, "Soporte Técnico");
    const r = await local.app.puestos.delDia(monitora);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    void cajera;
  });
});
