/**
 * Imprimir contra una impresora falsa de verdad (un servidor TCP): llegan los bytes, se respeta lo
 * que dice del papel y un aparato que no está se dice con su dirección (ADR-015, ADR-026).
 */
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import type { AddressInfo } from "node:net";
import { imprimir } from "./imprimir.ts";

const abiertos: Server[] = [];
after(() => abiertos.forEach((s) => s.close()));

/** Una impresora falsa: guarda lo que recibe y contesta al papel con `estado` (o calla con `null`). */
async function impresora(estado: number | null): Promise<{ puerto: number; recibido: () => Buffer }> {
  const trozos: Buffer[] = [];
  const s = createServer((c) => {
    c.on("data", (d: Buffer) => {
      trozos.push(d);
      if (estado !== null && d.includes(Buffer.from([0x10, 0x04, 0x04]))) c.write(Buffer.from([estado]));
    });
  });
  abiertos.push(s);
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  return { puerto: (s.address() as AddressInfo).port, recibido: () => Buffer.concat(trozos) };
}

const BYTES = Uint8Array.from([0x1b, 0x40, 0x48, 0x6f, 0x6c, 0x61, 0x0a]);

describe("imprimir por TCP 9100", () => {
  test("con papel, llegan la pregunta y los bytes, y se confirma", async () => {
    const p = await impresora(0x12);
    const r = await imprimir({ ip: "127.0.0.1", puerto: p.puerto }, BYTES);
    assert.deepEqual(r, { ok: true });
    await new Promise((x) => setTimeout(x, 50));
    assert.deepEqual([...p.recibido()], [0x10, 0x04, 0x04, ...BYTES]);
  });

  test("sin papel no se manda nada y falla diciéndolo", async () => {
    const p = await impresora(0x72);
    assert.deepEqual(await imprimir({ ip: "127.0.0.1", puerto: p.puerto }, BYTES), { ok: false, error: "Sin papel" });
    await new Promise((x) => setTimeout(x, 50));
    assert.deepEqual([...p.recibido()], [0x10, 0x04, 0x04]);
  });

  test("con poco papel imprime y lo avisa; una que no contesta al papel imprime igual", async () => {
    assert.deepEqual(await imprimir({ ip: "127.0.0.1", puerto: (await impresora(0x1e)).puerto }, BYTES), { ok: true, aviso: "Queda poco papel" });
    const muda = await impresora(null);
    assert.deepEqual(await imprimir({ ip: "127.0.0.1", puerto: muda.puerto }, BYTES, { papelMs: 100 }), { ok: true });
    await new Promise((x) => setTimeout(x, 50));
    assert.equal(muda.recibido().length, 3 + BYTES.length);
  });

  test("una impresora que no está se dice con su dirección", async () => {
    const libre = await impresora(null);
    const puerto = libre.puerto;
    await new Promise<void>((ok) => abiertos.pop()!.close(() => ok()));
    const r = await imprimir({ ip: "127.0.0.1", puerto }, BYTES);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, new RegExp(`127\\.0\\.0\\.1:${puerto} rechaza la conexión`));
  });
});
