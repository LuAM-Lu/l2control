/**
 * «Cobrar lo que va» — B3-28 (M-40), contra l2control_test.
 *
 * Lo que fija: una mesa paga lo consumido hasta ahora y sigue abierta (el criterio: paga lo que va, pide un postre y la
 * caja le cobra solo el postre al irse); solo desde la mesa abierta (la que pidió la cuenta se cobra entera); volver a
 * pedir con ella en la cola la devuelve a la mesa sin «lo que va»; anular ese cobro no le cierra la mesa, y «Cobrarla de
 * nuevo» la devuelve a pagar lo que va; sin nada pendiente, se libera cobrada. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Martes 20 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-20T17:00:00.000Z");
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const FACTURA = { kind: "IDENTIFICADO" as const, name: "Prueba Rosa Mesa", document: "V-30111222" };

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { path: unknown[]; message: string }[] };

let l: LocalDePrueba;
let mesera: Contexto;
let cajera: Contexto;
let admin: string;
let refresco: string;

const pedir = (c: FamilyAccountDto, cantidad: number, en: number) =>
  l.app.pedidos.enviar(mesera, { pedidoId: randomUUID(), ...(c.tableId ? { tableId: c.tableId } : {}), cuentaId: c.id, lineas: [{ productId: refresco, cantidad, precioMinor: "150" }], repetir: true }, en);
/** «Pagar lo que va» desde la tablet: a la cola, sin cerrar la mesa. */
const aPagarLoQueVa = (c: FamilyAccountDto, en: number) => l.app.cuentas.guardar(mesera, { cuenta: { ...c, status: "POR_COBRAR", loQueVa: true } }, en);
/** «Pide la cuenta». */
const pideLaCuenta = (c: FamilyAccountDto, en: number) => {
  const { loQueVa: _, ...resto } = c;
  return l.app.cuentas.guardar(mesera, { cuenta: { ...resto, status: "POR_COBRAR" } }, en);
};
const cobrar = (c: FamilyAccountDto, total: string, en: number, clave = randomUUID()) =>
  l.app.cuentas.cobrar(
    cajera,
    { idempotencyKey: clave, accountId: c.id, version: c.version, lineIds: c.lines.filter((x) => !x.paid && !x.anulacion).map((x) => x.id), total: usd(total), pagos: [{ method: "EFECTIVO_USD", amount: usd(total) }], destinoSobra: "VUELTO", cliente: FACTURA },
    en,
  );

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba lo que va");
  const m = await crearPersona(l, { nombre: "Emily Prueba", role: "MESERO", pin: "3175" });
  const c = await crearPersona(l, { nombre: "Dietina Prueba", role: "CAJERO", pin: "7391" });
  admin = await crearPersona(l, { nombre: "Abigail Prueba", role: "ADMIN", pin: "4826" });
  mesera = await contextoDe(l, await crearEquipo(l, "Tablet"), m, "3175");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), c, "7391");
  await planoDePrueba(l, 6);
  await impresoraDePrueba(l);
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: "2026-10-20" },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: "2026-10-20" },
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

