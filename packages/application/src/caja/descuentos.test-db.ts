/**
 * Los descuentos en el servidor, contra l2control_test — B3-6, V-9, D-DESC.
 *
 * Con reloj fijo (jueves 1 de octubre de 2026, 10:00 am en Caracas): la vigencia de las reglas va por
 * días del local. IVA general 16 % e IGTF 0 % (V-13). Corre con `pnpm test:db`.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto, ReglaDescuentoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, familiaDePrueba, type LocalDePrueba, FACTURA_DE_PRUEBA } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-01T14:00:00.000Z");
const HOY = "2026-10-01";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminSinElevar: Contexto;
let ctxCajera: Contexto;
let ctxMesero: Contexto;
let admin: string;
let supervisor: string;
let agua: string;
let galleta: string;
const reglas: Record<string, ReglaDescuentoDto> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean; motivo?: string; mensaje?: string }, motivo: string) => {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.motivo, motivo, JSON.stringify(r));
  return r.mensaje ?? "";
};
const deSupervisor = (pin = "5937") => ({ autorizadorId: supervisor, pin, motivo: "Lo autorizo" });
const deAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Lo autorizo" });

const linea = (productId: string, concept: string, minor: string) => ({
  id: randomUUID(),
  concept,
  kind: "RESTAURANTE" as const,
  amount: usd(minor),
  paid: false,
  productId,
  taxCode: "GENERAL" as const,
});
/** Una venta de mostrador en la cola: dos aguas ($ 1,00) y una galleta ($ 2,00) = $ 4,00. */
const mostrador = async (lines = [linea(agua, "Agua mineral", "100"), linea(agua, "Agua mineral", "100"), linea(galleta, "Galleta", "200")]) =>
  valor(
    await local.app.cuentas.guardar(
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
          lines,
        },
      },
      AHORA,
    ),
  );

const aplicar = (c: FamilyAccountDto, extra: Record<string, unknown>) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  quitar: false,
  ...extra,
});
const cobro = (c: FamilyAccountDto, total: string, pagos: unknown[]) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  lineIds: c.lines.filter((l) => !l.paid && !l.movedTo && !l.cortesia).map((l) => l.id),
  total: usd(total),
  pagos,
  destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA,
});
const enZelle = (minor: string) => ({ method: "ZELLE", amount: usd(minor), datos: { kind: "ZELLE", holder: "cliente@ejemplo.com", confirmation: `Z${randomUUID().slice(0, 8)}` } });
const enEfectivo = (minor: string) => ({ method: "EFECTIVO_USD", amount: usd(minor) });

