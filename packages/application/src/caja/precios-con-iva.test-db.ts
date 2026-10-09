/**
 * Los precios con el IVA incluido, contra l2control_test (ajuste de la sucursal `preciosConIva`).
 *
 * Lo que dice el menú es lo que paga el cliente: tres alitas de $ 6,00 se cobran $ 18,00 (con el IVA sumado
 * encima serían $ 20,88, y con la base redondeada plato a plato, $ 17,99). El IVA va dentro, la venta lo dice
 * y los pendientes del cierre enseñan lo mismo que se cobra. Con reloj fijo. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba, FACTURA_DE_PRUEBA } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let ctxCajera: Contexto;
let alitas: string;

/** Publica los ajustes vigentes con `preciosConIva` como se diga. */
async function conIva(si: boolean) {
  const v = await l.app.ajustes.leer(l.sistema);
  return l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, preciosConIva: si } });
}

/** Una venta de mostrador de `n` alitas, abierta en la caja. */
const mostrador = (n: number) =>
  l.app.cuentas.guardar(
    ctxCajera,
    {
      cuenta: {
        id: randomUUID(),
        kind: "MOSTRADOR",
        family: "Mostrador",
        mode: "PREPAGO",
        status: "POR_COBRAR",
        openedAt: new Date(AHORA).toISOString(),
        sessionIds: [],
        closedSessionIds: [],
        lines: Array.from({ length: n }, () => ({ id: randomUUID(), concept: "Alitas", kind: "RESTAURANTE", amount: usd("600"), paid: false, productId: alitas, taxCode: "GENERAL" })),
      },
    },
    AHORA,
  );
const cobrar = (c: FamilyAccountDto, total: string, entregado: string) =>
  l.app.cuentas.cobrar(
    ctxCajera,
    { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineIds: c.lines.map((x) => x.id), total: usd(total), pagos: [{ method: "EFECTIVO_USD", amount: usd(entregado) }], destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA },
    AHORA,
  );

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Precios con IVA");
  await impresoraDePrueba(l);
  const cajera = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxCajera = await contextoDe(l, await crearEquipo(l, "Caja 1"), cajera, "7391");
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 10 * MIN));
  }
  const catalogo = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Alitas", categoria: "Entradas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "600" } }, AHORA - 5 * MIN),
  );
  alitas = catalogo.productos.find((p) => p.nombre === "Alitas")!.id;
});

after(async () => {
  await l.cerrar();
});

describe("los precios con el IVA incluido", () => {
  test("de fábrica está apagado: el IVA se suma encima", async () => {
    assert.equal((await l.app.ajustes.leer(l.sistema)).ajustes.preciosConIva, false);
  });

  test("se enciende con la caja cerrada", async () => {
    const r = valor(await conIva(true));
    assert.equal(r.ajustes.preciosConIva, true);
  });

  test("tres alitas de $ 6,00 se cobran $ 18,00, con el IVA dentro, y la venta lo dice", async () => {
    valor(await l.app.turnos.abrir(ctxCajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 2 * MIN));
    const c = valor(await mostrador(3));
    // Lo que la caja enseñaría con el IVA aparte ($ 20,88) se rechaza: el servidor cobra lo que dice el menú.
    const caro = await cobrar(c, "2088", "2100");
    assert.equal(!caro.ok && caro.motivo, "CONFLICTO");
    const r = valor(await cobrar(c, "1800", "2000"));
    assert.equal(r.venta.total.minor, "1800");
    assert.equal(r.venta.ivaIncluido, true);
    assert.equal(r.venta.subtotal.minor, "1800");
    assert.deepEqual(r.venta.impuestos, [{ basisPoints: 1600, tax: usd("248") }]);
    assert.equal(r.venta.sobra?.amount.minor, "200");
  });

  test("los pendientes del cierre enseñan lo mismo que se cobrará", async () => {
    const c = valor(await mostrador(2));
    const p = valor(await l.app.cortes.pendientes(ctxCajera, undefined, AHORA));
    assert.equal(p.cuentas.find((x) => x.id === c.id)?.pendiente.minor, "1200");
  });

  test("con un turno abierto no se cambia: cambiaría lo que se cobra de cada cuenta", async () => {
    const r = await conIva(false);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.equal(!r.ok && r.problemas?.[0]?.path.join("."), "ajustes.preciosConIva");
    assert.equal((await l.app.ajustes.leer(l.sistema)).ajustes.preciosConIva, true);
  });
});
