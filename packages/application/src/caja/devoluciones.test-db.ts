/**
 * Un cliente devuelve parte de lo que compró, contra l2control_test — B3-14 (M-34).
 *
 * Lo que fijan: lo que vuelve (con su IVA) sale por el pago elegido como un asiento DEVOLUCION en el turno de hoy, y lo
 * que vuelve al estante entra al costo con que salió; una línea no vuelve dos veces, ni más de lo que queda de un pago, ni
 * lo que no cuadra; lo preparado no vuelve al estante y los servicios no se devuelven; una venta con devoluciones ya no se
 * anula entera; la caja necesita el PIN de administración (B3-18: el de supervisión ya no basta) y la monitora no
 * devuelve; el libro impone que una
 * devolución no pase de lo que entró. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto, VentaCerradaDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba, FACTURA_DE_PRUEBA } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-09T15:00:00.000Z");
const HOY = "2026-10-09";
const MIN = 60_000;

let local: LocalDePrueba;
let ctxCajera: Contexto;
let ctxSupervisor: Contexto;
let ctxMonitora: Contexto;
let supervisor: string;
let admin: string;
const ids: Record<string, string> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const motivoDe = (r: { ok: boolean; motivo?: string; problemas?: readonly { message: string }[] | undefined }) => (r.ok ? "OK" : (r.problemas?.[0]?.message ?? r.motivo));
const pinDeSupervisor = () => ({ autorizadorId: supervisor, pin: "5937", motivo: "Revisé el producto" });
/** B3-18 (M-37): devolver lo autoriza administración con su PIN. */
const pinDeAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Revisé el producto" });
const FONDO = { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };

const linea = (nombre: string, precio: string) => ({ id: randomUUID(), concept: nombre, kind: "RESTAURANTE" as const, amount: usd(precio), paid: false, productId: ids[nombre]!, taxCode: "GENERAL" as const });

/** Vende en el mostrador y cobra en efectivo en dólares; devuelve la venta. */
async function vender(lineas: ReturnType<typeof linea>[], total: string, entregado: string): Promise<VentaCerradaDto> {
  const cuenta = { id: randomUUID(), kind: "MOSTRADOR", family: "Mostrador", mode: "PREPAGO", status: "POR_COBRAR", openedAt: new Date(AHORA).toISOString(), sessionIds: [], closedSessionIds: [], lines: lineas };
  const c: FamilyAccountDto = valor(await local.app.cuentas.guardar(ctxCajera, { cuenta }, AHORA));
  const r = valor(
    await local.app.cuentas.cobrar(
      ctxCajera,
      { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineIds: c.lines.map((l) => l.id), total: usd(total), pagos: [{ method: "EFECTIVO_USD", amount: usd(entregado) }], destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA },
      AHORA,
    ),
  );
  return r.venta;
}
const devolucion = (venta: VentaCerradaDto, lineIds: string[], monto: string, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  saleId: venta.id,
  lineas: lineIds.map((lineId) => ({ lineId, destino: "ESTANTE" })),
  reintegros: [{ paymentIndex: 0, amount: usd(monto) }],
  motivo: "Vino dañado",
  ...extra,
});
const existencia = async (nombre: string) => (await local.app.productos.leer(ctxSupervisor)).productos.find((p) => p.id === ids[nombre])!.existencia;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Devoluciones");
  await impresoraDePrueba(local);
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Caja 2"), supervisor, "5937");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
  for (const ctx of [ctxCajera, ctxSupervisor]) valor(await local.app.turnos.abrir(ctx, FONDO, undefined, AHORA - 30 * MIN));
  valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "190.5", effectiveDate: HOY, valorVerificado: "190.5" }, AHORA - 20 * MIN));
  valor(await local.app.impuestos.programar(local.sistema, { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY }, AHORA - 20 * MIN));
  // El IGTF, en 0 % (V-13): el motor se queda, sin cobrarlo.
  valor(await local.app.impuestos.programar(local.sistema, { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY }, AHORA - 20 * MIN));
  for (const [nombre, tipo, precio] of [["Refresco", "PRODUCTO", "100"], ["Torta", "PREPARADO", "300"], ["Alquiler de disfraz", "SERVICIO", "500"]] as const) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo, precioMinor: precio } }, AHORA - 10 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  // 24 refrescos a $ 0,50.
  valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId: ids.Refresco!, bultos: 1, unidadesPorBulto: 24, costo: { por: "BULTO", minor: "1200" } }] }, AHORA - 5 * MIN));
});

after(async () => {
  await local.cerrar();
});

