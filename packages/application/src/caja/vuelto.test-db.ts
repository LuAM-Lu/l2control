/**
 * El vuelto por partes, contra l2control_test — B3-19 (M-37, U-12).
 *
 * Lo que fijan: el vuelto se da en efectivo $, en efectivo Bs (a la tasa del cobro) o por Pago Móvil, o repartido; cada
 * parte sale de su medio y de su moneda (la gaveta de $ y la de Bs lo dicen), el libro cuadra y la venta dice cómo se
 * dio (la referencia, enmascarada); sin decirlo, todo en efectivo $ como antes; las partes que no suman, o en Bs sin
 * tasa, no se cobran; y anular el cobro revierte también un vuelto por Pago Móvil.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, FACTURA_DE_PRUEBA, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T17:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;

let local: LocalDePrueba;
let marisol: Contexto;
let admin: string;
let agua: string;
let tasa: string;
let turno: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
/** Un agua en la cola: $ 1,00 + IVA = $ 1,16. */
const unAgua = async () =>
  valor(
    await local.app.cuentas.guardar(
      marisol,
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
          lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: agua, taxCode: "GENERAL" }],
        },
      },
      AHORA,
    ),
  );
/** Cobra $ 1,16 con un billete de $ 20: sobran $ 18,84. */
const conVeinte = (c: FamilyAccountDto, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  lineIds: c.lines.map((l) => l.id),
  total: usd("116"),
  pagos: [{ method: "EFECTIVO_USD", amount: usd("2000") }],
  destinoSobra: "VUELTO",
  cliente: FACTURA_DE_PRUEBA,
  ...extra,
});
const vueltosDe = (cobroKey: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) =>
    tx.payment.findMany({ where: { operationKey: cobroKey, kind: "VUELTO", reversesId: null }, orderBy: { line: "asc" }, select: { method: true, amountMinor: true, currency: true, rateId: true } }),
  );
const gaveta = () => local.base.conTenant(local.sistema.tenantId, (tx) => esperadoEnGaveta(tx, turno));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "El vuelto");
  const a = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  marisol = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "7391");
  const FONDO = { fondos: [{ currency: "USD", amount: usd("10000") }, { currency: "VES", amount: { minor: "5000000", currency: "VES" } }] };
  turno = valor(await local.app.turnos.abrir(marisol, FONDO, undefined, AHORA - 2 * MIN)).id;
  tasa = valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 10 * MIN));
  }
  const catalogo = valor(
    await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100", area: "SIN_PAPEL" } }, AHORA - 5 * MIN),
  );
  agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
  valor(await local.app.medios.aplicar(local.sistema, { kind: "DATOS_PAGO_MOVIL", datos: { bankCode: "0134", phone: "0414-2345678", document: "J-40123456-7" } }));
  valor(await local.app.medios.aplicar(local.sistema, { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true }));
});

after(async () => {
  await local.cerrar();
});