describe("cobrar lo que va (B3-28)", () => {
  test("el criterio: la mesa paga lo que va y sigue abierta; pide un postre y al irse se cobra solo el postre", async () => {
    const mesa = await sentarDePrueba(l, mesera, "mesa-1", AHORA);
    const { cuenta } = valor(await pedir(mesa, 2, AHORA + MIN));
    const enCola = valor(await aPagarLoQueVa(cuenta, AHORA + 2 * MIN));
    assert.deepEqual([enCola.status, enCola.loQueVa], ["POR_COBRAR", true]);
    // $ 3,00 + IVA 16 %.
    const primero = valor(await cobrar(enCola, "348", AHORA + 3 * MIN));
    assert.deepEqual([primero.cuenta.status, primero.cuenta.loQueVa, primero.cuenta.pendingSince], ["ABIERTA", undefined, undefined], "sigue abierta, fuera de la cola");
    assert.ok(primero.cuenta.lines.every((x) => x.paid), "lo pagado, pagado");
    assert.equal(primero.venta.total.minor, "348");
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirstOrThrow({ where: { entityId: cuenta.id, action: "cuenta.cobrar" } }));
    assert.equal((asiento.after as { sigueAbierta?: boolean }).sigueAbierta, true);
    // Piden el postre y se van: solo eso se cobra.
    const { cuenta: conPostre } = valor(await pedir(primero.cuenta, 1, AHORA + 20 * MIN));
    const alIrse = valor(await pideLaCuenta(conPostre, AHORA + 40 * MIN));
    assert.equal(alIrse.lines.filter((x) => !x.paid).length, 1);
    const segundo = valor(await cobrar(alIrse, "174", AHORA + 41 * MIN));
    assert.equal(segundo.cuenta.status, "COBRADA");
    assert.equal(segundo.venta.lineas.length, 1, "el recibo lleva el postre, no lo de antes");
  });

  test("solo desde la mesa abierta: la que pidió la cuenta se cobra entera", async () => {
    const mesa = await sentarDePrueba(l, mesera, "mesa-2", AHORA);
    const { cuenta } = valor(await pedir(mesa, 1, AHORA + MIN));
    const pidio = valor(await pideLaCuenta(cuenta, AHORA + 2 * MIN));
    const r = rechazo(await l.app.cuentas.guardar(mesera, { cuenta: { ...pidio, loQueVa: true } }, AHORA + 3 * MIN));
    assert.equal(r.problemas?.[0]?.message, "LO_QUE_VA_NO_VALE", JSON.stringify(r));
  });

  test("volver a pedir con ella en la cola la devuelve a la mesa, sin «lo que va»", async () => {
    const mesa = await sentarDePrueba(l, mesera, "mesa-3", AHORA);
    const { cuenta } = valor(await pedir(mesa, 1, AHORA + MIN));
    const enCola = valor(await aPagarLoQueVa(cuenta, AHORA + 2 * MIN));
    const { cuenta: devuelta } = valor(await pedir(enCola, 1, AHORA + 3 * MIN));
    assert.deepEqual([devuelta.status, devuelta.loQueVa], ["ABIERTA", undefined]);
  });

  test("anular ese cobro no cierra la mesa; «Cobrarla de nuevo» la devuelve a pagar lo que va", async () => {
    const mesa = await sentarDePrueba(l, mesera, "mesa-4", AHORA);
    const { cuenta } = valor(await pedir(mesa, 1, AHORA + MIN));
    const clave = randomUUID();
    const cobrada = valor(await cobrar(valor(await aPagarLoQueVa(cuenta, AHORA + 2 * MIN)), "174", AHORA + 3 * MIN, clave));
    assert.equal(cobrada.cuenta.status, "ABIERTA");
    const deNuevo = valor(
      await l.app.cuentas.anular(
        cajera,
        { idempotencyKey: randomUUID(), accountId: cuenta.id, cobroKey: clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }], camino: "COBRAR_DE_NUEVO" },
        { autorizadorId: admin, pin: "4826", motivo: "Cobro equivocado" },
        AHORA + 4 * MIN,
      ),
    );
    assert.deepEqual([deNuevo.cuenta.status, deNuevo.cuenta.loQueVa], ["POR_COBRAR", true]);
    const otra = valor(await cobrar(deNuevo.cuenta, "174", AHORA + 5 * MIN, randomUUID()));
    const entera = valor(
      await l.app.cuentas.anular(
        cajera,
        { idempotencyKey: randomUUID(), accountId: cuenta.id, cobroKey: otra.venta.cobroKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }], camino: "ANULAR_VENTA", inventario: "ESTANTE" },
        { autorizadorId: admin, pin: "4826", motivo: "No era de esta mesa" },
        AHORA + 6 * MIN,
      ),
    );
    assert.equal(entera.cuenta.status, "ABIERTA", "la mesa sigue sentada");
  });

  test("pagado lo que va y sin nada más, la mesa se libera cobrada", async () => {
    const mesa = await sentarDePrueba(l, mesera, "mesa-5", AHORA);
    const { cuenta } = valor(await pedir(mesa, 1, AHORA + MIN));
    const cobrada = valor(await cobrar(valor(await aPagarLoQueVa(cuenta, AHORA + 2 * MIN)), "174", AHORA + 3 * MIN));
    const libre = valor(await l.app.cuentas.liberarMesa(mesera, { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cobrada.cuenta.version }, AHORA + 30 * MIN));
    assert.equal(libre.status, "COBRADA");
  });
});
