/**
 * Medias en la entrada, contra l2control_test — B4-9 (M-27, P-6).
 *
 * Lo que fijan: sin producto de medias elegido, la entrada no las cobra (y lo dice); con él, quien no las trae paga
 * el par en la cuenta de su familia y sale del inventario; sin existencia (B4-16, M-35), el niño entra y no se le
 * cobran: se cobran los pares que quedan. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba, cedulaDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 27 de septiembre de 2026, 10:00 am en Caracas. */
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { message: string }[] };

let l: LocalDePrueba;
let monitora: Contexto;
let medias: string;
let pulsera = 0;
let telefono = 0;

const entrada = (ninos: { sinMedias?: true }[]) => ({
  idempotencyKey: randomUUID(),
  paymentMode: "CUENTA_ABIERTA",
  entries: ninos.map((n) => ({ wristbandCode: `MD-${String(++pulsera).padStart(4, "0")}`, ...(n.sinMedias ? { sinMedias: true } : {}), kid: {}, packageId: "pkg-60" })),
  guardian: { fullName: "Familia Medias", contactReference: `0426-${String(6_000_000 + ++telefono)}` }, guardianDocument: cedulaDePrueba(`0426-${String(6_000_000 + ++telefono)}`),
});
const existenciaDeMedias = async () => (await l.app.productos.leer(l.sistema)).productos.find((p) => p.id === medias)!.existencia;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba medias");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  const c: CatalogoDto = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Medias antideslizantes", categoria: "Parque", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "150" } }, AHORA - 10 * MIN),
  );
  medias = c.productos.find((p) => p.nombre === "Medias antideslizantes")!.id;
  valor(
    await l.app.entradas.registrar(
      l.sistema,
      { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: medias, bultos: 1, unidadesPorBulto: 2, costo: { por: "BULTO", minor: "100" } }] },
      AHORA - 9 * MIN,
    ),
  );
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
});

after(async () => {
  await l.cerrar();
});

describe("medias en la entrada", () => {
  test("sin producto de medias elegido, la entrada no las cobra y lo dice", async () => {
    const r = rechazo(await l.app.parque.entrar(monitora, entrada([{ sinMedias: true }]), AHORA));
    assert.equal(r.problemas?.[0]?.message, "SIN_PRODUCTO_DE_MEDIAS");
  });

  test("con el producto elegido, quien no las trae paga el par y sale del inventario", async () => {
    const v = await l.app.ajustes.leer(l.sistema);
    valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, productoMedias: medias } }));
    const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinMedias: true }, {}]), AHORA + MIN));
    const par = r.account.lines.filter((x) => x.productId === medias);
    assert.equal(par.length, 1);
    assert.equal(par[0]!.amount.minor, "150");
    assert.match(par[0]!.concept, /Medias antideslizantes · MD-/);
    assert.equal(par[0]!.sessionId, undefined, "es una venta, no tiempo del niño");
    assert.equal(await existenciaDeMedias(), 1);
  });

  test("sin existencia suficiente entran todos: se cobra el par que queda y al otro no (B4-16)", async () => {
    const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinMedias: true }, { sinMedias: true }]), AHORA + 2 * MIN));
    assert.equal(r.sessions.length, 2);
    const pares = r.account.lines.filter((x) => x.productId === medias);
    assert.equal(pares.length, 1, "solo el par que quedaba");
    assert.match(pares[0]!.concept, new RegExp(r.sessions[0]!.wristbandCode));
    assert.equal(await existenciaDeMedias(), 0);
  });

  test("sin ninguna en existencia, el niño entra y no se le cobran (B4-16)", async () => {
    const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinMedias: true }]), AHORA + 3 * MIN));
    assert.equal(r.sessions.length, 1);
    assert.equal(r.account.lines.filter((x) => x.productId === medias).length, 0);
    assert.equal(await existenciaDeMedias(), 0);
  });
});
