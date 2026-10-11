/**
 * La impresora por red y por USB, principal y respaldo, contra l2control_test — B5-6 (M-38, W-1).
 *
 * El 9 de octubre, sin papel y por USB, L2 dio por impresas 58 comandas y recibos sin avisar. Aquí: la misma impresora
 * por red («CAJA», principal) y por USB («CAJA POS», su respaldo). Sin papel, «no salió» en el acto y «Reintentar» la saca
 * una vez; sin responder, sale por el respaldo y se avisa; «Hacer principal» cambia por dónde sale lo siguiente; y el
 * agente cuenta cómo está cada una.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AgenteAbierto, Contexto } from "../index.ts";

import { abrirLocalDePrueba, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let caja: AgenteAbierto;
let red: string;
let usb: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
type Rechazado = { ok: boolean; motivo?: string; mensaje?: string; problemas?: readonly { path: readonly PropertyKey[] }[] };
const rechazo = (crudo: unknown, motivo: string): Rechazado => {
  const r = crudo as Rechazado;
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.motivo, motivo, JSON.stringify(r));
  return r;
};
const aplicar = (cmd: unknown) => local.app.impresion.aplicar(ctxAdmin, cmd, AHORA);
const delLocal = async () => valor(await local.app.impresion.leer(ctxAdmin, AHORA)).impresoras;
let corteId: string;
/** Un ticket del corte X del turno (sale por la impresora de los recibos): lo que la caja imprime de verdad. */
const recibo = async (_titulo: string) => valor(await local.app.impresion.imprimirCorte(ctxAdmin, { corteId }, AHORA));
const trabajo = async (id: string) => valor(await local.app.impresion.trabajos(ctxAdmin, AHORA)).trabajos.find((t) => t.id === id)!;
const asientos = (action: string) => local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action }, orderBy: { occurredAt: "asc" } }));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Impresora de respaldo");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  const { codigo } = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "VINCULAR_AGENTE", nombre: "Laptop de caja" }, AHORA));
  const v = valor(await local.app.impresion.vincular(local.sistema.tenantId, { codigo }, AHORA + MIN));
  caja = (await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial))!;
  valor(await local.app.impresion.anotarImpresorasDeWindows(caja, { impresoras: ["CAJA POS"] }, AHORA));

  const r = valor(
    await aplicar({ kind: "CREAR", datos: { nombre: "CAJA", ip: "192.168.1.50", puerto: 9100, ancho: 80, recibos: true, comandas: true, barra: true, enVlanDeHardware: true, ipFija: true } }),
  );
  red = r.local.impresoras.find((i) => i.nombre === "CAJA")!.id;
  valor(await aplicar({ kind: "ACTIVAR", impresoraId: red, activa: true }));
  // Su respaldo por USB: las áreas que se marquen no cuentan.
  const u = valor(
    await aplicar({ kind: "CREAR", datos: { nombre: "CAJA POS", conexion: "USB", agenteId: caja.agenteId, nombreEnWindows: "CAJA POS", ancho: 80, recibos: true, comandas: false, respaldoDe: red } }),
  );
  usb = u.local.impresoras.find((i) => i.nombre === "CAJA POS")!.id;
  valor(await aplicar({ kind: "ACTIVAR", impresoraId: usb, activa: true }));

  // Un turno con su corte X: su ticket es lo que se imprime aquí.
  const turno = valor(
    await local.app.turnos.abrir(ctxAdmin, { fondos: [{ currency: "USD", amount: { minor: "0", currency: "USD" } }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA),
  );
  corteId = valor(await local.app.cortes.corteX(ctxAdmin, { turnoId: turno.id }, AHORA)).id!;
  // El ticket del corte X, si se encoló solo, sale ya: la cola empieza vacía.
  for (let t = await local.app.impresion.reclamar(caja, AHORA); t; t = await local.app.impresion.reclamar(caja, AHORA)) {
    valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: true }, AHORA));
  }
});

