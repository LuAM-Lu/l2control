/**
 * El canal con un servidor de verdad y clientes de verdad, sin base ni Valkey: autorización en el
 * apretón de manos, una sucursal no oye a otra (F2-09) y el bus del restaurante revalidado.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as cliente, type Socket } from "socket.io-client";
import type { DatosDelTicket } from "@l2/application";
import { crearCanal, type Canal } from "./canal.ts";
import { almacenEnMemoria, TOPE_EVENTOS } from "./operacion.ts";

const T = "0199a0c0-0000-7000-8000-00000000a001";
const OTRO_T = "0199a0c0-0000-7000-8000-00000000a002";
const B1 = "0199a0c0-0000-7000-8000-00000000b001";
const B2 = "0199a0c0-0000-7000-8000-00000000b002";
const sesion = (n: number, branchId: string, tenantId = T): DatosDelTicket => ({
  tenantId,
  branchId,
  sessionId: `0199a0c0-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`,
  userId: "0199a0c0-0000-7000-8000-00000000c001",
  deviceId: "0199a0c0-0000-7000-8000-00000000d001",
});
/** Los tickets «válidos» de la prueba: el nombre dice de quién es. */
const TICKETS: Record<string, DatosDelTicket> = {
  "caja-b1": sesion(1, B1),
  "mesero-b1": sesion(2, B1),
  "caja-b2": sesion(3, B2),
  "otro-tenant": sesion(4, B1, OTRO_T),
};

const RELOJ = Date.parse("2026-09-29T18:00:00.000Z");
let canal: Canal;
let url: string;
const abiertos: Socket[] = [];

function conectar(ticket: string): Promise<Socket> {
  const s = cliente(url, { path: "/tiempo-real", auth: { ticket }, transports: ["websocket"], reconnection: false, forceNew: true });
  abiertos.push(s);
  return new Promise((ok, mal) => {
    s.on("connect", () => ok(s));
    s.on("connect_error", mal);
  });
}
const recibir = <T>(s: Socket, evento: string, ms = 300): Promise<T | null> =>
  new Promise((ok) => {
    const t = setTimeout(() => ok(null), ms);
    s.once(evento, (x: T) => {
      clearTimeout(t);
      ok(x);
    });
  });

before(async () => {
  const http = createServer();
  canal = crearCanal({
    http,
    tenantId: T,
    abrir: async (t) => (typeof t === "string" ? (TICKETS[t] ?? null) : null),
    almacen: almacenEnMemoria(),
    ahora: () => RELOJ,
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

after(async () => {
  for (const s of abiertos) s.disconnect();
  await canal.cerrar();
});

describe("el apretón de manos", () => {
  test("sin ticket, con uno falso o de otro tenant, no entra", async () => {
    await assert.rejects(conectar(""), /NO_AUTORIZADO/);
    await assert.rejects(conectar("inventado"), /NO_AUTORIZADO/);
    await assert.rejects(conectar("otro-tenant"), /NO_AUTORIZADO/);
  });

  test("con un ticket bueno entra, y el canal sabe de qué sesión es", async () => {
    await conectar("caja-b1");
    assert.ok(canal.sesiones().includes(TICKETS["caja-b1"]!.sessionId));
  });
});

describe("una sucursal no oye a otra (F2-09)", () => {
  test("un cambio de la sucursal 1 llega a sus equipos y no a los de la 2", async () => {
    const [caja1, caja2] = await Promise.all([conectar("caja-b1"), conectar("caja-b2")]);
    const [en1, en2] = [recibir(caja1, "cambio"), recibir(caja2, "cambio")];
    canal.contar([{ branchId: B1, temas: ["sala", "cuentas"] }]);
    assert.deepEqual(await en1, { temas: ["sala", "cuentas"] });
    assert.equal(await en2, null);
  });

  test("lo que es de todo el tenant (sin sucursal) llega a todas", async () => {
    const [caja1, caja2] = await Promise.all([conectar("caja-b1"), conectar("caja-b2")]);
    const [en1, en2] = [recibir(caja1, "cambio"), recibir(caja2, "cambio")];
    canal.contar([{ branchId: null, temas: ["equipos"] }]);
    assert.deepEqual(await en1, { temas: ["equipos"] });
    assert.deepEqual(await en2, { temas: ["equipos"] });
  });

  test("echar a una sesión cierra su canal", async () => {
    const mesero = await conectar("mesero-b1");
    const cerrado = new Promise((ok) => mesero.once("disconnect", ok));
    canal.echar(new Set([TICKETS["mesero-b1"]!.sessionId]));
    await cerrado;
    assert.equal(mesero.connected, false);
  });
});

describe("el bus del restaurante", () => {
  const evento = { id: "e1", at: "2020-01-01T00:00:00.000Z", type: "mesa.pide_cuenta", tableId: "m4" };

  test("llega a los demás equipos de la sucursal con la hora del servidor, no a otra sucursal", async () => {
    const [mesero, caja, otra] = await Promise.all([conectar("mesero-b1"), conectar("caja-b1"), conectar("caja-b2")]);
    const [enCaja, enOtra] = [recibir<{ at: string }>(caja, "operacion"), recibir(otra, "operacion")];
    const r = await mesero.emitWithAck("operacion", evento);
    assert.equal(r.ok, true);
    assert.equal(r.evento.at, new Date(RELOJ).toISOString());
    assert.equal((await enCaja)?.at, new Date(RELOJ).toISOString());
    assert.equal(await enOtra, null);
  });

  test("quien llega tarde se pone al día con lo de su sucursal", async () => {
    const tarde = await conectar("caja-b1");
    const eventos = await tarde.emitWithAck("operacion:al-dia");
    assert.ok(eventos.some((e: { id: string }) => e.id === "e1"));
    const otra = await conectar("caja-b2");
    assert.deepEqual(await otra.emitWithAck("operacion:al-dia"), []);
  });

  test("lo que ya sabe el servidor o no cumple el contrato se rechaza", async () => {
    const s = await conectar("mesero-b1");
    assert.equal((await s.emitWithAck("operacion", { ...evento, id: "e2", type: "estancia.cerrada", sessionId: "x" })).ok, false);
    assert.equal((await s.emitWithAck("operacion", { id: "e3", type: "mesa.libre" })).ok, false);
    assert.equal((await s.emitWithAck("operacion", "texto")).ok, false);
  });

  test(`una conexión no manda más de ${TOPE_EVENTOS} eventos seguidos`, async () => {
    const s = await conectar("mesero-b1");
    const respuestas = [];
    for (let i = 0; i < TOPE_EVENTOS + 2; i++) respuestas.push(await s.emitWithAck("operacion", { ...evento, id: `r${i}` }));
    assert.equal(respuestas.filter((r) => r.ok).length, TOPE_EVENTOS);
    assert.match(respuestas.at(-1).motivo, /Demasiados/);
  });
});