describe("el vuelto (B3-19)", () => {
  test("sin decirlo, todo en efectivo $, como antes", async () => {
    const cmd = conVeinte(await unAgua());
    const r = valor(await local.app.cuentas.cobrar(marisol, cmd, AHORA));
    assert.deepEqual(await vueltosDe(cmd.idempotencyKey), [{ method: "EFECTIVO_USD", amountMinor: 1884n, currency: "USD", rateId: null }]);
    assert.equal(r.venta.sobra?.vuelto, undefined, "la venta queda como las de antes");
  });

  test("repartido: los dólares en billetes y los centavos en bolívares, cada parte de su gaveta", async () => {
    const antes = await gaveta();
    const cmd = conVeinte(await unAgua(), {
      rateId: tasa,
      vuelto: [
        { method: "EFECTIVO_USD", enDolares: usd("1800") },
        { method: "EFECTIVO_VES", enDolares: usd("84") },
      ],
    });
    const r = valor(await local.app.cuentas.cobrar(marisol, cmd, AHORA));
    const vueltos = await vueltosDe(cmd.idempotencyKey);
    // $ 0,84 × 855,6625 = Bs 718,7565 → Bs 718,76.
    assert.deepEqual(vueltos.map((v) => [v.method, v.amountMinor, v.currency, v.rateId !== null]), [
      ["EFECTIVO_USD", 1800n, "USD", false],
      ["EFECTIVO_VES", 71876n, "VES", true],
    ]);
    assert.deepEqual(r.libro.aplicado, usd("116"), "el libro cuadra al céntimo");
    assert.deepEqual(r.venta.sobra?.vuelto?.map((p) => [p.methodCode, p.amount.minor, p.enDolares.minor]), [
      ["EFECTIVO_USD", "1800", "1800"],
      ["EFECTIVO_VES", "71876", "84"],
    ]);
    const despues = await gaveta();
    assert.equal(despues.get("USD")!.amount - antes.get("USD")!.amount, 2000n - 1800n);
    assert.equal(despues.get("VES")!.amount - antes.get("VES")!.amount, -71876n);
  });

  test("por Pago Móvil, con su referencia: la venta la dice enmascarada; anular el cobro también lo revierte", async () => {
    const c = await unAgua();
    const cmd = conVeinte(c, { rateId: tasa, vuelto: [{ method: "PAGO_MOVIL", enDolares: usd("1884"), referencia: "987654321", banco: "0105" }] });
    const r = valor(await local.app.cuentas.cobrar(marisol, cmd, AHORA));
    assert.deepEqual((await vueltosDe(cmd.idempotencyKey)).map((v) => [v.method, v.currency]), [["PAGO_MOVIL", "VES"]]);
    assert.equal(r.venta.sobra?.vuelto?.[0]?.referencia, "Banco 0105 · Ref. ···4321");
    const anulada = valor(
      await local.app.cuentas.anular(
        marisol,
        { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cmd.idempotencyKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
        { autorizadorId: admin, pin: "4826", motivo: "Cobro repetido" },
        AHORA + MIN,
      ),
    );
    assert.deepEqual(anulada.libro.vuelto, usd("0"));
  });

  test("la gaveta dice si alcanza cada moneda, sin decir cuánto hay (el arqueo es a ciegas)", async () => {
    const hay = await gaveta();
    const justo = await local.app.vuelto.alcanza(marisol, { salidas: [{ minor: String(hay.get("USD")!.amount), currency: "USD" }] });
    assert.deepEqual(valor(justo), { faltan: [] });
    const mucho = await local.app.vuelto.alcanza(marisol, { salidas: [usd("100"), { minor: String(hay.get("VES")!.amount + 1n), currency: "VES" }] });
    assert.deepEqual(valor(mucho), { faltan: ["VES"] });
  });

  test("no se cobra si las partes no suman lo que sobra, en bolívares sin tasa, o con vuelto que no es vuelto", async () => {
    const c = await unAgua();
    const noSuma = await local.app.cuentas.cobrar(marisol, conVeinte(c, { rateId: tasa, vuelto: [{ method: "EFECTIVO_USD", enDolares: usd("1800") }] }), AHORA);
    assert.equal(!noSuma.ok && noSuma.problemas?.[0]?.message, "VUELTO_NO_CUADRA");
    const sinTasa = await local.app.cuentas.cobrar(marisol, conVeinte(c, { vuelto: [{ method: "EFECTIVO_VES", enDolares: usd("1884") }] }), AHORA);
    assert.equal(!sinTasa.ok && sinTasa.motivo, "INVALIDO");
    const propina = await local.app.cuentas.cobrar(marisol, conVeinte(c, { destinoSobra: "PROPINA", vuelto: [{ method: "EFECTIVO_USD", enDolares: usd("1884") }] }), AHORA);
    assert.equal(!propina.ok && propina.motivo, "INVALIDO");
    const sinReferencia = await local.app.cuentas.cobrar(marisol, conVeinte(c, { rateId: tasa, vuelto: [{ method: "PAGO_MOVIL", enDolares: usd("1884") }] }), AHORA);
    assert.equal(!sinReferencia.ok && sinReferencia.motivo, "INVALIDO");
  });
});
