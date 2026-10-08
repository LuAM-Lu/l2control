/**
 * Las actualizaciones del sistema contra l2control_test — T-8b, ADR-028, M-25.
 *
 * Las versiones disponibles las escribe el actualizador del servidor; aquí se escriben como él. Corre con
 * `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { compararVersiones } from "./actualizaciones.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const PRODUCCION = { enMarcha: "0.57.0", automatico: false };

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinConfirmar: Contexto;
let ctxCajera: Contexto;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const FONDO = { fondos: [{ currency: "USD", amount: { minor: "0", currency: "USD" } }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };

/** Lo que haría el actualizador del servidor al ver una versión publicada. */
const publicar = (version: string, notas = `- Novedades de la ${version}`) =>
  local.base.conTenant(local.sistema.tenantId, (tx) =>
    tx.systemRelease.create({ data: { tenantId: local.sistema.tenantId, version, publishedAt: new Date(AHORA - 60_000), notes: notas } }),
  );

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Actualizaciones");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinConfirmar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  for (const v of ["0.56.0", "0.57.0", "0.58.0", "0.57.10"]) await publicar(v);
});

after(async () => {
  await local.cerrar();
});

test("las versiones se comparan número a número", () => {
  assert.ok(compararVersiones("0.57.10", "0.57.9") > 0);
  assert.ok(compararVersiones("0.58.0", "0.57.10") > 0);
  assert.equal(compararVersiones("1.0.0", "1.0.0"), 0);
  assert.ok(compararVersiones("0.9.0", "0.10.0") < 0);
});

describe("ver y pedir una actualización", () => {
  test("se ofrecen solo las más nuevas que la que está en marcha, de la más nueva a la más vieja", async () => {
    const e = valor(await local.app.actualizaciones.estado(ctxAdminSinConfirmar, PRODUCCION, AHORA));
    assert.deepEqual(e.disponibles.map((v) => v.version), ["0.58.0", "0.57.10"]);
    assert.equal(e.pendiente, null);
    assert.deepEqual(e.ocupado, { turnosAbiertos: 0, ninosEnSala: 0 });
  });

  test("es de administración: la caja no la ve; pedirla exige confirmar la identidad", async () => {
    const caja = await local.app.actualizaciones.estado(ctxCajera, PRODUCCION, AHORA);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
    const sin = await local.app.actualizaciones.pedir(ctxAdminSinConfirmar, { version: "0.58.0", cuando: "AHORA" }, PRODUCCION, AHORA);
    assert.equal(!sin.ok && sin.motivo, "ELEVACION_REQUERIDA");
  });

  test("ahora, sin nada abierto: queda pedida, una a la vez, y se puede cancelar mientras espera", async () => {
    const e = valor(await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.58.0", cuando: "AHORA" }, PRODUCCION, AHORA));
    assert.deepEqual([e.pendiente?.version, e.pendiente?.estado, e.pendiente?.modo, e.pendiente?.desde, e.pendiente?.pedidaPor], ["0.58.0", "PEDIDA", "AHORA", "0.57.0", "Abigail Karam"]);
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "sistema.actualizar", entityId: e.pendiente!.id } }));
    assert.ok(asiento);
    const otra = await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.57.10", cuando: "AL_CIERRE" }, PRODUCCION, AHORA);
    assert.equal(!otra.ok && otra.motivo, "CONFLICTO");
    const c = valor(await local.app.actualizaciones.cancelar(ctxAdmin, { id: e.pendiente!.id }, PRODUCCION, AHORA));
    assert.equal(c.pendiente, null);
    assert.deepEqual([c.historial[0]?.estado, c.historial[0]?.version], ["CANCELADA", "0.58.0"]);
    const otraVez = await local.app.actualizaciones.cancelar(ctxAdmin, { id: e.pendiente!.id }, PRODUCCION, AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
  });

  test("con un turno abierto, «ahora» no; «al cierre», sí", async () => {
    valor(await local.app.turnos.abrir(ctxCajera, FONDO, undefined, AHORA - 60_000));
    const e = valor(await local.app.actualizaciones.estado(ctxAdmin, PRODUCCION, AHORA));
    assert.equal(e.ocupado.turnosAbiertos, 1);
    const ahora = await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.58.0", cuando: "AHORA" }, PRODUCCION, AHORA);
    assert.match(!ahora.ok ? ahora.mensaje : "", /1 turno abierto.*Al cierre/);
    const cierre = valor(await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.58.0", cuando: "AL_CIERRE" }, PRODUCCION, AHORA));
    assert.equal(cierre.pendiente?.modo, "AL_CIERRE");
    valor(await local.app.actualizaciones.cancelar(ctxAdmin, { id: cierre.pendiente!.id }, PRODUCCION, AHORA));
  });

  test("lo que no se pide: una versión que no está publicada, una que no es más nueva, en staging", async () => {
    const desconocida = await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.99.0", cuando: "AL_CIERRE" }, PRODUCCION, AHORA);
    assert.equal(!desconocida.ok && desconocida.motivo, "INVALIDO");
    const vieja = await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.56.0", cuando: "AL_CIERRE" }, PRODUCCION, AHORA);
    assert.equal(!vieja.ok && vieja.motivo, "INVALIDO");
    const staging = await local.app.actualizaciones.pedir(ctxAdmin, { version: "0.58.0", cuando: "AL_CIERRE" }, { enMarcha: "0.57.0", automatico: true }, AHORA);
    assert.equal(!staging.ok && staging.motivo, "CONFLICTO");
  });

  test("la base no deja dos pedidas a la vez ni una terminada sin su hora", async () => {
    const otra = local.base.conTenant(local.sistema.tenantId, async (tx) => {
      await tx.systemUpdate.create({ data: { tenantId: local.sistema.tenantId, version: "0.58.0", mode: "AUTOMATICA", state: "PEDIDA" } });
      await tx.systemUpdate.create({ data: { tenantId: local.sistema.tenantId, version: "0.58.0", mode: "AUTOMATICA", state: "PEDIDA" } });
    });
    await assert.rejects(otra);
    const sinHora = local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.systemUpdate.create({ data: { tenantId: local.sistema.tenantId, version: "0.58.0", mode: "AUTOMATICA", state: "HECHA" } }),
    );
    await assert.rejects(sinHora);
  });
});