describe("devolver parte de una venta (B3-14)", () => {
  let venta: VentaCerradaDto;

  test("vuelve lo devuelto con su IVA, por su pago, en el turno de hoy; al estante, al costo con que salió", async () => {
    venta = await vender([linea("Refresco", "100"), linea("Refresco", "100"), linea("Refresco", "100")], "348", "500");
    assert.equal(await existencia("Refresco"), 21);
    const hecha = valor(await local.app.devoluciones.devolver(ctxCajera, devolucion(venta, [venta.lineas[0]!.lineId], "116"), pinDeAdmin(), AHORA + MIN));
    assert.equal(hecha.comprobanteNoImpreso, null);
    const d = hecha.venta.devoluciones[0]!;
    assert.deepEqual([d.total, d.iva, d.autorizo], [usd("116"), usd("16"), "Abigail Karam"]);
    // Lo que queda del pago baja; el libro tiene su asiento DEVOLUCION, que cita el cobro.
    assert.equal(BigInt(hecha.venta.payments[0]!.refundable.minor), BigInt(venta.payments[0]!.refundable.minor) - 116n);
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.payment.findMany({ where: { kind: "DEVOLUCION", refundsId: { not: null } } }));
    assert.ok(asientos.some((a) => a.amountMinor === -116n && a.currency === "USD"));
    // Al estante: entra uno, al costo con que salió ($ 0,50).
    assert.equal(await existencia("Refresco"), 22);
    const retorno = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findFirst({ where: { kind: "RETORNO", productId: ids.Refresco! } }));
    assert.deepEqual([retorno?.quantity, retorno?.valueMinor], [1, 50n]);
  });

  test("una línea no vuelve dos veces, ni más de lo que queda del pago, ni lo que no cuadra", async () => {
    const otra = await local.app.devoluciones.devolver(ctxSupervisor, devolucion(venta, [venta.lineas[0]!.lineId], "116"), pinDeAdmin(), AHORA + 2 * MIN);
    assert.equal(motivoDe(otra), "YA_DEVUELTA");
    const noCuadra = await local.app.devoluciones.devolver(ctxSupervisor, devolucion(venta, [venta.lineas[1]!.lineId], "100"), pinDeAdmin(), AHORA + 2 * MIN);
    assert.match(String(motivoDe(noCuadra)), /^NO_CUADRA/);
    const demasiado = await local.app.devoluciones.devolver(ctxSupervisor, devolucion(venta, [venta.lineas[1]!.lineId], "9999"), pinDeAdmin(), AHORA + 2 * MIN);
    assert.equal(motivoDe(demasiado), "MAS_DE_LO_QUE_QUEDA");
  });

  test("lo preparado no vuelve al estante (va a merma); un servicio no se devuelve", async () => {
    const v = await vender([linea("Torta", "300"), linea("Alquiler de disfraz", "500")], "928", "1000");
    const alEstante = await local.app.devoluciones.devolver(ctxSupervisor, devolucion(v, [v.lineas[0]!.lineId], "348"), pinDeAdmin(), AHORA + 3 * MIN);
    assert.equal(motivoDe(alEstante), "NO_VUELVE_AL_ESTANTE");
    const servicio = await local.app.devoluciones.devolver(ctxSupervisor, devolucion(v, [v.lineas[1]!.lineId], "580"), pinDeAdmin(), AHORA + 3 * MIN);
    assert.equal(motivoDe(servicio), "NO_SE_DEVUELVE");
    const aMerma = valor(
      await local.app.devoluciones.devolver(ctxSupervisor, { ...devolucion(v, [], "348"), lineas: [{ lineId: v.lineas[0]!.lineId, destino: "MERMA" }] }, pinDeAdmin(), AHORA + 3 * MIN),
    );
    assert.equal(aMerma.venta.devoluciones[0]!.lineas[0]!.destino, "MERMA");
  });

  test("una venta con devoluciones ya no se anula entera", async () => {
    const r = await local.app.cuentas.anular(
      ctxSupervisor,
      { idempotencyKey: randomUUID(), accountId: venta.accountId, cobroKey: venta.cobroKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
      pinDeAdmin(),
      AHORA + 4 * MIN,
    );
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
  });

  test("la caja necesita el PIN de administración, no el de supervisión; la monitora no devuelve; el libro no deja devolver de más", async () => {
    const sinPin = await local.app.devoluciones.devolver(ctxCajera, devolucion(venta, [venta.lineas[1]!.lineId], "116"), undefined, AHORA + 5 * MIN);
    assert.notEqual(sinPin.ok, true);
    const deSupervision = await local.app.devoluciones.devolver(ctxCajera, devolucion(venta, [venta.lineas[1]!.lineId], "116"), pinDeSupervisor(), AHORA + 5 * MIN);
    assert.equal(!deSupervision.ok && deSupervision.motivo, "NO_PERMITIDO", "B3-18: supervisión ya no autoriza devolver");
    const monitora = await local.app.devoluciones.devolver(ctxMonitora, devolucion(venta, [venta.lineas[1]!.lineId], "116"), pinDeAdmin(), AHORA + 5 * MIN);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
    // La base, aunque el código se equivocara: no se devuelve más de lo que entró por ese cobro.
    await assert.rejects(
      local.base.conTenant(local.sistema.tenantId, async (tx) => {
        const cobro = (await tx.payment.findFirst({ where: { operationKey: venta.cobroKey, kind: "COBRO" } }))!;
        const turno = (await tx.cashShift.findFirst({ where: { id: cobro.shiftId } }))!;
        await tx.payment.create({
          data: {
            tenantId: cobro.tenantId,
            branchId: cobro.branchId,
            documentId: cobro.documentId,
            shiftId: turno.id,
            businessDate: turno.businessDate,
            operationKey: randomUUID(),
            line: 0,
            kind: "DEVOLUCION",
            method: cobro.method,
            currency: cobro.currency,
            amountMinor: -cobro.amountMinor,
            igtfMinor: 0n,
            refundsId: cobro.id,
            reason: "DEVOLUCION",
            reasonDetail: "De más",
            recordedByName: "Prueba",
          },
        });
      }),
    );
  });
});
