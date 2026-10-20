/**
 * Lo que el cierre dice de cada cuenta pendiente — v0.143.1 (el ticket n.º 3 de soporte, M-40).
 *
 * El 18 de octubre, al cerrar la caja del 17, dos cuentas de pie que nunca pidieron la cuenta no se podían cobrar y nadie
 * sabía por qué. Lo que fija: cada pendiente dice si es de pie o de qué mesa, quién la abrió y cuándo fue su último pedido;
 * y su estado dice si pidió la cuenta. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-17T23:37:00.000Z"); // 7:37 pm en Caracas
const MIN = 60_000;

let l: LocalDePrueba;
let mesera: Contexto;
let cajera: Contexto;
let refresco: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const usd = (minor: string) => ({ minor, currency: "USD" as const });

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Pendientes del salón");
  const m = await crearPersona(l, { nombre: "Emily Prueba", role: "MESERO", pin: "3175" });
  const c = await crearPersona(l, { nombre: "Dietina Prueba", role: "CAJERO", pin: "7391" });
  mesera = await contextoDe(l, await crearEquipo(l, "Tablet"), m, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), c, "7391");
  await planoDePrueba(l, 4);
  await impresoraDePrueba(l);
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: "2026-10-17" },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: "2026-10-17" },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  }
  refresco = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Refresco en lata", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "150" } }, AHORA - 50 * MIN),
  ).productos.find((p) => p.nombre === "Refresco en lata")!.id;
  valor(await l.app.turnos.abrir(cajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 40 * MIN));
});

after(async () => {
  await l.cerrar();
});

describe("lo que el cierre dice de cada cuenta pendiente (v0.143.1)", () => {
  test("una de pie que nunca pidió la cuenta dice quién la abrió, cuándo y su último pedido", async () => {
    const dePie = await sentarDePrueba(l, mesera, undefined, AHORA, { nombre: "Jorge" });
    valor(await l.app.pedidos.enviar(mesera, { pedidoId: randomUUID(), cuentaId: dePie.id, lineas: [{ productId: refresco, cantidad: 2, precioMinor: "150" }], repetir: true }, AHORA + MIN));
    const mesa = await sentarDePrueba(l, mesera, "mesa-2", AHORA + 2 * MIN);
    const { cuenta: conPedido } = valor(
      await l.app.pedidos.enviar(mesera, { pedidoId: randomUUID(), tableId: "mesa-2", lineas: [{ productId: refresco, cantidad: 1, precioMinor: "150" }], repetir: true }, AHORA + 3 * MIN),
    );
    assert.equal(conPedido.id, mesa.id);
    // La mesa 2 pidió la cuenta; la de pie, no.
    valor(await l.app.cuentas.guardar(mesera, { cuenta: { ...conPedido, status: "POR_COBRAR" } }, AHORA + 4 * MIN));

    const p = valor(await l.app.cortes.pendientes(cajera, undefined, AHORA + 5 * MIN));
    const jorge = p.cuentas.find((c) => c.id === dePie.id)!;
    assert.equal(jorge.status, "ABIERTA", "no pidió la cuenta: no está en la cola de la caja");
    assert.equal(jorge.dePie, true);
    assert.equal(jorge.mesa, null);
    assert.equal(jorge.abierta?.por, "Emily Prueba");
    assert.equal(jorge.abierta?.en, new Date(AHORA).toISOString());
    assert.equal(jorge.ultimoPedido, new Date(AHORA + MIN).toISOString());
    const dos = p.cuentas.find((c) => c.id === mesa.id)!;
    assert.deepEqual([dos.status, dos.dePie, dos.mesa], ["POR_COBRAR", false, "2"]);
  });

  test("traída a la caja (como «Pide la cuenta»), la de pie se cobra en la caja", async () => {
    const dePie = await sentarDePrueba(l, mesera, undefined, AHORA + 10 * MIN, { nombre: "Rosa" });
    const { cuenta } = valor(
      await l.app.pedidos.enviar(mesera, { pedidoId: randomUUID(), cuentaId: dePie.id, lineas: [{ productId: refresco, cantidad: 1, precioMinor: "150" }], repetir: true }, AHORA + 11 * MIN),
    );
    // La caja la pasa a la cola: guarda la cuenta POR_COBRAR, con su permiso de cobrar.
    const enCola = valor(await l.app.cuentas.guardar(cajera, { cuenta: { ...cuenta, status: "POR_COBRAR" } }, AHORA + 12 * MIN));
    assert.equal(enCola.status, "POR_COBRAR");
    const total = "174"; // $ 1,50 + IVA 16 %
    const cobro = valor(
      await l.app.cuentas.cobrar(
        cajera,
        { idempotencyKey: randomUUID(), accountId: enCola.id, version: enCola.version, lineIds: enCola.lines.filter((x) => !x.paid).map((x) => x.id), total: usd(total), pagos: [{ method: "EFECTIVO_USD", amount: usd(total) }], destinoSobra: "VUELTO", cliente: { kind: "IDENTIFICADO", name: "Rosa Prueba", document: "V-30111222" } },
        AHORA + 13 * MIN,
      ),
    );
    assert.equal(cobro.cuenta.status, "COBRADA");
  });
});
