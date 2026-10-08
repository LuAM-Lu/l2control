/**
 * Editar en lote contra l2control_test — B9-9 (M-29).
 *
 * Con reloj fijo (jueves 8 de octubre de 2026, 2:00 pm en Caracas). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T18:00:00.000Z");
const HOY = "2026-10-08";
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxSinElevar: Contexto;
let ctxCajera: Contexto;
const ids: Record<string, string> = {};

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const lote = (nombres: string[], cambio: Record<string, unknown>, ctx: Contexto = ctxAdmin, ahora = AHORA) =>
  local.app.productos.editarEnLote(ctx, { productIds: nombres.map((n) => ids[n]!), cambio }, ahora);
const de = (c: CatalogoDto, nombre: string) => c.productos.find((p) => p.nombre === nombre)!;
const precioHoy = (c: CatalogoDto, nombre: string) => {
  const p = de(c, nombre);
  return [...p.precios].reverse().find((x) => Date.parse(x.desde) <= AHORA)!.precio.minor;
};

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Editar en lote");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const equipo = await crearEquipo(local, "Oficina");
  ctxAdmin = await contextoElevado(local, equipo, { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxSinElevar = await contextoDe(local, await crearEquipo(local, "Depósito"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  for (const [nombre, categoria, tipo, precioMinor] of [
    ["Refresco", "Bebidas", "PRODUCTO", "150"],
    ["Malta", "Bebidas", "PRODUCTO", "175"],
    ["Galleta", "Chucherías", "PRODUCTO", "100"],
    ["Café", "Bebidas", "PREPARADO", "120"],
  ] as const) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo, precioMinor } }, AHORA - 60 * MIN));
    ids[nombre] = de(c, nombre).id;
  }
});

after(async () => {
  await local.cerrar();
});

describe("editar en lote (B9-9)", () => {
  test("la categoría de varios a la vez, cada uno con su asiento", async () => {
    const c = valor(await lote(["Refresco", "Malta"], { kind: "CATEGORIA", categoria: "Gaseosas" }));
    assert.deepEqual([de(c, "Refresco").categoria, de(c, "Malta").categoria, de(c, "Galleta").categoria], ["Gaseosas", "Gaseosas", "Chucherías"]);
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "producto.editar", reason: "Editado en lote" }, select: { entityId: true } }),
    );
    assert.deepEqual(asientos.map((a) => a.entityId).sort(), [ids.Refresco, ids.Malta].sort());
  });

  test("el precio en por ciento desde hoy, redondeado al céntimo; o con un monto", async () => {
    let c = valor(await lote(["Refresco", "Malta"], { kind: "PRECIO", ajuste: { modo: "PORCENTAJE", puntosBasicos: 1000 }, dia: HOY }));
    assert.deepEqual([precioHoy(c, "Refresco"), precioHoy(c, "Malta")], ["165", "193"]);
    c = valor(await lote(["Galleta"], { kind: "PRECIO", ajuste: { modo: "MONTO", minor: "25" }, dia: HOY }));
    assert.equal(precioHoy(c, "Galleta"), "125");
  });

  test("todo o nada: si uno no puede, no cambia ninguno, y dice cuál", async () => {
    // Cinco minutos después: el precio de hoy rige desde ese instante.
    const r = await lote(["Refresco", "Galleta"], { kind: "PRECIO", ajuste: { modo: "MONTO", minor: "-150" }, dia: HOY }, ctxAdmin, AHORA + 5 * MIN);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.mensaje : "", /^Galleta: /);
    const c = await local.app.productos.leer(ctxAdmin);
    assert.deepEqual([precioHoy(c, "Refresco"), precioHoy(c, "Galleta")], ["165", "125"]);
    const minimo = await lote(["Refresco", "Café"], { kind: "MINIMO", minimo: 5 });
    assert.match(!minimo.ok ? minimo.mensaje : "", /Café no lleva existencia/);
    assert.equal(de(await local.app.productos.leer(ctxAdmin), "Refresco").minimo, null);
  });

  test("el mínimo, la carta y apartar", async () => {
    let c = valor(await lote(["Refresco", "Malta"], { kind: "MINIMO", minimo: 6 }));
    assert.deepEqual([de(c, "Refresco").minimo, de(c, "Malta").minimo], [6, 6]);
    c = valor(await lote(["Refresco", "Café"], { kind: "EN_CARTA", enCarta: false }));
    assert.deepEqual([de(c, "Refresco").enCarta, de(c, "Café").enCarta, de(c, "Malta").enCarta], [false, false, true]);
    c = valor(await lote(["Galleta"], { kind: "APARTAR" }));
    assert.equal(de(c, "Galleta").activo, false);
  });

  test("lo que pide cada cambio: el precio con la identidad confirmada; la caja, nada", async () => {
    const sinElevar = await lote(["Refresco"], { kind: "PRECIO", ajuste: { modo: "PORCENTAJE", puntosBasicos: 500 }, dia: HOY }, ctxSinElevar);
    assert.equal(!sinElevar.ok && sinElevar.motivo, "ELEVACION_REQUERIDA");
    const cajera = await lote(["Refresco"], { kind: "APARTAR" }, ctxCajera);
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
    const atras = await lote(["Refresco"], { kind: "PRECIO", ajuste: { modo: "PORCENTAJE", puntosBasicos: 500 }, dia: "2026-10-07" });
    assert.equal(!atras.ok && atras.mensaje, "Un precio no se programa hacia atrás: lo ya vendido se queda con el que tenía.");
  });
});
