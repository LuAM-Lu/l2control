/**
 * La impresión en el servidor, contra l2control_test — B5-2, ADR-015, ADR-026.
 *
 * Impresoras del local, el agente que se vincula con un código y la cola: reclamar, confirmar, fallar
 * con espera creciente hasta FALLIDO, reintentar, el enviado que no responde, y lo que la base impide.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AgenteAbierto, Contexto } from "../index.ts";
import { encolarEn } from "./impresion.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-01T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let impresora: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean; motivo?: string; mensaje?: string }, motivo: string) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.motivo, motivo, JSON.stringify(r));
  return r.mensaje ?? "";
};
const datos = (extra: Record<string, unknown> = {}) => ({
  nombre: "Caja",
  ip: "192.168.1.50",
  puerto: 9100,
  ancho: 80,
  recibos: true,
  comandas: true,
  enVlanDeHardware: true,
  ipFija: true,
  ...extra,
});

/** Vincula un agente nuevo en el local y lo abre con su credencial. */
async function agente(l: LocalDePrueba, ctx: Contexto, nombre: string): Promise<AgenteAbierto> {
  const { codigo } = valor(await l.app.impresion.aplicar(ctx, { kind: "VINCULAR_AGENTE", nombre }, AHORA));
  const v = valor(await l.app.impresion.vincular(l.sistema.tenantId, { codigo }, AHORA + MIN));
  return (await l.app.impresion.abrirAgente(l.sistema.tenantId, v.credencial))!;
}

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Impresión");
  otro = await abrirLocalDePrueba(URL_APP, "Impresión de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

describe("las impresoras del local", () => {
  test("administración la crea apagada; se enciende con sus garantías; una sola para cada papel", async () => {
    const r = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: datos() }, AHORA));
    const i = r.local.impresoras[0]!;
    assert.equal(i.activa, false);
    impresora = i.id;
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: true }, AHORA));

    const otra = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: datos({ nombre: "Cocina", ip: "192.168.1.51", recibos: false, ipFija: false }) }, AHORA));
    const cocina = otra.local.impresoras.find((x) => x.nombre === "Cocina")!.id;
    assert.match(rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: cocina, activa: true }, AHORA), "INVALIDO"), /IP fija/);
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "EDITAR", impresoraId: cocina, datos: datos({ nombre: "Cocina", ip: "192.168.1.51", recibos: false }) }, AHORA));
    assert.match(rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: cocina, activa: true }, AHORA), "CONFLICTO"), /comandas/);
    rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: datos({ nombre: "Repetida" }) }, AHORA), "CONFLICTO");
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "RETIRAR", impresoraId: cocina }, AHORA));

    rechazo(await local.app.impresion.aplicar(ctxCajera, { kind: "CREAR", datos: datos({ ip: "192.168.1.60" }) }, AHORA), "NO_PERMITIDO");
    rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: datos({ ip: "8.8.8.8" }) }, AHORA), "INVALIDO");
    const leido = valor(await local.app.impresion.leer(ctxCajera, AHORA));
    assert.deepEqual(leido.impresoras.map((x) => [x.nombre, x.activa]), [["Caja", true]]);
  });

  test("sin impresora de recibos encendida, encolar se niega y la apertura del turno lo avisa", async () => {
    const r = await otro.base.conTenant(otro.sistema.tenantId, (tx) =>
      encolarEn(tx, otro.sistema, { tipo: "PRUEBA", titulo: "Prueba", documento: { renglones: [{ tipo: "TEXTO", texto: "hola" }] }, para: "recibos" }, AHORA),
    );
    assert.match(rechazo(r as { ok: boolean; motivo?: string; mensaje?: string }, "NO_DISPONIBLE"), /impresora de recibos/);
    const apertura = await otro.app.cortes.comprobarApertura(otro.sistema, AHORA);
    assert.ok(apertura.faltan.some((f) => f.que === "IMPRESORA"));
    rechazo(await local.app.impresion.imprimirCorte(ctxCajera, { corteId: randomUUID() }, AHORA), "NO_DISPONIBLE");
  });
});

