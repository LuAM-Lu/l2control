/**
 * Los agentes de impresión con un servidor y clientes de verdad, sin base (ADR-026): la credencial en
 * el apretón de manos, el aviso solo a la sucursal del agente, reclamar y responder, y la vinculación
 * por HTTP con su tope. Y lo de T-8c: la versión que dice al entrar, su nota de actualización y «revisar-version».
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as cliente, type Socket } from "socket.io-client";
import type { AgenteAbierto } from "@l2/application";
import { crearCanalDeImpresion, type CanalDeImpresion } from "./impresion.ts";

const T = "0199a0c0-0000-7000-8000-00000000a001";
const B1 = "0199a0c0-0000-7000-8000-00000000b001";
const B2 = "0199a0c0-0000-7000-8000-00000000b002";
const AGENTES: Record<string, AgenteAbierto> = {
  "l2ag_caja-b1": { agenteId: "a1", tenantId: T, branchId: B1, nombre: "Caja B1" },
  "l2ag_caja-b2": { agenteId: "a2", tenantId: T, branchId: B2, nombre: "Caja B2" },
};
const TRABAJO = { id: "0199a0c0-0000-7000-8000-00000000f001", ip: "192.168.1.50", puerto: 9100, bytes: "G0AbdAI=" };

let impresion: CanalDeImpresion;
let url: string;
let io: Server;
const respuestas: unknown[] = [];
const versiones: unknown[] = [];
const notas: unknown[] = [];
const abiertos: Socket[] = [];

function conectar(credencial: string, version?: string): Promise<Socket> {
  const s = cliente(`${url}/impresion`, { path: "/tiempo-real", auth: { credencial, ...(version ? { version } : {}) }, transports: ["websocket"], reconnection: false, forceNew: true });
  abiertos.push(s);
  return new Promise((ok, mal) => {
    s.on("connect", () => ok(s));
    s.on("connect_error", mal);
  });
}
const recibir = (s: Socket, evento: string, ms = 300): Promise<boolean> =>
  new Promise((ok) => {
    const t = setTimeout(() => ok(false), ms);
    s.once(evento, () => {
      clearTimeout(t);
      ok(true);
    });
  });

before(async () => {
  const http = createServer((req, res) => {
    if (!impresion.atenderHttp(req, res)) res.writeHead(404).end();
  });
  io = new Server(http, { path: "/tiempo-real", serveClient: false });
  impresion = crearCanalDeImpresion({
    io,
    casos: {
      abrirAgente: async (c, v) => {
        versiones.push(v);
        return typeof c === "string" ? (AGENTES[c] ?? null) : null;
      },
      reclamar: async (a) => (a.branchId === B1 ? TRABAJO : null),
      responder: async (_a, r) => {
        respuestas.push(r);
        return { ok: true, valor: { estado: "CONFIRMADO" } };
      },
      vincular: async (x) =>
        (x as { codigo?: string })?.codigo === "K7MQ-4XPZ"
          ? { ok: true, valor: { agenteId: "a3", nombre: "Nueva", credencial: "l2ag_x" } }
          : { ok: false, motivo: "NO_PERMITIDO", mensaje: "Ese código no vale" },
      anotarImpresorasDeWindows: async () => ({ ok: true, valor: { anotadas: 0 } }),
      anotarActualizacion: async (a, n) => {
        notas.push({ agente: a.agenteId, n });
        return { ok: true, valor: { anotada: true } };
      },
    },
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

after(async () => {
  for (const s of abiertos) s.disconnect();
  await io.close();
});

describe("el agente en el apretón de manos", () => {
  test("sin credencial buena no entra", async () => {
    await assert.rejects(conectar("l2ag_falsa"));
    await assert.rejects(conectar(""));
  });

  test("al entrar se le avisa que mire la cola; reclama y responde", async () => {
    const s = cliente(`${url}/impresion`, { path: "/tiempo-real", auth: { credencial: "l2ag_caja-b1" }, transports: ["websocket"], reconnection: false, forceNew: true });
    abiertos.push(s);
    assert.equal(await recibir(s, "hay-trabajo", 2000), true);
    const t = await s.emitWithAck("reclamar");
    assert.deepEqual(t, TRABAJO);
    const r = await s.emitWithAck("resultado", { trabajoId: TRABAJO.id, ok: true });
    assert.deepEqual(r, { ok: true, valor: { estado: "CONFIRMADO" } });
    assert.deepEqual(respuestas.at(-1), { trabajoId: TRABAJO.id, ok: true });
    assert.deepEqual(impresion.conectados().map((a) => a.agenteId), ["a1"]);
  });

  test("el aviso llega solo a los agentes de su sucursal; echar lo desconecta", async () => {
    const b1 = await conectar("l2ag_caja-b1");
    const b2 = await conectar("l2ag_caja-b2");
    await new Promise((r) => setTimeout(r, 100));
    const [en1, en2] = [recibir(b1, "hay-trabajo"), recibir(b2, "hay-trabajo")];
    impresion.avisar([B2]);
    assert.deepEqual([await en1, await en2], [false, true]);
    const fuera = new Promise((ok) => b2.once("disconnect", ok));
    impresion.echar(new Set(["a2"]));
    await fuera;
    assert.ok(!impresion.conectados().some((a) => a.agenteId === "a2"));
  });
});

describe("la actualización del agente (T-8c)", () => {
  test("dice su versión al entrar, cuenta su nota y «Actualizar ahora» llega solo a su sucursal", async () => {
    const b1 = await conectar("l2ag_caja-b1", "0.85.0");
    const b2 = await conectar("l2ag_caja-b2", "0.85.0");
    assert.equal(versiones.at(-1), "0.85.0");
    const nota = { version: "0.86.0", de: "0.85.0", resultado: "HUELLA_EQUIVOCADA", detalle: "No coincide" };
    assert.deepEqual(await b1.emitWithAck("actualizacion", nota), { ok: true, valor: { anotada: true } });
    assert.deepEqual(notas.at(-1), { agente: "a1", n: nota });
    const [en1, en2] = [recibir(b1, "revisar-version"), recibir(b2, "revisar-version")];
    impresion.revisarVersion([B1]);
    assert.deepEqual([await en1, await en2], [true, false]);
  });
});

describe("la vinculación por HTTP", () => {
  const vincular = (cuerpo: string) => fetch(`${url}/impresion/vincular`, { method: "POST", headers: { "content-type": "application/json" }, body: cuerpo });

  test("un código bueno da la credencial; uno malo, no; y no se prueba sin fin", async () => {
    const bueno = await vincular(JSON.stringify({ codigo: "K7MQ-4XPZ" }));
    assert.equal(bueno.status, 200);
    assert.equal(((await bueno.json()) as { valor: { credencial: string } }).valor.credencial, "l2ag_x");
    assert.equal((await vincular(JSON.stringify({ codigo: "AAAA-AAAA" }))).status, 403);
    assert.equal((await vincular("no es json")).status, 400);
    let ultimo = 0;
    for (let i = 0; i < 10; i++) ultimo = (await vincular(JSON.stringify({ codigo: "AAAA-AAAA" }))).status;
    assert.equal(ultimo, 429);
    assert.equal((await fetch(`${url}/impresion/vincular`)).status, 405);
  });
});