const crear = async (cmd: Record<string, unknown>) => valor(await local.app.descuentos.crear(ctxAdmin, { desde: HOY, alcance: { tipo: "CUENTA" }, ...cmd }, AHORA));
const porcentaje = (basisPoints: number) => ({ tipo: "PORCENTAJE", basisPoints });

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Descuentos");
  otro = await abrirLocalDePrueba(URL_APP, "Descuentos de otro");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const mesero = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxAdminSinElevar = await contextoDe(local, await crearEquipo(local, "Oficina 2"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Salón"), mesero, "3175");
  const fondo = { fondos: [{ currency: "USD", amount: usd("5000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await local.app.turnos.abrir(ctxCajera, fondo, undefined, AHORA - 30 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 60 * MIN));
  }
  const producto = (nombre: string, categoria: string, precioMinor: string) => ({ kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo: "PREPARADO", precioMinor, area: "SIN_PAPEL" } });
  agua = valor(await local.app.productos.aplicar(local.sistema, producto("Agua mineral", "Bebidas", "100"), AHORA - 50 * MIN)).productos.find((p) => p.nombre === "Agua mineral")!.id;
  galleta = valor(await local.app.productos.aplicar(local.sistema, producto("Galleta", "Snacks", "200"), AHORA - 50 * MIN)).productos.find((p) => p.nombre === "Galleta")!.id;
  valor(await local.app.medios.aplicar(local.sistema, { kind: "DATOS_ZELLE", datos: { holder: "Inversiones Parque C.A.", email: "cobros@ejemplo-parque.com" } }));
  valor(await local.app.medios.aplicar(local.sistema, { kind: "ACTIVAR", code: "ZELLE", activo: true }));
});

describe("las reglas (Ajustes → Descuentos)", () => {
  test("administración las crea con su elevación; la caja no, y sin elevar tampoco", async () => {
    reglas.zelle = await crear({ nombre: "Pago con Zelle", tipo: "MEDIO", medio: "ZELLE", valor: porcentaje(1000) });
    reglas.frecuente = await crear({ nombre: "Cliente frecuente", tipo: "MANUAL", valor: porcentaje(1000) });
    reglas.grande = await crear({ nombre: "Gran compensación", tipo: "MANUAL", valor: porcentaje(3000) });
    reglas.dolar = await crear({ nombre: "Un dólar menos", tipo: "MANUAL", valor: { tipo: "MONTO", monto: usd("100") } });
    reglas.vip = await crear({ nombre: "VIP Oro", tipo: "VIP", valor: porcentaje(1500), alcance: { tipo: "PARQUE" } });
    reglas.bebidas = await crear({ nombre: "Bebidas a mitad", tipo: "MANUAL", valor: porcentaje(5000), alcance: { tipo: "CATEGORIAS", categorias: ["Bebidas"] } });
    assert.equal(reglas.zelle.medio, "ZELLE");

    const cmd = { nombre: "De la caja", tipo: "MANUAL", valor: porcentaje(500), alcance: { tipo: "CUENTA" }, desde: HOY };
    rechazo(await local.app.descuentos.crear(ctxCajera, cmd, AHORA), "NO_PERMITIDO");
    rechazo(await local.app.descuentos.crear(ctxAdminSinElevar, cmd, AHORA), "ELEVACION_REQUERIDA");
    rechazo(await local.app.descuentos.crear(ctxAdmin, { ...cmd, desde: "2026-09-30" }, AHORA), "INVALIDO");
    rechazo(await local.app.descuentos.crear(ctxAdmin, { ...cmd, tipo: "MEDIO", medio: "NO_EXISTE" }, AHORA), "INVALIDO");
  });

  test("se retiran una vez, no se borran ni se reescriben", async () => {
    const vieja = await crear({ nombre: "Promo vieja", tipo: "MANUAL", valor: porcentaje(500) });
    const retirada = valor(await local.app.descuentos.retirar(ctxAdmin, { reglaId: vieja.id }, AHORA));
    assert.equal(retirada.retirada?.por, "Abigail Karam");
    rechazo(await local.app.descuentos.retirar(ctxAdmin, { reglaId: vieja.id }, AHORA), "CONFLICTO");
    const leidas = valor(await local.app.descuentos.leer(ctxCajera));
    assert.equal(leidas.topeSupervision, 2000);
    assert.equal(leidas.reglas.at(-1)?.id, vieja.id, "las retiradas van al final");
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.$executeRaw`UPDATE discount_rule SET basis_points = 9000 WHERE id = ${reglas.frecuente!.id}::uuid`));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.$executeRaw`DELETE FROM discount_rule WHERE id = ${vieja.id}::uuid`));
  });
});

