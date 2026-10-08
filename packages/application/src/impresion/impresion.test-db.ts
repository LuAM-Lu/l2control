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
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, impresoraDePrueba, pedidoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

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
    const orderId = await pedidoDePrueba(local);
    const comanda = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      encolarEn(tx, local.sistema, { tipo: "COMANDA", titulo: "Comanda de prueba", orderId, documento: { renglones: [{ tipo: "TEXTO", texto: "2 × Tequeños" }] }, para: "comandas" }, AHORA),
    );
    assert.ok(!("ok" in comanda));
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: false }, AHORA));
    assert.equal((await local.app.impresion.reclamar(ag, AHORA + MIN))!.id, t.id, "la prueba sale con la impresora apagada");
    valor(await local.app.impresion.responder(ag, { trabajoId: t.id, ok: true }, AHORA + MIN));
    assert.equal(await local.app.impresion.reclamar(ag, AHORA + MIN), null);
    const apagada = valor(await local.app.impresion.trabajos(ctxCajera, AHORA + MIN)).trabajos.find((x) => x.titulo === "Comanda de prueba")!;
    assert.equal(apagada.estado, "FALLIDO");
    assert.match(apagada.error!, /se apagó/);
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: true }, AHORA));
  });

  test("un agente de otro tenant no ve la cola de este", async () => {
    await impresoraDePrueba(otro, "192.168.1.70");
    const ajeno = await agente(otro, otro.sistema, "Ajeno");
    valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    assert.equal(await otro.app.impresion.reclamar(ajeno, AHORA + 10 * MIN), null);
  });
});

describe("apagar o retirar una impresora con trabajos en cola", () => {
  test("lo pendiente falla con el motivo (al apagarla, salvo las pruebas); nada se queda esperando", async () => {
    const otra = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: datos({ nombre: "Barra", ip: "192.168.1.80", recibos: false }) }, AHORA)).local.impresoras.find((x) => x.nombre === "Barra")!.id;
    const encolar = async (tipo: "COMANDA" | "PRUEBA", titulo: string) => {
      const orderId = tipo === "COMANDA" ? await pedidoDePrueba(local) : undefined;
      return local.base.conTenant(local.sistema.tenantId, (tx) =>
        encolarEn(tx, local.sistema, { tipo, titulo, ...(orderId ? { orderId } : {}), documento: { renglones: [{ tipo: "TEXTO", texto: titulo }] }, impresoraId: otra }, AHORA),
      );
    };
    // Barra hace las comandas un momento: la Caja las suelta.
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: false }, AHORA));
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: otra, activa: true }, AHORA));
    await encolar("COMANDA", "Comanda que no saldrá");
    await encolar("PRUEBA", "Prueba que sí espera");
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: otra, activa: false }, AHORA));
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: impresora, activa: true }, AHORA));
    const de = async () => valor(await local.app.impresion.trabajos(ctxCajera, AHORA)).trabajos.filter((t) => t.impresora.id === otra);
    assert.deepEqual((await de()).map((t) => [t.titulo, t.estado, t.error]).sort(), [
      ["Comanda que no saldrá", "FALLIDO", "«Barra» se apagó"],
      ["Prueba que sí espera", "PENDIENTE", null],
    ]);
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "RETIRAR", impresoraId: otra }, AHORA));
    assert.deepEqual((await de()).find((t) => t.titulo === "Prueba que sí espera")?.error, "«Barra» se retiró");
  });
});

