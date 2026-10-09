/**
 * La impresora por USB, su página de códigos y la impresión oscura, contra l2control_test — B5-4, M-34.
 *
 * Una impresora por USB es de un equipo: la imprime su agente, y solo si contó sus impresoras de Windows (uno de antes
 * no sabría). Lo de la red no le aplica (IP, VLAN, IP fija). Cada trabajo sale con la página y la tinta de su impresora.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AgenteAbierto, Contexto } from "../index.ts";
import { encolarEn } from "./impresion.ts";
import { abrirLocalDePrueba, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let deCaja: AgenteAbierto;
let deOficina: AgenteAbierto;
let usb: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
type Rechazado = { ok: boolean; motivo?: string; problemas?: readonly { path: readonly PropertyKey[] }[] };
const rechazo = (crudo: unknown, motivo: string): Rechazado => {
  const r = crudo as Rechazado;
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.motivo, motivo, JSON.stringify(r));
  return r;
};
const porUsb = (agenteId: string, extra: Record<string, unknown> = {}) => ({
  nombre: "Caja USB",
  conexion: "USB",
  agenteId,
  nombreEnWindows: "XP-80C",
  ancho: 80,
  recibos: true,
  comandas: true,
  ...extra,
});

async function agente(nombre: string): Promise<AgenteAbierto> {
  const { codigo } = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "VINCULAR_AGENTE", nombre }, AHORA));
  const v = valor(await local.app.impresion.vincular(local.sistema.tenantId, { codigo }, AHORA + MIN));
  return (await local.app.impresion.abrirAgente(local.sistema.tenantId, v.credencial))!;
}

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Impresión por USB");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  deCaja = await agente("Laptop de caja");
  deOficina = await agente("Laptop de oficina");
});

describe("la impresora por USB (B5-4)", () => {
  test("es de un equipo con su agente y su nombre en Windows; se enciende sin las garantías de la red", async () => {
    const sinEquipo = rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: { ...porUsb(deCaja.agenteId), agenteId: undefined } }, AHORA), "INVALIDO");
    assert.ok(sinEquipo.problemas?.some((p) => p.path.includes("agenteId")));
    rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: porUsb("0199a0c0-0000-7000-8000-00000000dead") }, AHORA), "INVALIDO");

    const r = valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: porUsb(deCaja.agenteId, { pagina: "WPC1252", oscura: true }) }, AHORA));
    const i = r.local.impresoras.find((x) => x.nombre === "Caja USB")!;
    usb = i.id;
    assert.deepEqual(
      [i.conexion, i.ip, i.puerto, i.agenteId, i.nombreEnWindows, i.pagina, i.oscura, i.enVlanDeHardware, i.ipFija],
      ["USB", "", 0, deCaja.agenteId, "XP-80C", "WPC1252", true, false, false],
    );
    // Por USB no hay VLAN ni IP fija que confirmar.
    valor(await local.app.impresion.aplicar(ctxAdmin, { kind: "ACTIVAR", impresoraId: usb, activa: true }, AHORA));
    // El mismo aparato dos veces (mismo equipo y nombre en Windows), no.
    rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: porUsb(deCaja.agenteId, { nombre: "Otra" }) }, AHORA), "CONFLICTO");
    // Por red sigue pidiendo su IP.
    const sinIp = rechazo(await local.app.impresion.aplicar(ctxAdmin, { kind: "CREAR", datos: { nombre: "Red", conexion: "RED", ancho: 80, recibos: true, comandas: false } }, AHORA), "INVALIDO");
    assert.ok(sinIp.problemas?.some((p) => p.path.includes("ip")));
  });

  test("lo suyo lo toma solo su agente y cuando contó sus impresoras; sale con su página y oscura", async () => {
    const t = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      encolarEn(tx, ctxAdmin, { tipo: "PRUEBA", titulo: "Recibo", documento: { renglones: [{ tipo: "TEXTO", texto: "Niño ñ" }] }, para: "recibos" }, AHORA),
    );
    assert.ok(!("ok" in t));
    assert.equal(await local.app.impresion.reclamar(deOficina, AHORA), null, "el de otro equipo no la toma");
    assert.equal(await local.app.impresion.reclamar(deCaja, AHORA), null, "sin contar sus impresoras no la toma (es de antes)");

    rechazo(await local.app.impresion.anotarImpresorasDeWindows(deCaja, { impresoras: [1, 2] }, AHORA), "INVALIDO");
    assert.equal(valor(await local.app.impresion.anotarImpresorasDeWindows(deCaja, { impresoras: ["XP-80C", "Microsoft Print to PDF", "XP-80C"] }, AHORA)).anotadas, 2);
    const leido = valor(await local.app.impresion.leer(ctxAdmin, AHORA + MIN));
    assert.deepEqual(leido.agentes.find((a) => a.id === deCaja.agenteId)?.impresorasDeWindows, ["Microsoft Print to PDF", "XP-80C"]);
    assert.equal(leido.agentes.find((a) => a.id === deOficina.agenteId)?.impresorasDeWindows, null);

    assert.equal(await local.app.impresion.reclamar(deOficina, AHORA), null);
    const j = (await local.app.impresion.reclamar(deCaja, AHORA))!;
    assert.equal(j.id, t.id);
    assert.equal(j.impresoraDeWindows, "XP-80C");
    assert.equal(j.ip, undefined);
    const b = [...Buffer.from(j.bytes, "base64")];
    // Iniciar, sin modo chino, página 1252 (ESC t 16) y doble pasada; la ñ, en la 1252.
    assert.deepEqual(b.slice(0, 10), [0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 16, 0x1b, 0x47, 1]);
    assert.ok(b.includes(0xf1));
    assert.equal(valor(await local.app.impresion.responder(deCaja, { trabajoId: t.id, ok: true }, AHORA)).estado, "CONFIRMADO");
  });

  test("probar acentos: el mismo texto con cada página, en un solo papel", async () => {
    const t = valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: usb, acentos: true }, AHORA + 2 * MIN));
    assert.match(t.titulo, /^Prueba de acentos/);
    assert.match(t.vistaPrevia, /página PC850/);
    const j = (await local.app.impresion.reclamar(deCaja, AHORA + 2 * MIN))!;
    const b = [...Buffer.from(j.bytes, "base64")];
    for (const n of [2, 19, 16, 0]) assert.ok(b.some((x, k) => x === 0x1b && b[k + 1] === 0x74 && b[k + 2] === n), `ESC t ${n}`);
    valor(await local.app.impresion.responder(deCaja, { trabajoId: j.id, ok: true }, AHORA + 2 * MIN));
    // La prueba de siempre dice por dónde va.
    assert.match(valor(await local.app.impresion.imprimirPrueba(ctxAdmin, { impresoraId: usb }, AHORA + 3 * MIN)).vistaPrevia, /USB · XP-80C/);
  });
});