describe("principal y respaldo (B5-6)", () => {
  test("el respaldo es de una principal, sin áreas propias, uno por principal y no de sí mismo ni de otro respaldo", async () => {
    const i = (await delLocal()).find((x) => x.id === usb)!;
    assert.deepEqual([i.respaldoDe, i.recibos, i.comandas, i.barra, i.activa], [red, false, false, false, true]);
    const otro = rechazo(await aplicar({ kind: "CREAR", datos: { nombre: "Otra", ip: "192.168.1.51", puerto: 9100, ancho: 80, recibos: false, comandas: false, respaldoDe: red } }), "INVALIDO");
    assert.match(otro.mensaje ?? "", /ya tiene de respaldo a «CAJA POS»/);
    rechazo(await aplicar({ kind: "CREAR", datos: { nombre: "Otra", ip: "192.168.1.51", puerto: 9100, ancho: 80, recibos: false, comandas: false, respaldoDe: usb } }), "INVALIDO");
    rechazo(
      await aplicar({ kind: "EDITAR", impresoraId: usb, datos: { nombre: "CAJA POS", conexion: "USB", agenteId: caja.agenteId, nombreEnWindows: "CAJA POS", ancho: 80, recibos: false, comandas: false, respaldoDe: usb } }),
      "INVALIDO",
    );
    // Una principal que tiene respaldo no pasa a ser respaldo de otra.
    const p = rechazo(
      await aplicar({ kind: "EDITAR", impresoraId: red, datos: { nombre: "CAJA", ip: "192.168.1.50", puerto: 9100, ancho: 80, recibos: true, comandas: true, enVlanDeHardware: true, ipFija: true, respaldoDe: usb } }),
      "INVALIDO",
    );
    assert.ok(p.problemas?.some((x) => x.path.includes("respaldoDe")));
  });

  test("sin papel: «no salió» en el acto y sin cambiar de camino; la impresora queda sin papel; «Reintentar» la saca una sola vez", async () => {
    const t = await recibo("Corte #1");
    const enviado = (await local.app.impresion.reclamar(caja, AHORA))!;
    assert.deepEqual([enviado.ip, enviado.puerto], ["192.168.1.50", 9100]);
    assert.equal(valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: false, error: "Sin papel" }, AHORA)).estado, "FALLIDO");
    assert.equal(await local.app.impresion.reclamar(caja, AHORA + MIN), null, "no se reintenta solo ni sale por el respaldo");
    const cola = valor(await local.app.impresion.trabajos(ctxAdmin, AHORA));
    assert.equal(cola.trabajos.find((x) => x.id === t.id)?.estado, "FALLIDO");
    assert.equal(cola.impresoras.find((x) => x.id === red)?.estado?.estado, "SIN_PAPEL");
    assert.equal((await asientos("impresora.estado")).at(-1)?.entityId, red);

    // Vuelve el papel: «Reintentar» la saca por su principal, una vez.
    valor(await local.app.impresion.reintentar(ctxAdmin, { trabajoId: t.id }, AHORA + 2 * MIN));
    const otra = (await local.app.impresion.reclamar(caja, AHORA + 2 * MIN))!;
    assert.equal(otra.ip, "192.168.1.50");
    assert.equal(valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: true }, AHORA + 2 * MIN)).estado, "CONFIRMADO");
    rechazo(await local.app.impresion.reintentar(ctxAdmin, { trabajoId: t.id }, AHORA + 3 * MIN), "CONFLICTO");
    // Imprimió: ya tiene papel.
    assert.equal(valor(await local.app.impresion.trabajos(ctxAdmin, AHORA)).impresoras.find((x) => x.id === red)?.estado?.estado, "LISTA");
  });

  test("no responde: sale por el respaldo una sola vez, con su camino, y se avisa", async () => {
    const t = await recibo("Corte #2");
    (await local.app.impresion.reclamar(caja, AHORA))!;
    const r = valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: false, error: "No responde en 192.168.1.50:9100" }, AHORA));
    assert.equal(r.estado, "PENDIENTE");
    const desviado = await trabajo(t.id);
    assert.equal(desviado.porRespaldo, true);
    assert.match(desviado.error ?? "", /sale por «CAJA POS»/);
    assert.equal((await asientos("impresion.desviar")).at(-1)?.entityId, t.id);
    // En el acto, por el agente de su equipo y por su nombre en Windows.
    const porUsb = (await local.app.impresion.reclamar(caja, AHORA))!;
    assert.deepEqual([porUsb.impresoraDeWindows, porUsb.ip], ["CAJA POS", undefined]);
    assert.equal(valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: true }, AHORA)).estado, "CONFIRMADO");
    assert.equal(valor(await local.app.impresion.trabajos(ctxAdmin, AHORA)).impresoras.find((x) => x.id === red)?.estado?.estado, "NO_RESPONDE");
  });

  test("«Hacer principal» cambia por dónde sale lo siguiente, de una vez", async () => {
    rechazo(await aplicar({ kind: "PRINCIPAL", impresoraId: red }), "CONFLICTO");
    valor(await aplicar({ kind: "PRINCIPAL", impresoraId: usb }));
    const [p, b] = [(await delLocal()).find((x) => x.id === usb)!, (await delLocal()).find((x) => x.id === red)!];
    assert.deepEqual([p.respaldoDe, p.recibos, p.comandas, p.barra], [null, true, true, true]);
    assert.deepEqual([b.respaldoDe, b.recibos, b.comandas, b.barra], [usb, false, false, false]);
    assert.equal((await asientos("impresora.principal")).length, 1);
    const t = await recibo("Corte #3");
    const sale = (await local.app.impresion.reclamar(caja, AHORA))!;
    assert.equal(sale.impresoraDeWindows, "CAJA POS");
    valor(await local.app.impresion.responder(caja, { trabajoId: t.id, ok: true }, AHORA));
    // Y de vuelta: la red, principal.
    valor(await aplicar({ kind: "PRINCIPAL", impresoraId: red }));
    assert.equal((await delLocal()).find((x) => x.id === red)?.respaldoDe, null);
  });

  test("el agente vigila las de red y las suyas por USB, y cuenta cómo están; solo un cambio va a la auditoría", async () => {
    const v = await local.app.impresion.vigilar(caja);
    const vigiladas = new Map(v.impresoras.map((i) => [i.id, i.ip ?? i.impresoraDeWindows]));
    assert.deepEqual([vigiladas.size, vigiladas.get(red), vigiladas.get(usb)], [2, "192.168.1.50", "CAJA POS"]);
    const antes = (await asientos("impresora.estado")).length;
    const desconocida = "0199a0c0-0000-7000-8000-00000000dead";
    const e = { impresoras: [{ id: usb, estado: "SIN_PAPEL", detalle: "«CAJA POS» está sin papel (lo dice Windows)" }, { id: desconocida, estado: "LISTA" }] };
    assert.equal(valor(await local.app.impresion.anotarEstados(caja, e, AHORA + 5 * MIN)).anotadas, 1, "la que no es suya no se anota");
    assert.equal(valor(await local.app.impresion.anotarEstados(caja, e, AHORA + 6 * MIN)).anotadas, 1);
    assert.equal((await asientos("impresora.estado")).length, antes + 1, "lo mismo otra vez no es un cambio");
    const c = valor(await local.app.impresion.trabajos(ctxAdmin, AHORA)).impresoras.find((x) => x.id === usb)!;
    assert.deepEqual([c.estado?.estado, c.estado?.en], ["SIN_PAPEL", new Date(AHORA + 6 * MIN).toISOString()]);
    rechazo(await local.app.impresion.anotarEstados(caja, { impresoras: [{ id: usb, estado: "ROTA" }] }, AHORA), "INVALIDO");
  });
});