describe("descartar y el historial", () => {
  /** Reclama y confirma lo que haya en cola: el punto de partida limpio de cada caso. */
  async function vaciar(ag: AgenteAbierto, ahora: number) {
    for (let j = await local.app.impresion.reclamar(ag, ahora); j; j = await local.app.impresion.reclamar(ag, ahora)) {
      valor(await local.app.impresion.responder(ag, { trabajoId: j.id, ok: true }, ahora));
    }
  }
  /** Lleva a FALLIDO el único trabajo en cola: cinco intentos sin papel. */
  async function fallar(ag: AgenteAbierto, id: string, desde: number): Promise<number> {
    let ahora = desde;
    for (let i = 1; i <= 5; i++) {
      assert.equal((await local.app.impresion.reclamar(ag, ahora))?.id, id);
      valor(await local.app.impresion.responder(ag, { trabajoId: id, ok: false, error: "Sin papel" }, ahora));
      ahora += MIN;
    }
    return ahora;
  }

  test("lo que falló o espera se descarta, uno o todos los fallidos; no se imprime y queda quién; lo que se imprime, no", async () => {
    const ag = await agente(local, ctxAdmin, "Laptop E");
    let ahora = AHORA + 60 * MIN;
    await vaciar(ag, ahora);
    const a = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, ahora));
    ahora = await fallar(ag, a.id, ahora);
    const b = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, ahora));
    ahora = await fallar(ag, b.id, ahora);
    const c = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, ahora));
    assert.equal((await local.app.impresion.reclamar(ag, ahora))?.id, c.id);
    const d = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, ahora));

    assert.match(rechazo(await local.app.impresion.descartar(ctxCajera, { kind: "TRABAJOS", trabajoIds: [c.id] }, ahora), "CONFLICTO"), /imprimiendo ahora mismo/);
    rechazo(await local.app.impresion.descartar(ctxCajera, { kind: "TRABAJOS", trabajoIds: [d.id, randomUUID()] }, ahora), "NO_DISPONIBLE");
    rechazo(await local.app.impresion.descartar(ctxCajera, { kind: "TRABAJOS", trabajoIds: [] }, ahora), "INVALIDO");
    assert.equal(valor(await local.app.impresion.descartar(ctxCajera, { kind: "TRABAJOS", trabajoIds: [d.id] }, ahora)).descartados, 1);
    assert.match(rechazo(await local.app.impresion.descartar(ctxCajera, { kind: "TRABAJOS", trabajoIds: [d.id] }, ahora), "CONFLICTO"), /ya se descartó/);
    valor(await local.app.impresion.responder(ag, { trabajoId: c.id, ok: true }, ahora));
    assert.equal(await local.app.impresion.reclamar(ag, ahora + MIN), null, "lo descartado no se imprime");

    // Los fallidos de la Caja, de una vez; los de otra impresora siguen avisando hasta que se descarten.
    const fallidos = async (impresoraId?: string) => valor(await local.app.impresion.historial(ctxCajera, { filtro: "FALLIDOS", impresoraId })).total;
    const deOtras = (await fallidos()) - (await fallidos(impresora));
    assert.ok((await fallidos(impresora)) >= 2);
    const comandasFallidas = valor(await local.app.impresion.historial(ctxCajera, { filtro: "FALLIDOS", impresoraId: impresora, tipo: "COMANDA" })).total;
    assert.equal(valor(await local.app.impresion.descartar(ctxCajera, { kind: "FALLIDOS", impresoraId: impresora, tipo: "COMANDA" }, ahora)).descartados, comandasFallidas);
    assert.ok((await fallidos(impresora)) >= 2, "las pruebas que no salieron siguen ahí");
    valor(await local.app.impresion.descartar(ctxCajera, { kind: "FALLIDOS", impresoraId: impresora }, ahora));
    assert.equal(await fallidos(impresora), 0);
    assert.equal(await fallidos(), deOtras);
    assert.equal(valor(await local.app.impresion.descartar(ctxCajera, { kind: "FALLIDOS" }, ahora)).descartados, deOtras);
    assert.equal(await fallidos(), 0);

    const descartados = valor(await local.app.impresion.historial(ctxCajera, { filtro: "DESCARTADOS", porPagina: 50 })).trabajos;
    for (const id of [a.id, b.id, d.id]) {
      const t = descartados.find((x) => x.id === id);
      assert.equal(t?.estado, "DESCARTADO");
      assert.equal(t?.descartadoPor, "Marisol Prieto");
    }
    assert.ok(!descartados.some((x) => x.id === c.id), "lo impreso no se descarta");
    const leido = valor(await local.app.impresion.trabajos(ctxCajera, ahora)).trabajos;
    assert.ok(!leido.some((t) => t.estado === "FALLIDO"), "nada avisa ya");
  });

  test("el historial va por páginas que no se pisan, con sus filtros y lo que cuenta cada uno", async () => {
    const h = valor(await local.app.impresion.historial(ctxCajera, { porPagina: 10 }));
    const { TODOS, FALLIDOS, EN_COLA, IMPRESOS, DESCARTADOS } = h.conteos;
    assert.equal(h.total, TODOS);
    assert.equal(FALLIDOS + EN_COLA + IMPRESOS + DESCARTADOS, TODOS);
    assert.ok(TODOS > 10, "hay más de una página");
    assert.equal(h.trabajos.length, 10);
    const siguiente = valor(await local.app.impresion.historial(ctxCajera, { porPagina: 10, pagina: 2 }));
    assert.ok(!siguiente.trabajos.some((t) => h.trabajos.some((x) => x.id === t.id)), "las páginas no se pisan");
    assert.ok(Date.parse(h.trabajos.at(-1)!.creadoEn) >= Date.parse(siguiente.trabajos[0]!.creadoEn), "lo más reciente primero");
    const lejos = valor(await local.app.impresion.historial(ctxCajera, { porPagina: 10, pagina: 999 }));
    assert.equal(lejos.pagina, Math.ceil(TODOS / 10), "una página que no existe se lee como la última");

    const comandas = valor(await local.app.impresion.historial(ctxCajera, { tipo: "COMANDA", porPagina: 50 }));
    assert.ok(comandas.trabajos.length > 0 && comandas.trabajos.every((t) => t.tipo === "COMANDA"));
    assert.ok(comandas.conteos.TODOS < TODOS, "los conteos siguen al tipo elegido");
    assert.deepEqual(comandas.pendientes, { fallidos: FALLIDOS, enCola: EN_COLA }, "lo pendiente es de toda la sucursal");
    const impresos = valor(await local.app.impresion.historial(ctxCajera, { filtro: "IMPRESOS", impresoraId: impresora, porPagina: 50 }));
    assert.ok(impresos.trabajos.every((t) => t.estado === "CONFIRMADO" && t.impresora.id === impresora));
    rechazo(await local.app.impresion.historial(ctxCajera, { porPagina: 15 }), "INVALIDO");
    rechazo(await local.app.impresion.historial(ctxCajera, { filtro: "BORRADOS" }), "INVALIDO");
  });
});