describe("en la caja", () => {
  test("ofrece los que aplican, el mayor primero, con lo que pide cada uno", async () => {
    const c = await mostrador();
    const d = valor(await local.app.descuentos.deCuenta(ctxCajera, c.id, AHORA));
    assert.deepEqual(
      d.candidatos.map((x) => [x.regla.nombre, x.importe.minor, x.requiere]),
      [
        ["Gran compensación", "120", "ADMINISTRACION"],
        ["Bebidas a mitad", "100", "ADMINISTRACION"],
        ["Un dólar menos", "100", "ADMINISTRACION"],
        ["Cliente frecuente", "40", "AUTORIZACION"],
        ["Pago con Zelle", "40", "AUTORIZACION"],
      ],
    );
    assert.equal(d.subtotal.minor, "400");
    assert.equal(d.vip, null);
    rechazo(await local.app.descuentos.deCuenta(ctxMesero, c.id, AHORA), "NO_PERMITIDO");
  });

  test("el de medio: con la 🔐 de supervisión y cobrando TODA la cuenta por su medio; sale en la venta y en las excepciones", async () => {
    const c = await mostrador();
    rechazo(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MEDIO", reglaId: reglas.zelle!.id }), undefined, AHORA), "NO_PERMITIDO");
    rechazo(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MEDIO", reglaId: reglas.zelle!.id }), deSupervisor("0000"), AHORA), "NO_PERMITIDO");
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MEDIO", reglaId: reglas.zelle!.id }), deSupervisor(), AHORA));
    assert.equal(con.descuento?.autorizadoPor?.name, "Luis Guerrero");
    assert.equal(con.version, c.version! + 1);

    // Un «guardar» de la pantalla no lo quita ni divide la cuenta.
    const { descuento: _, ...sin } = con;
    rechazo(await local.app.cuentas.guardar(ctxCajera, { cuenta: sin }, AHORA), "INVALIDO");
    rechazo(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...con, split: { parts: 2, paid: 0 } } }, AHORA), "INVALIDO");

    // $ 4,00 − 10 % = $ 3,60; IVA 16 % = 0,58 → $ 4,18.
    const mixto = await local.app.cuentas.cobrar(ctxCajera, cobro(con, "418", [enZelle("200"), enEfectivo("218")]), AHORA);
    assert.match(rechazo(mixto, "CONFLICTO"), /toda la cuenta por ese medio/);
    rechazo(await local.app.cuentas.cobrar(ctxCajera, cobro(con, "464", [enZelle("464")]), AHORA), "CONFLICTO");
    const r = valor(await local.app.cuentas.cobrar(ctxCajera, cobro(con, "418", [enZelle("418")]), AHORA));
    assert.equal(r.venta.subtotal.minor, "400");
    assert.equal(r.venta.descuento?.importe.minor, "40");
    assert.equal(r.venta.descuento?.autorizadoPor?.name, "Luis Guerrero");
    assert.equal(r.venta.total.minor, "418");
    assert.equal(r.cuenta.status, "COBRADA");
    assert.equal(r.cuenta.descuento, undefined, "el cobro lo consume");

    const vista = valor(await local.app.cortes.vista(ctxCajera, undefined, AHORA));
    const exc = vista.excepciones.find((e) => e.tipo === "DESCUENTO");
    assert.equal(exc?.importe?.minor, "40");
    assert.equal(exc?.autorizadoPor, "Luis Guerrero");
  });

  test("el manual: supervisión hasta su tope (20 %); por encima, administración; y no se autoriza a sí misma por encima", async () => {
    const c = await mostrador();
    const grande = aplicar(c, { origen: "MANUAL", reglaId: reglas.grande!.id, motivo: "COMPENSACION" });
    assert.match(rechazo(await local.app.descuentos.aplicar(ctxCajera, grande, deSupervisor(), AHORA), "NO_PERMITIDO"), /administración/);
    const fallos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findUniqueOrThrow({ where: { id: supervisor }, select: { pinFailures: true } }));
    assert.equal(fallos.pinFailures, 0, "quien no puede autorizarlo no llega a probar el PIN");
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, grande, deAdmin(), AHORA));
    assert.equal(con.descuento?.autorizadoPor?.role, "ADMIN");
    assert.equal(con.descuento?.motivo, "COMPENSACION");
    // Uno por cuenta: el nuevo sustituye al anterior.
    const otro = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(con, { origen: "MANUAL", reglaId: reglas.frecuente!.id, motivo: "CLIENTE_FRECUENTE" }), deSupervisor(), AHORA));
    assert.equal(otro.descuento?.nombre, "Cliente frecuente");
  });

  test("el tope se vuelve a mirar al cobrar: si se quitan líneas, el manual de supervisión puede pasarse", async () => {
    const c = await mostrador([linea(agua, "Agua mineral", "100"), linea(agua, "Agua mineral", "100"), linea(agua, "Agua mineral", "100"), linea(galleta, "Galleta", "200")]);
    // $ 1,00 de $ 5,00 = 20 %: lo autoriza supervisión.
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MANUAL", reglaId: reglas.dolar!.id, motivo: "PROMOCION" }), deSupervisor(), AHORA));
    const sinGalleta = valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...con, lines: con.lines.filter((l) => l.productId !== galleta) } }, AHORA));
    // $ 1,00 de $ 3,00: ya pasa del 20 %. $ 2,00 + IVA 0,32 = $ 2,32.
    assert.match(rechazo(await local.app.cuentas.cobrar(ctxCajera, cobro(sinGalleta, "232", [enEfectivo("232")]), AHORA), "CONFLICTO"), /tope/);
  });

  test("por categorías: solo las líneas de esas categorías", async () => {
    const c = await mostrador();
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MANUAL", reglaId: reglas.bebidas!.id, motivo: "PROMOCION" }), deAdmin(), AHORA));
    // Aguas $ 2,00 − 50 % = $ 1,00; más la galleta $ 2,00 → $ 3,00 + IVA 0,48 = $ 3,48.
    const r = valor(await local.app.cuentas.cobrar(ctxCajera, cobro(con, "348", [enEfectivo("500")]), AHORA));
    assert.equal(r.venta.descuento?.importe.minor, "100");
    assert.equal(r.venta.total.minor, "348");
  });

  test("el de administración: lo autoriza administración con su PIN y un motivo escrito", async () => {
    const c = await mostrador();
    const cmd = aplicar(c, { origen: "ADMIN", valor: porcentaje(5000), detalle: "Cumpleaños de un empleado" });
    rechazo(await local.app.descuentos.aplicar(ctxCajera, cmd, deSupervisor(), AHORA), "NO_PERMITIDO");
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, cmd, deAdmin(), AHORA));
    assert.equal(con.descuento?.origen, "ADMIN");
    assert.equal(con.descuento?.reglaId, null);
    // Quitarlo no pide PIN: la cuenta vuelve a deberse entera. Queda en la auditoría.
    const sin = valor(await local.app.descuentos.aplicar(ctxCajera, { ...aplicar(con, {}), quitar: true }, undefined, AHORA));
    assert.equal(sin.descuento, undefined);
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: c.id, action: { in: ["cuenta.descuento", "cuenta.quitar_descuento"] } }, orderBy: { occurredAt: "asc" } }),
    );
    assert.deepEqual(asientos.map((a) => a.action), ["cuenta.descuento", "cuenta.quitar_descuento"]);
    assert.equal(asientos[0]!.authorizedBy, admin);
  });

  test("ni a una cuenta dividida, ni desde un puesto sin el permiso, ni a la cuenta de otro local", async () => {
    const c = await mostrador();
    const dividida = valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...c, split: { parts: 2, paid: 0 } } }, AHORA));
    rechazo(await local.app.descuentos.aplicar(ctxCajera, aplicar(dividida, { origen: "MANUAL", reglaId: reglas.frecuente!.id, motivo: "PROMOCION" }), deSupervisor(), AHORA), "CONFLICTO");
    rechazo(await local.app.descuentos.aplicar(ctxMesero, aplicar(c, { origen: "MANUAL", reglaId: reglas.frecuente!.id, motivo: "PROMOCION" }), deSupervisor(), AHORA), "NO_PERMITIDO");
    const ajena = await otro.app.descuentos.deCuenta(otro.sistema, c.id, AHORA);
    rechazo(ajena, "NO_DISPONIBLE");
  });

  test("anular el cobro no devuelve el descuento: la cuenta vuelve a deberse entera", async () => {
    const c = await mostrador();
    const con = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(c, { origen: "MANUAL", reglaId: reglas.frecuente!.id, motivo: "CLIENTE_FRECUENTE" }), deSupervisor(), AHORA));
    const r = valor(await local.app.cuentas.cobrar(ctxCajera, cobro(con, "418", [enEfectivo("418")]), AHORA));
    const anulada = valor(
      await local.app.cuentas.anular(
        ctxCajera,
        { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: r.venta.cobroKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
        deSupervisor(),
        AHORA,
      ),
    );
    assert.equal(anulada.cuenta.status, "POR_COBRAR");
    assert.equal(anulada.cuenta.descuento, undefined);
    assert.equal(anulada.venta.descuento?.importe.minor, "40", "la venta anulada sigue diciendo qué se descontó");
  });
});

