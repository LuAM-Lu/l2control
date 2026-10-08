/**
 * El plano del local en el servidor, contra l2control_test — B6-1, F6-01, F6-02 (I-05).
 *
 * Sin plano no se inventan mesas; permiso con elevación y a nombre de una persona; versión optimista;
 * una mesa no se borra, se retira, a la hora del servidor, y con su cuenta abierta no se retira; la
 * retirada ya no abre cuentas; auditoría con su evento en vivo y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { DiningTableDto, PlanoLocalDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import { abrirLocalDePrueba, clienteDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-02T15:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let admin: Contexto;
let adminSinElevar: Contexto;
let mesero: Contexto;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba plano");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba plano B");
  const abigail = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  admin = await contextoElevado(l, await crearEquipo(l, "Oficina"), { id: abigail, nombre: "Abigail Karam", pin: "4826" });
  adminSinElevar = await contextoDe(l, await crearEquipo(l, "Oficina 2"), abigail, "4826");
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

const mesa = (n: number, extra: Partial<DiningTableDto> = {}): DiningTableDto => ({
  id: `mesa-${n}`,
  label: String(n),
  zone: "Salón",
  seats: 4,
  shape: "REDONDA",
  x: 100 + (n - 1) * 150,
  y: 200,
  width: 80,
  height: 80,
  rotation: 0,
  ...extra,
});
const plano = (tables: DiningTableDto[]): PlanoLocalDto => ({
  width: 800,
  height: 400,
  tables,
  fixtures: [{ id: "caja", kind: "CAJA", x: 600, y: 0, width: 200, height: 80, label: "Caja" }],
});
const leer = (local: LocalDePrueba = l) => local.app.plano.leer(local.sistema);
const publicar = (ctx: Contexto, p: PlanoLocalDto, sobre: number | null, ahora = AHORA) => l.app.plano.publicar(ctx, { plano: p, sobre }, ahora);
const asientos = (local: LocalDePrueba) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "plano.publicar" }, orderBy: { occurredAt: "asc" } }));

describe("sin publicar", () => {
  test("el local no tiene plano: no se inventan mesas", async () => {
    const v = await leer();
    assert.equal(v.plano, null);
    assert.equal(v.version, null);
    assert.equal(v.publicadoPor, null);
  });
});

describe("publicar", () => {
  test("el mesero no puede, y el intento queda en la auditoría", async () => {
    const r = await publicar(mesero, plano([mesa(1)]), null);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO", JSON.stringify(r));
    assert.equal((await asientos(l)).filter((a) => a.outcome === "NEGADO").length, 1);
  });

  test("administración sin confirmar su identidad tiene que elevar (F2-04)", async () => {
    const r = await publicar(adminSinElevar, plano([mesa(1)]), null);
    assert.equal(!r.ok && r.motivo, "ELEVACION_REQUERIDA", JSON.stringify(r));
  });

  test("la consola no dibuja planos: cada versión dice qué persona la publicó", async () => {
    const r = await publicar(l.sistema, plano([mesa(1)]), null);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO", JSON.stringify(r));
  });

  test("el servidor revalida la geometría: dos mesas encimadas no se publican", async () => {
    const r = await publicar(admin, plano([mesa(1), mesa(2, { x: 120 })]), null);
    assert.equal(!r.ok && r.motivo, "INVALIDO", JSON.stringify(r));
    assert.equal((await leer()).plano, null);
  });

  test("administración elevada publica la versión 1, a su nombre, y es la que rige", async () => {
    const r = valor(await publicar(admin, plano([mesa(1), mesa(2), mesa(3)]), null));
    assert.equal(r.version, 1);
    assert.equal(r.publicadoPor, "Abigail Karam");
    assert.equal(r.publicadoEn, new Date(AHORA).toISOString());
    const v = await leer();
    assert.equal(v.version, 1);
    assert.deepEqual(v.plano?.tables.map((m) => m.label), ["1", "2", "3"]);
  });

  test("el asiento dice cómo quedó el salón, y el cambio sale en vivo con su tema", async () => {
    const hecho = (await asientos(l)).filter((a) => a.outcome === "HECHO").at(-1)!;
    assert.deepEqual((hecho.after as { mesas: string[] }).mesas, ["1", "2", "3"]);
    const eventos = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.outboxEvent.findMany({ where: { action: "plano.publicar" } }));
    assert.equal(eventos.length, 1);
    assert.ok(temasDe("plano.publicar").includes("plano"));
  });

  test("sobre una versión que ya no es la vigente, CONFLICTO y no se guarda nada", async () => {
    const r = await publicar(admin, plano([mesa(1)]), null);
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.equal((await leer()).version, 1);
  });

  test("publicar lo mismo no añade versión", async () => {
    const r = valor(await publicar(admin, plano([mesa(1), mesa(2), mesa(3)]), 1));
    assert.equal(r.version, 1);
  });
});

describe("una mesa no se borra: se retira", () => {
  test("quitarla del plano se niega", async () => {
    const r = await publicar(admin, plano([mesa(1), mesa(2)]), 1);
    assert.equal(!r.ok && r.motivo, "INVALIDO", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /La mesa 3 no se borra/);
  });

  test("con su cuenta abierta no se retira; las demás, sí", async () => {
    await sentarDePrueba(l, mesero, "mesa-2", AHORA);
    const r = await publicar(admin, plano([mesa(1), mesa(2, { retiredAt: new Date(AHORA).toISOString() }), mesa(3)]), 1);
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /La mesa 2 tiene su cuenta abierta/);
  });

  test("la hora de retirarla la pone el servidor, y no cambia en las versiones siguientes", async () => {
    const delNavegador = "2020-01-01T00:00:00.000Z";
    const v2 = valor(await publicar(admin, plano([mesa(1), mesa(2), mesa(3, { retiredAt: delNavegador })]), 1, AHORA + MIN));
    const retirada = v2.plano!.tables.find((m) => m.id === "mesa-3")!;
    assert.equal(retirada.retiredAt, new Date(AHORA + MIN).toISOString());
    // Otra versión (la mesa 1 cambia de sillas) con la retirada a otra hora: se queda la primera.
    const v3 = valor(await publicar(admin, plano([mesa(1, { seats: 6 }), mesa(2), mesa(3, { retiredAt: delNavegador })]), 2, AHORA + 5 * MIN));
    assert.equal(v3.version, 3);
    assert.equal(v3.plano!.tables.find((m) => m.id === "mesa-3")!.retiredAt, new Date(AHORA + MIN).toISOString());
  });

  test("una mesa retirada no abre cuenta; su número queda libre para otra", async () => {
    const r = await l.app.mesas.abrir(mesero, { cuentaId: randomUUID(), tableId: "mesa-3", cliente: clienteDePrueba(), comensales: 2, vistas: 0 }, AHORA);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_FUERA_DEL_PLANO", JSON.stringify(r));
    const v = await leer();
    const conOtraTres = plano([...v.plano!.tables, mesa(4, { label: "3" })]);
    assert.equal(valor(await publicar(admin, conOtraTres, 3)).version, 4);
  });
});

describe("aislamiento", () => {
  test("otro local no ve el plano de este ni sus asientos", async () => {
    assert.equal((await leer(otro)).plano, null);
    assert.deepEqual(await asientos(otro), []);
  });

  test("se publica en la sucursal de la sesión: la otra sigue sin plano", async () => {
    const deLaOtra = await l.app.plano.leer({ ...l.sistema, branchId: l.otraSucursal });
    assert.equal(deLaOtra.plano, null);
  });
});
