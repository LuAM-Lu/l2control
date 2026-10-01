/**
 * El agente contra un Socket.io de verdad: si el servidor lo rechaza en el apretón de manos (la base no
 * respondió), vuelve a intentarlo solo; al entrar vacía la cola y responde por cada trabajo.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { crearAgente, type Agente } from "./agente.ts";

const TRABAJO = { id: "0199a0c0-0000-7000-8000-00000000f001", ip: "192.168.1.50", puerto: 9100, bytes: "G0AbdAI=" };
let io: Server;
let agente: Agente;
after(async () => {
  agente?.parar();
  await io?.close();
});

test("rechazado una vez, vuelve solo; vacía la cola y responde", async () => {
  const http = createServer();
  io = new Server(http, { path: "/tiempo-real" });
  let intentos = 0;
  let pendientes = [TRABAJO];
  const resultados: unknown[] = [];
  const espacio = io.of("/impresion");
  espacio.use((socket, siguiente) => {
    intentos += 1;
    if (intentos === 1) return siguiente(new Error("NO_DISPONIBLE"));
    if ((socket.handshake.auth as { credencial?: string }).credencial !== "l2ag_buena") return siguiente(new Error("NO_AUTORIZADO"));
    siguiente();
  });
  espacio.on("connection", (s) => {
    s.emit("hay-trabajo");
    s.on("reclamar", (responder: (t: unknown) => void) => responder(pendientes.shift() ?? null));
    s.on("resultado", (r: unknown, responder: (x: unknown) => void) => {
      resultados.push(r);
      responder({ ok: true, valor: { estado: "CONFIRMADO" } });
    });
  });
  await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  const impresos: string[] = [];
  agente = crearAgente({
    servidor: url,
    credencial: "l2ag_buena",
    imprimir: async (d) => {
      impresos.push(`${d.ip}:${d.puerto}`);
      return { ok: true };
    },
    registro: { info: () => undefined, error: () => undefined },
    esperaErrorMs: 200,
  });
  for (let i = 0; i < 50 && resultados.length === 0; i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(intentos >= 2, "volvió a intentarlo tras el rechazo");
  assert.deepEqual(impresos, ["192.168.1.50:9100"]);
  assert.deepEqual(resultados, [{ trabajoId: TRABAJO.id, ok: true }]);
  pendientes = [];
});