describe("el agente y la cola (ADR-026)", () => {
  test("el código vale una vez y por 10 minutos; la credencial abre el agente y retirarlo lo cierra", async () => {
    const { codigo } = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "VINCULAR_AGENTE", nombre: "Laptop de caja" }, AHORA));
    assert.match(codigo!, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const v = valor(await local.app.impresion.vincular(local.sistema.tenantId, { codigo }, AHORA + MIN));
    rechazo(await local.app.impresion.vincular(local.sistema.tenantId, { codigo }, AHORA + MIN), "NO_PERMITIDO");
    const tarde = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "VINCULAR_AGENTE", nombre: "Tarde" }, AHORA)).codigo;
    rechazo(await local.app.impresion.vincular(local.sistema.tenantId, { codigo: tarde }, AHORA + 11 * MIN), "NO_PERMITIDO");

    const a = await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial);
    assert.equal(a?.nombre, "Laptop de caja");
    assert.equal(await local.app.impresion.abrirAgente(local.sistema.tenantId, `${v.credencial}x`), null);
    assert.equal(await otro.app.impresion.abrirAgente(otro.sistema.tenantId, v.credencial), null, "la credencial no abre en otro tenant");
    const leido = valor(await local.app.impresion.leer(ctxAdmin, AHORA + MIN));
    assert.equal(leido.agentes.find((x) => x.id === v.agenteId)?.conectado, true);
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "RETIRAR_AGENTE", agenteId: v.agenteId }, AHORA));
    assert.equal(await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial), null);
  });

  test("reclamar, confirmar: el agente recibe el ESC/POS y la dirección; nadie más lo toma", async () => {
    const ag = await agente(local, ctxAdmin, "Laptop A");
    const t = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    assert.equal(t.estado, "PENDIENTE");
    assert.match(t.vistaPrevia, /PRUEBA DE IMPRESIÓN/);
    const j = (await local.app.impresion.reclamar(ag, AHORA))!;
    assert.equal(j.id, t.id);
    assert.equal(j.ip, "192.168.1.50");
    assert.deepEqual([...Buffer.from(j.bytes, "base64").subarray(0, 2)], [0x1b, 0x40]);
    assert.equal(await local.app.impresion.reclamar(ag, AHORA), null, "un trabajo enviado no se reclama dos veces");
    rechazo(await local.app.impresion.responder(await agente(local, ctxAdmin, "Laptop B"), { trabajoId: t.id, ok: true }, AHORA), "CONFLICTO");
    assert.equal(valor(await local.app.impresion.responder(ag, { trabajoId: t.id, ok: true }, AHORA)).estado, "CONFIRMADO");
    const cola = valor(await local.app.impresion.trabajos(ctxCajera, AHORA)).trabajos;
    assert.equal(cola.find((x) => x.id === t.id)?.estado, "CONFIRMADO");
  });

  test("un fallo espera y vuelve; al quinto queda FALLIDO con su motivo, y una persona lo reintenta desde cero", async () => {
    const ag = await agente(local, ctxAdmin, "Laptop C");
    const t = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    let ahora = AHORA;
    for (let i = 1; i <= 5; i++) {
      const j = (await local.app.impresion.reclamar(ag, ahora))!;
      assert.equal(j.id, t.id, `intento ${i}`);
      const r = valor(await local.app.impresion.responder(ag, { trabajoId: t.id, ok: false, error: "Sin papel" }, ahora));
      assert.equal(r.estado, i < 5 ? "PENDIENTE" : "FALLIDO");
      if (i < 5) assert.equal(await local.app.impresion.reclamar(ag, ahora + 1000), null, "espera antes del siguiente intento");
      ahora += 60_000;
    }
    const fallido = valor(await local.app.impresion.trabajos(ctxCajera, ahora)).trabajos.find((x) => x.id === t.id)!;
    assert.equal(fallido.estado, "FALLIDO");
    assert.equal(fallido.error, "Sin papel");
    const otra = valor(await local.app.impresion.reintentar(ctxCajera, { trabajoId: t.id }, ahora));
    assert.equal(otra.estado, "PENDIENTE");
    assert.equal(otra.intentos, 0);
    rechazo(await local.app.impresion.reintentar(ctxCajera, { trabajoId: t.id }, ahora), "CONFLICTO");
    assert.equal((await local.app.impresion.reclamar(ag, ahora))!.id, t.id);
    valor(await local.app.impresion.responder(ag, { trabajoId: t.id, ok: true }, ahora));
  });

  test("un enviado sin respuesta en 30 s vuelve a la cola; uno de una impresora apagada falla", async () => {
    const ag = await agente(local, ctxAdmin, "Laptop D");
    const t = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    assert.equal((await local.app.impresion.reclamar(ag, AHORA))!.id, t.id);
    assert.equal(await local.app.impresion.barrer(local.sistema.tenantId, AHORA + 29_000), 0);
    assert.equal(await local.app.impresion.barrer(local.sistema.tenantId, AHORA + 30_000), 1);
    const vuelto = valor(await local.app.impresion.trabajos(ctxCajera, AHORA + 30_000)).trabajos.find((x) => x.id === t.id)!;
    assert.equal(vuelto.estado, "PENDIENTE");
    assert.equal(vuelto.error, "El agente no respondió");

    // Una comanda para una impresora que se apagó después de encolarla falla; una prueba sale igual
    // (se prueba antes de encenderla).
    const comanda = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      encolarEn(tx, local.sistema, { tipo: "COMANDA", titulo: "Comanda de prueba", documento: { renglones: [{ tipo: "TEXTO", texto: "2 × Tequeños" }] }, para: "comandas" }, AHORA),
    );
    assert.ok(!("ok" in comanda));
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: false }, AHORA));
    assert.equal((await local.app.impresion.reclamar(ag, AHORA + MIN))!.id, t.id, "la prueba sale con la impresora apagada");
    valor(await local.app.impresion.responder(ag, { trabajoId: t.id, ok: true }, AHORA + MIN));
    assert.equal(await local.app.impresion.reclamar(ag, AHORA + MIN), null);
    const apagada = valor(await local.app.impresion.trabajos(ctxCajera, AHORA + MIN)).trabajos.find((x) => x.titulo === "Comanda de prueba")!;
    assert.equal(apagada.estado, "FALLIDO");
    assert.match(apagada.error!, /apagada/);
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: true }, AHORA));
  });

  test("un agente de otro tenant no ve la cola de este", async () => {
    await impresoraDePrueba(otro, "192.168.1.70");
    const ajeno = await agente(otro, otro.sistema, "Ajeno");
    valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    assert.equal(await otro.app.impresion.reclamar(ajeno, AHORA + 10 * MIN), null);
  });
});

describe("lo que la base impide", () => {
  test("lo impreso no cambia, un trabajo no se borra y un confirmado no vuelve", async () => {
    const [t] = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { status: "CONFIRMADO" }, take: 1 }));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: t!.id }, data: { payload: Buffer.from("hola") } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: t!.id }, data: { status: "PENDIENTE", finishedAt: null } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.delete({ where: { id: t!.id } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printer.delete({ where: { id: impresora } })));
  });
});