describe("las familias VIP", () => {
  test("administración marca a la familia; su cuenta lo ofrece sin 🔐 y solo sobre su alcance", async () => {
    const cuenta = await familiaDePrueba(local, ctxCajera, AHORA - 5 * MIN, "PREPAGO");
    assert.equal(cuenta.status, "POR_COBRAR");
    const guardianId = await local.base.conTenant(local.sistema.tenantId, async (tx) => (await tx.parkSession.findFirstOrThrow({ where: { accountId: cuenta.id } })).guardianId);

    rechazo(await local.app.descuentos.marcarVip(ctxAdmin, { guardianId, reglaId: reglas.frecuente!.id }, AHORA), "INVALIDO");
    rechazo(await local.app.descuentos.marcarVip(ctxCajera, { guardianId, reglaId: reglas.vip!.id }, AHORA), "NO_PERMITIDO");
    assert.deepEqual(valor(await local.app.descuentos.marcarVip(ctxAdmin, { guardianId, reglaId: reglas.vip!.id }, AHORA)).vip?.nombre, "VIP Oro");

    const d = valor(await local.app.descuentos.deCuenta(ctxCajera, cuenta.id, AHORA));
    assert.equal(d.vip?.nombre, "VIP Oro");
    const vip = d.candidatos.find((x) => x.regla.tipo === "VIP");
    assert.equal(vip?.requiere, "NADA");
    assert.equal(vip?.importe.minor, "150", "15 % del paquete de $ 10,00");

    const con = valor(await local.app.descuentos.aplicar(ctxCajera, aplicar(cuenta, { origen: "VIP", reglaId: reglas.vip!.id }), undefined, AHORA));
    assert.equal(con.descuento?.autorizadoPor, null);
    const directorio = valor(await local.app.representantes.directorio(ctxAdmin));
    assert.equal(directorio.representantes.find((r) => r.id === guardianId)?.vip?.nombre, "VIP Oro");
    assert.equal(valor(await local.app.descuentos.leer(ctxAdmin)).reglas.find((r) => r.id === reglas.vip!.id)?.familias, 1);

    // Otra familia no puede usar ese VIP; y quitada la marca, ya no se ofrece.
    const ajena = await familiaDePrueba(local, ctxCajera, AHORA - 4 * MIN, "PREPAGO");
    rechazo(await local.app.descuentos.aplicar(ctxCajera, aplicar(ajena, { origen: "VIP", reglaId: reglas.vip!.id }), undefined, AHORA), "INVALIDO");
    valor(await local.app.descuentos.marcarVip(ctxAdmin, { guardianId, reglaId: null }, AHORA));
    assert.equal(valor(await local.app.descuentos.deCuenta(ctxCajera, cuenta.id, AHORA)).vip, null);
  });
});