describe("lo que la base impide", () => {
  test("lo impreso no cambia, un trabajo no se borra y un confirmado no vuelve", async () => {
    const [t] = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { status: "CONFIRMADO" }, take: 1 }));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: t!.id }, data: { payload: Buffer.from("hola") } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: t!.id }, data: { status: "PENDIENTE", finishedAt: null } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.delete({ where: { id: t!.id } })));
    // Lo descartado es final, y siempre dice quién: ni vuelve a la cola ni se descarta sin nombre.
    const [d] = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { status: "DESCARTADO" }, take: 1 }));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: d!.id }, data: { status: "PENDIENTE", finishedAt: null, discardedBy: null, discardedByName: null } })));
    const p = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: impresora }, AHORA));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: p.id }, data: { status: "DESCARTADO", finishedAt: new Date(AHORA) } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.update({ where: { id: t!.id }, data: { status: "DESCARTADO", discardedByName: "Alguien" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.printer.delete({ where: { id: impresora } })));
  });
});

describe("el agente que se actualiza solo (T-8c)", () => {
  test("dice su versión al entrar; si cambia, el panel lo ve y queda en la auditoría", async () => {
    const { codigo } = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "VINCULAR_AGENTE", nombre: "Laptop T8c" }, AHORA));
    const v = valor(await local.app.impresion.vincular(local.sistema.tenantId, { codigo }, AHORA + MIN));
    const de = async () => valor(await local.app.impresion.leer(ctxAdmin, AHORA + 2 * MIN)).agentes.find((x) => x.nombre === "Laptop T8c")!;
    // Uno de antes no dice nada: no se toca.
    assert.ok(await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial));
    assert.equal((await de()).version, null);
    // La primera vez solo se anota; una versión que no es texto acotado, no.
    assert.ok(await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial, "0.85.0", AHORA + MIN));
    assert.ok(await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial, "0.85.0; DROP TABLE", AHORA + MIN));
    assert.equal((await de()).version, "0.85.0");
    assert.equal((await de()).ultimaActualizacion, null);
    // «Actualizar ahora»: con la identidad confirmada, queda pedido; la cajera no puede.
    const id = (await de()).id;
    rechazo(await local.app.impresion.aplicar(ctxCajera, { kind: "ACTUALIZAR_AGENTE", agenteId: id }, AHORA), "NO_PERMITIDO");
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTUALIZAR_AGENTE", agenteId: id }, AHORA + 2 * MIN));
    assert.equal((await de()).actualizacionPedida, new Date(AHORA + 2 * MIN).toISOString());
    assert.deepEqual(await local.app.impresion.actualizacionDe(local.sistema.tenantId, v.credencial), { agenteId: id, pedida: true });
    assert.equal(await local.app.impresion.actualizacionDe(local.sistema.tenantId, `${v.credencial}x`), null);
    assert.equal(await otro.app.impresion.actualizacionDe(otro.sistema.tenantId, v.credencial), null, "la credencial no vale en otro tenant");
    // Entra con otra versión: se cambió, y lo pedido queda resuelto.
    assert.ok(await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial, "0.86.0", AHORA + 3 * MIN));
    const despues = await de();
    assert.equal(despues.version, "0.86.0");
    assert.equal(despues.actualizacionPedida, null);
    assert.deepEqual(despues.ultimaActualizacion, { resultado: "ACTUALIZADO", version: "0.86.0", detalle: "Antes, la 0.85.0.", en: new Date(AHORA + 3 * MIN).toISOString() });
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "print_agent", entityId: id });
    assert.ok(asientos.some((x) => x.action === "agente.actualizar"));
    assert.deepEqual(asientos.find((x) => x.action === "agente.version" && (x.after as { version?: string }).version === "0.86.0")?.before, { version: "0.85.0" });
  });

  test("lo que no salió lo cuenta el agente: la huella equivocada o la versión que no arrancó", async () => {
    const a = await agente(local, ctxAdmin, "Laptop nota");
    rechazo(await local.app.impresion.anotarActualizacion(a, { version: "0.87.0", resultado: "SE_ROMPIO" }), "INVALIDO");
    valor(await local.app.impresion.anotarActualizacion(a, { version: "0.87.0", de: "0.86.0", resultado: "NO_ARRANCO", detalle: "La 0.87.0 no arrancó: volvió la 0.86.0." }, AHORA + 4 * MIN));
    const x = valor(await local.app.impresion.leer(ctxAdmin, AHORA + 5 * MIN)).agentes.find((y) => y.nombre === "Laptop nota")!;
    assert.deepEqual(x.ultimaActualizacion, { resultado: "NO_ARRANCO", version: "0.87.0", detalle: "La 0.87.0 no arrancó: volvió la 0.86.0.", en: new Date(AHORA + 4 * MIN).toISOString() });
    const [asiento] = (await local.app.auditoria.listar(local.sistema, { entityType: "print_agent", entityId: a.agenteId })).filter((y) => y.action === "agente.actualizacion");
    assert.equal(asiento!.outcome, "NEGADO");
    assert.equal(asiento!.reason, "La 0.87.0 no arrancó: volvió la 0.86.0.");
  });
});
