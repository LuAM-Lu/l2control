/**
 * Los medios de pago del local en el servidor, contra l2control_test — B3-2, F4-02, F4-04.
 *
 * Lo que fijan: un local nace con los siete medios de §5.5; administración (con elevación) los
 * enciende, añade uno sin desplegar, da los datos que ve el cliente y los terminales; la
 * configuración que resulta nunca deja un medio encendido sin sus datos; los datos del local se
 * guardan cifrados y no llegan a la auditoría; y nadie más cambia nada. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { MediosDePagoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinElevar: Contexto;
let ctxCajera: Contexto;

const PAGO_MOVIL = { bankCode: "0102", phone: "0414-7654321", document: "J-41234567-8" };
const ZELLE = { holder: "Inversiones Parque C.A.", email: "cobros@ejemplo-parque.com" };
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const medio = (c: MediosDePagoDto, code: string) => c.medios.find((m) => m.code === code)!;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Medios");
  otro = await abrirLocalDePrueba(URL_APP, "Medios de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinElevar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("el catálogo con el que nace un local (F4-02)", () => {
  test("los siete medios de §5.5; cobra de entrada en efectivo y en USDT", async () => {
    const c = valor(await local.app.medios.leer(ctxCajera));
    assert.deepEqual(c.medios.map((m) => m.code), ["EFECTIVO_USD", "EFECTIVO_VES", "PAGO_MOVIL", "PDV_DEBITO", "PDV_CREDITO", "ZELLE", "USDT"]);
    assert.deepEqual(c.medios.filter((m) => m.activo).map((m) => m.code), ["EFECTIVO_USD", "EFECTIVO_VES", "USDT"]);
    assert.deepEqual(c.terminales, []);
    assert.equal(c.pagoMovil, undefined);
  });

  test("sin persona en sesión no se leen: son datos del negocio", async () => {
    const r = await local.app.medios.leer({ tenantId: local.sistema.tenantId, branchId: local.sistema.branchId });
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });
});

describe("administración configura el cobro", () => {
  test("Pago Móvil no se enciende sin los datos que el cliente necesita", async () => {
    const r = await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.match(!r.ok ? r.mensaje : "", /Pago Móvil/);
  });

  test("con sus datos, sí; y los datos se guardan cifrados", async () => {
    valor(await local.app.medios.aplicar(ctxAdmin, { kind: "DATOS_PAGO_MOVIL", datos: PAGO_MOVIL }));
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true }));
    assert.equal(medio(c, "PAGO_MOVIL").activo, true);
    assert.deepEqual(c.pagoMovil, PAGO_MOVIL);
    const filas = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.collectionDetails.findMany());
    assert.equal(filas.length, 1);
    assert.ok(!filas[0]!.dataCipher.includes("7654321"));
    assert.ok(!filas[0]!.dataCipher.includes("J-4123"));
  });

  test("cambiar los datos añade una fila y rige la última; la auditoría no los lleva", async () => {
    const nuevos = { ...PAGO_MOVIL, phone: "0424-1112233" };
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "DATOS_PAGO_MOVIL", datos: nuevos }));
    assert.deepEqual(c.pagoMovil, nuevos);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "collection_details" });
    assert.equal(asientos.filter((a) => a.action === "medio.datos").length, 2);
    assert.ok(!JSON.stringify(asientos).includes("1112233"));
    assert.ok(!JSON.stringify(asientos).includes("7654321"));
  });

  test("Zelle, igual: sin titular y correo no se enciende", async () => {
    assert.equal((await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "ZELLE", activo: true })).ok, false);
    valor(await local.app.medios.aplicar(ctxAdmin, { kind: "DATOS_ZELLE", datos: ZELLE }));
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "ZELLE", activo: true }));
    assert.deepEqual(c.zelle, ZELLE);
  });

  test("el punto de venta necesita un terminal; el terminal lo identifica el servidor", async () => {
    assert.equal((await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "PDV_DEBITO", activo: true })).ok, false);
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_TERMINAL", terminal: { name: "Punto Banesco", bank: "Banesco" } }));
    assert.match(c.terminales[0]!.id, /^[0-9a-f-]{36}$/);
    valor(await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "PDV_DEBITO", activo: true }));
  });

  test("con el punto encendido, el último terminal no se retira; con otro, sí", async () => {
    const [primero] = valor(await local.app.medios.leer(ctxAdmin)).terminales;
    const r = await local.app.medios.aplicar(ctxAdmin, { kind: "RETIRAR_TERMINAL", terminalId: primero!.id });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    valor(await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_TERMINAL", terminal: { name: "Punto Mercantil", bank: "Mercantil" } }));
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "RETIRAR_TERMINAL", terminalId: primero!.id }));
    assert.deepEqual(c.terminales.map((t) => t.name), ["Punto Mercantil"]);
    // Retirado sigue en la base: un pago dice por cuál pasó la tarjeta.
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.posTerminal.findUnique({ where: { id: primero!.id } }));
    assert.equal(fila?.retiredByName, "Abigail Karam");
  });

  test("dos terminales vigentes no se llaman igual", async () => {
    const r = await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_TERMINAL", terminal: { name: "punto mercantil", bank: "Mercantil" } });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("un medio nuevo se añade sin desplegar (F4-02): nace apagado y al final", async () => {
    const biopago = { code: "BIOPAGO", label: "Biopago", currency: "VES", triggersIgtf: false, canGiveChange: false, datos: "PUNTO" } as const;
    const c = valor(await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_MEDIO", medio: biopago }));
    assert.equal(c.medios.at(-1)!.code, "BIOPAGO");
    assert.equal(medio(c, "BIOPAGO").activo, false);
    valor(await local.app.medios.aplicar(ctxAdmin, { kind: "ACTIVAR", code: "BIOPAGO", activo: true }));
    const otraVez = await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_MEDIO", medio: { ...biopago, label: "Otro" } });
    assert.equal(!otraVez.ok && otraVez.motivo, "INVALIDO");
  });

  test("un medio que no tiene sentido no se añade: el efectivo no pide referencia", async () => {
    const r = await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_MEDIO", medio: { code: "EFECTIVO_REF", label: "Efectivo raro", currency: "USD", triggersIgtf: true, canGiveChange: true, datos: "ZELLE" } });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("no se apaga el último medio encendido: el local no podría cobrar", async () => {
    const c = valor(await otro.app.medios.leer(otro.sistema));
    for (const code of ["EFECTIVO_USD", "EFECTIVO_VES"]) valor(await otro.app.medios.aplicar(otro.sistema, { kind: "ACTIVAR", code, activo: false }));
    const r = await otro.app.medios.aplicar(otro.sistema, { kind: "ACTIVAR", code: "USDT", activo: false });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.equal(c.medios.length, 7);
  });

  test("cada cambio queda en la auditoría con quién lo hizo", async () => {
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxAdmin.quien!.userId! });
    for (const accion of ["medio.encender", "medio.crear", "medio.datos", "terminal.crear", "terminal.retirar"]) {
      assert.ok(asientos.some((a) => a.action === accion), accion);
    }
  });
});

describe("nadie más lo cambia", () => {
  test("la caja no configura medios, y el intento queda en la auditoría", async () => {
    const r = await local.app.medios.aplicar(ctxCajera, { kind: "ACTIVAR", code: "EFECTIVO_VES", activo: false });
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxCajera.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "medio.apagar" && a.outcome === "NEGADO"));
  });

  test("administración sin confirmar su identidad, tampoco (F2-04)", async () => {
    const r = await local.app.medios.aplicar(ctxAdminSinElevar, { kind: "ACTIVAR", code: "EFECTIVO_VES", activo: false });
    assert.equal(!r.ok && r.motivo, "ELEVACION_REQUERIDA");
  });

  test("el navegador no pone el identificador de un terminal (ADR-017)", async () => {
    const r = await local.app.medios.aplicar(ctxAdmin, { kind: "AÑADIR_TERMINAL", terminal: { id: "pdv-falso", name: "Punto BNC", bank: "BNC" } });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("otro local no ve los datos ni los terminales de este, ni retira sus terminales", async () => {
    const c = valor(await otro.app.medios.leer(otro.sistema));
    assert.equal(c.pagoMovil, undefined);
    assert.equal(c.zelle, undefined);
    assert.deepEqual(c.terminales, []);
    const [deEste] = valor(await local.app.medios.leer(ctxAdmin)).terminales;
    const r = await otro.app.medios.aplicar(otro.sistema, { kind: "RETIRAR_TERMINAL", terminalId: deEste!.id });
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });
});
