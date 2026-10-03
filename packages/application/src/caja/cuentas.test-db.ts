/**
 * Las cuentas en el servidor, contra l2control_test — B3-3, DEC-21, F4-03, F4-04b, F4-04c, §5.6.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): la tasa, el IVA, el IGTF y
 * el precio del catálogo dependen de él. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CuentaYLibroDto, FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, impresoraDePrueba, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxMonitora: Contexto;
let ctxMesero: Contexto;
let ctxCocina: Contexto;
let ctxSinTurno: Contexto;
let supervisor: string;
let admin: string;
let cajera: string;
let tasa: string;
let agua: string;
let gomitas: string;

const FONDO = {
  fondos: [
    { currency: "USD", amount: { minor: "0", currency: "USD" } },
    { currency: "VES", amount: { minor: "0", currency: "VES" } },
  ],
};
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

/** Una unidad de agua ($ 1,00, IVA general), como la añade la caja. */
const lineaDeAgua = (id: string = randomUUID()) => ({
  id,
  concept: "Agua mineral",
  kind: "RESTAURANTE" as const,
  amount: usd("100"),
  paid: false,
  productId: agua,
  taxCode: "GENERAL" as const,
});
const mostrador = (lines: unknown[], extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  kind: "MOSTRADOR",
  family: "Mostrador",
  mode: "PREPAGO",
  status: "POR_COBRAR",
  openedAt: new Date(AHORA).toISOString(),
  sessionIds: [],
  closedSessionIds: [],
  lines,
  ...extra,
});
const familia = (extra: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  kind: "FAMILIA",
  family: "Familia Pérez",
  mode: "CUENTA_ABIERTA",
  status: "ABIERTA",
  openedAt: new Date(AHORA).toISOString(),
  sessionIds: ["s-ana"],
  closedSessionIds: [],
  lines: [{ id: randomUUID(), concept: "Paquete 1 hora", kind: "PAQUETE", amount: usd("1000"), paid: false, sessionId: "s-ana" }],
  ...extra,
});

/** Guarda una cuenta nueva con la caja y la devuelve como la dejó el servidor. */
const abrir = async (cuenta: unknown, ctx: Contexto = ctxCajera, ahora = AHORA) => valor(await local.app.cuentas.guardar(ctx, { cuenta }, ahora));

/** Un cobro en efectivo en dólares, con lo que sobra de vuelto salvo que se diga. */
const enEfectivo = (c: FamilyAccountDto, minor: string, total: string, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  lineIds: c.lines.filter((l) => !l.paid && !l.movedTo && !l.cortesia).map((l) => l.id),
  total: usd(total),
  pagos: [{ method: "EFECTIVO_USD", amount: usd(minor) }],
  destinoSobra: "VUELTO",
  ...extra,
});
/** Un cobro en efectivo en bolívares, con la tasa del día. */
const enBolivares = (c: FamilyAccountDto, minor: string, total: string, rateId = tasa) => ({
  ...enEfectivo(c, "0", total),
  pagos: [{ method: "EFECTIVO_VES", amount: { minor, currency: "VES" } }],
  rateId,
});

const versionesDe = (accountId: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.accountVersion.findMany({ where: { accountId }, orderBy: { version: "asc" } }));
const asientosCon = (operationKey: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.payment.count({ where: { operationKey } }));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Cuentas");
  otro = await abrirLocalDePrueba(URL_APP, "Cuentas de otro");
  await impresoraDePrueba(local);
  await planoDePrueba(local, 12);
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const mesero = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const cocinera = await crearPersona(local, { nombre: "Rosa Mata", role: "COCINA", pin: "8462" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Salón"), mesero, "3175");
  ctxCocina = await contextoDe(local, await crearEquipo(local, "Cocina"), cocinera, "8462");
  ctxSinTurno = await contextoDe(local, await crearEquipo(local, "Caja 2"), supervisor, "5937");
  for (const ctx of [ctxCajera, ctxAdmin]) valor(await local.app.turnos.abrir(ctx, FONDO, AHORA - 2 * MIN));

  tasa = valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 10 * MIN));
  }
  const producto = (nombre: string, precioMinor: string) => ({ kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor } });
  const catalogo = valor(await local.app.productos.aplicar(local.sistema, producto("Agua mineral", "100"), AHORA - 5 * MIN));
  agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
  const conGomitas = valor(await local.app.productos.aplicar(local.sistema, producto("Gomitas", "150"), AHORA - 5 * MIN));
  gomitas = conGomitas.productos.find((p) => p.nombre === "Gomitas")!.id;
  valor(await local.app.productos.aplicar(local.sistema, { kind: "ACTIVAR", productId: gomitas, activo: false }, AHORA - 4 * MIN));
  // El Pago Móvil del local, con sus datos y encendido (B3-2): sus devoluciones llevan referencia.
  valor(await local.app.medios.aplicar(local.sistema, { kind: "DATOS_PAGO_MOVIL", datos: { bankCode: "0134", phone: "0414-2345678", document: "J-40123456-7" } }));
  valor(await local.app.medios.aplicar(local.sistema, { kind: "ACTIVAR", code: "PAGO_MOVIL", activo: true }));
});

/** La administración anula y regala sin autorización ajena, pero confirma con su PIN (B3-4). */
const pinDeAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Confirmo yo" });

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("guardar una cuenta", () => {
  test("el número de orden, la apertura y la entrada en la cola los pone el servidor", async () => {
    const c = await abrir(mostrador([lineaDeAgua()], { openedAt: "2020-01-01T00:00:00.000Z", orderNumber: 999 }));
    assert.equal(c.version, 1);
    assert.equal(c.openedAt, new Date(AHORA).toISOString());
    assert.equal(c.pendingSince, new Date(AHORA).toISOString());
    assert.notEqual(c.orderNumber, 999);
    const siguiente = await abrir(mostrador([lineaDeAgua()]));
    assert.equal(siguiente.orderNumber, c.orderNumber! + 1);
  });

  test("un reintento del alta devuelve la misma cuenta, y guardar lo mismo no añade versión", async () => {
    const nueva = mostrador([lineaDeAgua()]);
    const a = await abrir(nueva);
    const b = await abrir(nueva, ctxCajera, AHORA + 5000);
    assert.deepEqual(b, a);
    assert.deepEqual(await abrir(a, ctxCajera, AHORA + 9000), a);
    assert.equal((await versionesDe(a.id)).length, 1);
  });

  test("dos altas a la vez reciben números distintos", async () => {
    const [a, b] = await Promise.all([abrir(mostrador([lineaDeAgua()])), abrir(mostrador([lineaDeAgua()]))]);
    assert.notEqual(a.orderNumber, b.orderNumber);
  });

  test("si otro equipo guardó antes, la versión vieja recibe CONFLICTO en vez de pisarlo", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const v2 = valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...c, lines: [...c.lines, lineaDeAgua()] } }, AHORA));
    assert.equal(v2.version, 2);
    const tarde = await local.app.cuentas.guardar(ctxAdmin, { cuenta: { ...c, family: "Mostrador 2" } }, AHORA);
    assert.equal(!tarde.ok && tarde.motivo, "CONFLICTO");
  });

  test("el servidor rechaza lo que solo él puede hacer", async () => {
    const pagada = await local.app.cuentas.guardar(ctxCajera, { cuenta: mostrador([{ ...lineaDeAgua(), paid: true }], { status: "COBRADA" }) }, AHORA);
    assert.equal(!pagada.ok && pagada.motivo, "INVALIDO");
    const barata = await local.app.cuentas.guardar(ctxCajera, { cuenta: mostrador([{ ...lineaDeAgua(), amount: usd("50") }]) }, AHORA);
    assert.equal(!barata.ok && barata.problemas?.[0]?.message, "PRECIO_DISTINTO");
    const apartada = await local.app.cuentas.guardar(ctxCajera, { cuenta: mostrador([{ ...lineaDeAgua(), concept: "Gomitas", amount: usd("150"), productId: gomitas }]) }, AHORA);
    assert.equal(!apartada.ok && apartada.problemas?.[0]?.message, "PRODUCTO_QUE_NO_SE_VENDE");
    const f = await familiaDePrueba(local, ctxMonitora, AHORA);
    const sinPaquete = await local.app.cuentas.guardar(ctxMonitora, { cuenta: { ...f, lines: [] } }, AHORA);
    assert.equal(!sinPaquete.ok && sinPaquete.problemas?.[0]?.message, "LINEA_QUITADA");
  });

  test("cada estación guarda las cuentas que le tocan", async () => {
    await familiaDePrueba(local, ctxMonitora, AHORA);
    const mesa = await abrir({ ...familia(), kind: "MESA", family: "Mesa 3", sessionIds: [], lines: [], tableId: "mesa-3", tableLabel: "3" }, ctxMesero);
    assert.equal(mesa.kind, "MESA");
    const r = await local.app.cuentas.guardar(ctxMonitora, { cuenta: mostrador([lineaDeAgua()]) }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const cocina = await local.app.cuentas.leer(ctxCocina, AHORA);
    assert.equal(!cocina.ok && cocina.motivo, "NO_PERMITIDO");
  });

  test("leer: las pendientes y las cobradas hoy, sin las ventas de mostrador descartadas", async () => {
    const viva = await abrir(mostrador([lineaDeAgua()]));
    const descartada = await abrir(mostrador([lineaDeAgua()]));
    valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...descartada, lines: [], status: "ABIERTA" } }, AHORA));
    const { cuentas } = valor(await local.app.cuentas.leer(ctxMonitora, AHORA));
    assert.ok(cuentas.some((c) => c.id === viva.id));
    assert.ok(!cuentas.some((c) => c.id === descartada.id));
    // La de otro local no se ve.
    assert.deepEqual(valor(await otro.app.cuentas.leer(otro.sistema, AHORA)).cuentas, []);
  });
});

describe("cobrar una cuenta (F4-03, §5.6)", () => {
  let cobrada: CuentaYLibroDto;
  let clave: string;

  test("un cobro mixto: IVA e IGTF del servidor, el libro y la cuenta pagada en una transacción", async () => {
    const c = await abrir(mostrador([lineaDeAgua(), lineaDeAgua()]));
    // 2 × $ 1,00 + IVA 16 % = 2,32; con $ 1,00 en efectivo (IGTF 0,03) quedan 1,35 = Bs. 1.155,14.
    const cmd = {
      ...enEfectivo(c, "100", "235"),
      pagos: [
        { method: "EFECTIVO_USD", amount: usd("100") },
        { method: "EFECTIVO_VES", amount: { minor: "115514", currency: "VES" } },
      ],
      rateId: tasa,
    };
    clave = cmd.idempotencyKey;
    cobrada = valor(await local.app.cuentas.cobrar(ctxCajera, cmd, AHORA));
    assert.equal(cobrada.cuenta.status, "COBRADA");
    assert.equal(cobrada.cuenta.version, 2);
    assert.ok(cobrada.cuenta.lines.every((l) => l.paid));
    assert.equal(cobrada.cuenta.pendingSince, undefined);
    assert.deepEqual(cobrada.libro.aplicado, usd("235"));
    assert.deepEqual(cobrada.libro.igtf, usd("3"));
    assert.deepEqual(cobrada.libro.asientos[1]!.rate, { id: tasa, value: "855.6625" });
    const versiones = await versionesDe(c.id);
    assert.deepEqual(versiones.map((v) => v.cause), ["GUARDAR", "COBRO"]);
    assert.equal(versiones[1]!.operationKey, clave);
  });

  test("un doble clic cobra una sola vez (I-11)", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cmd = enEfectivo(c, "500", "131");
    const [a, b] = await Promise.all([local.app.cuentas.cobrar(ctxCajera, cmd, AHORA), local.app.cuentas.cobrar(ctxCajera, cmd, AHORA)]);
    assert.deepEqual(valor(a), valor(b));
    // El cobro y su vuelto: dos asientos, una versión.
    assert.equal(await asientosCon(cmd.idempotencyKey), 2);
    assert.equal((await versionesDe(c.id)).length, 2);
  });

  test("lo que sobra va a su destino: vuelto o propina, y el residuo solo hasta $ 0,05", async () => {
    // $ 1,16 de agua; $ 5,00 en efectivo llevan 0,15 de IGTF: se cobran 1,31 y sobran 3,69.
    const conVuelto = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(await abrir(mostrador([lineaDeAgua()])), "500", "131"), AHORA));
    assert.deepEqual(conVuelto.libro.vuelto, usd("369"));
    assert.deepEqual(conVuelto.libro.asientos.map((a) => a.kind), ["COBRO", "VUELTO"]);
    const conPropina = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(await abrir(mostrador([lineaDeAgua()])), "500", "131", { destinoSobra: "PROPINA" }), AHORA));
    assert.deepEqual(conPropina.libro.propina, usd("369"));
    const c = await abrir(mostrador([lineaDeAgua()]));
    const residuoGrande = await local.app.cuentas.cobrar(ctxCajera, enEfectivo(c, "500", "131", { destinoSobra: "RESIDUO" }), AHORA);
    assert.equal(!residuoGrande.ok && residuoGrande.motivo, "INVALIDO");
    // Bs. 1.000,00 son $ 1,17: sobra un céntimo, y ese sí se queda en caja.
    const residuo = valor(await local.app.cuentas.cobrar(ctxCajera, { ...enBolivares(c, "100000", "116"), destinoSobra: "RESIDUO" }, AHORA));
    assert.deepEqual(residuo.libro.residuo, usd("1"));
  });

  test("un cobro que no cuadra al céntimo no se confirma, y no deja nada en el libro", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cmd = enEfectivo(c, "100", "119");
    const r = await local.app.cuentas.cobrar(ctxCajera, cmd, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.equal(await asientosCon(cmd.idempotencyKey), 0);
    assert.equal((await versionesDe(c.id)).length, 1);
  });

  test("si el servidor llega a otro total, no se cobra lo que no vio el cliente", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const r = await local.app.cuentas.cobrar(ctxCajera, enEfectivo(c, "500", "100"), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
  });

  test("una cuenta que cambió, o que no está en la cola, no se cobra", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const v2 = valor(await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...c, lines: [...c.lines, lineaDeAgua()] } }, AHORA));
    const vieja = await local.app.cuentas.cobrar(ctxCajera, enEfectivo(c, "500", "131"), AHORA);
    assert.equal(!vieja.ok && vieja.motivo, "CONFLICTO");
    const otrasLineas = await local.app.cuentas.cobrar(ctxCajera, { ...enEfectivo(v2, "500", "131"), lineIds: [c.lines[0]!.id] }, AHORA);
    assert.equal(!otrasLineas.ok && otrasLineas.motivo, "CONFLICTO");
    const abierta = await familiaDePrueba(local, ctxMonitora, AHORA);
    const r = await local.app.cuentas.cobrar(ctxCajera, enEfectivo(abierta, "1000", "1160"), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    const yaCobrada = await local.app.cuentas.cobrar(ctxCajera, enEfectivo(cobrada.cuenta, "500", "131"), AHORA);
    assert.equal(!yaCobrada.ok && yaCobrada.motivo, "CONFLICTO");
  });

  test("sin turno en el equipo no se cobra; sin permiso, tampoco", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const sinTurno = await local.app.cuentas.cobrar(ctxSinTurno, enEfectivo(c, "500", "131"), AHORA);
    assert.equal(!sinTurno.ok && sinTurno.motivo, "NO_DISPONIBLE");
    const monitora = await local.app.cuentas.cobrar(ctxMonitora, enEfectivo(c, "500", "131"), AHORA);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
  });

  test("una cuenta dividida se cobra por partes y se cierra con la última (F6-12)", async () => {
    // 3 × $ 1,16 = 3,48, en dos partes de 1,74 = Bs. 1.488,85 cada una.
    const c = await abrir(mostrador([lineaDeAgua(), lineaDeAgua(), lineaDeAgua()], { split: { parts: 2, paid: 0 } }));
    const primera = valor(await local.app.cuentas.cobrar(ctxCajera, enBolivares(c, "148885", "174"), AHORA));
    assert.deepEqual(primera.cuenta.split, { parts: 2, paid: 1 });
    assert.equal(primera.cuenta.status, "POR_COBRAR");
    assert.ok(primera.cuenta.lines.every((l) => !l.paid));
    const segunda = valor(await local.app.cuentas.cobrar(ctxCajera, enBolivares(primera.cuenta, "148885", "174"), AHORA));
    assert.equal(segunda.cuenta.status, "COBRADA");
    assert.deepEqual(segunda.libro.aplicado, usd("348"));
  });
});

describe("anular un cobro (DEC-24)", () => {
  test("caja necesita la autorización 🔐; con ella se revierte todo y la cuenta vuelve a la cola", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cobro = enEfectivo(c, "500", "131");
    valor(await local.app.cuentas.cobrar(ctxCajera, cobro, AHORA));
    const pedido = {
      idempotencyKey: randomUUID(),
      accountId: c.id,
      cobroKey: cobro.idempotencyKey,
      motivo: "ERROR_EN_COBRO",
      devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }],
    };

    const sin = await local.app.cuentas.anular(ctxCajera, pedido, undefined, AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_PERMITIDO");
    assert.deepEqual(await local.app.cuentas.autorizadores(ctxCajera), [
      { id: (await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findFirstOrThrow({ where: { role: "ADMIN" } }))).id, nombre: "Abigail Karam", rol: "ADMIN" },
      { id: supervisor, nombre: "Luis Guerrero", rol: "SUPERVISOR" },
    ]);

    const anulada = valor(await local.app.cuentas.anular(ctxCajera, pedido, { autorizadorId: supervisor, pin: "5937", motivo: "Cobro repetido" }, AHORA));
    assert.equal(anulada.cuenta.status, "POR_COBRAR");
    assert.equal(anulada.cuenta.lines[0]!.paid, false);
    assert.equal(anulada.cuenta.pendingSince, new Date(AHORA).toISOString());
    assert.deepEqual(anulada.libro.aplicado, usd("0"));
    assert.deepEqual(anulada.libro.vuelto, usd("0"));
    assert.ok(anulada.libro.asientos.filter((a) => a.reversesId).every((a) => a.authorizedBy === "Luis Guerrero"));

    // Un doble clic devuelve lo anulado sin pedir otra vez el PIN; otra anulación, no.
    assert.deepEqual(valor(await local.app.cuentas.anular(ctxCajera, pedido, undefined, AHORA)), anulada);
    const otraVez = await local.app.cuentas.anular(ctxAdmin, { ...pedido, idempotencyKey: randomUUID() }, undefined, AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");

    // Lo consumido se sigue debiendo: se vuelve a cobrar.
    const deNuevo = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(anulada.cuenta, "500", "131"), AHORA));
    assert.equal(deNuevo.cuenta.status, "COBRADA");
  });

  test("anular una parte resta esa parte; la división sigue", async () => {
    const c = await abrir(mostrador([lineaDeAgua(), lineaDeAgua(), lineaDeAgua()], { split: { parts: 2, paid: 0 } }));
    const p1 = enBolivares(c, "148885", "174");
    // Cobrada en la oficina, que es desde donde se anula: los bolívares a devolver están en su gaveta.
    const primera = valor(await local.app.cuentas.cobrar(ctxAdmin, p1, AHORA));
    const p2 = enBolivares(primera.cuenta, "148885", "174");
    valor(await local.app.cuentas.cobrar(ctxAdmin, p2, AHORA));
    // Con la cuenta completa, anular la primera parte devuelve a la cola lo que pagó la última.
    const devoluciones = [{ paymentIndex: 0, via: "MISMO_MEDIO" }];
    const anulada = valor(
      await local.app.cuentas.anular(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: p1.idempotencyKey, motivo: "CLIENTE_DESISTIO", devoluciones }, pinDeAdmin(), AHORA),
    );
    assert.deepEqual(anulada.cuenta.split, { parts: 2, paid: 1 });
    assert.equal(anulada.cuenta.status, "POR_COBRAR");
    assert.ok(anulada.cuenta.lines.every((l) => !l.paid));
    assert.deepEqual(anulada.libro.aplicado, usd("174"));
    // Y la parte que falta se cobra otra vez.
    const otra = valor(await local.app.cuentas.cobrar(ctxAdmin, enBolivares(anulada.cuenta, "148885", "174"), AHORA));
    assert.equal(otra.cuenta.status, "COBRADA");
  });

  test("otro local no ve la cuenta ni anula sus cobros", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cobro = enEfectivo(c, "500", "131");
    valor(await local.app.cuentas.cobrar(ctxCajera, cobro, AHORA));
    const r = await otro.app.cuentas.anular(otro.sistema, { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO", devoluciones: [] }, undefined, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    const g = await otro.app.cuentas.guardar(otro.sistema, { cuenta: { ...c, family: "Otra" } }, AHORA);
    assert.equal(!g.ok && g.motivo, "NO_DISPONIBLE");
  });
});

describe("la venta de cada cobro (B3-4, C12)", () => {
  test("el cobro deja su venta: lo cobrado, el IVA, el IGTF, cada pago y lo que se devolvería", async () => {
    const c = await abrir(mostrador([lineaDeAgua(), { ...lineaDeAgua(), id: randomUUID() }]));
    const cliente = { kind: "IDENTIFICADO", document: "V-12345678", name: "Pedro Pérez" };
    const { venta } = valor(await local.app.cuentas.cobrar(ctxCajera, { ...enEfectivo(c, "500", "247"), cliente }, AHORA));
    assert.equal(venta.orderNumber, c.orderNumber);
    assert.equal(venta.cashier, "Marisol Prieto");
    assert.deepEqual(venta.subtotal, usd("200"));
    assert.deepEqual(venta.impuestos, [{ basisPoints: 1600, tax: usd("32") }]);
    // $ 5,00 en efectivo: 0,15 de IGTF; se cobran 2,47 y el vuelto es 2,53 (y no se devuelve).
    assert.deepEqual(venta.igtf, { basisPoints: 300, amount: usd("15") });
    assert.deepEqual(venta.total, usd("247"));
    assert.deepEqual(venta.sobra, { amount: usd("253"), destino: "VUELTO" });
    assert.deepEqual(venta.payments[0]!.refundable, usd("247"));
    assert.equal(venta.lineas.length, 2);
    // El documento del cliente, enmascarado (§7.6).
    assert.deepEqual(venta.cliente, { kind: "IDENTIFICADO", name: "Pedro Pérez", document: "V-12···678" });
    assert.deepEqual(venta.prints, []);
    assert.equal(venta.voided, null);
  });

  test("las ventas del turno del equipo; imprimir anota el original y después copias", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const { venta } = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(c, "500", "131"), AHORA));
    const { ventas } = valor(await local.app.ventas.delTurno(ctxCajera));
    assert.equal(ventas[0]!.id, venta.id);
    // La oficina tiene su propio turno: no ve las ventas de la caja.
    assert.ok(!valor(await local.app.ventas.delTurno(ctxAdmin)).ventas.some((v) => v.id === venta.id));
    const original = valor(await local.app.ventas.imprimir(ctxCajera, { saleId: venta.id }, AHORA + MIN));
    assert.deepEqual(original.prints.map((x) => x.copia), [false]);
    const copia = valor(await local.app.ventas.imprimir(ctxCajera, { saleId: venta.id }, AHORA + 2 * MIN));
    assert.deepEqual(copia.prints.map((x) => [x.copia, x.by]), [[false, "Marisol Prieto"], [true, "Marisol Prieto"]]);
    // Cada impresión es un trabajo en la cola de la impresora de recibos (B5-2); la copia lo dice arriba.
    const trabajos = valor(await local.app.impresion.trabajos(ctxCajera, AHORA + 2 * MIN)).trabajos.filter((t) => t.ventaId === venta.id);
    assert.deepEqual(trabajos.map((t) => [t.tipo, t.copia, t.estado]), [["RECIBO", true, "PENDIENTE"], ["RECIBO", false, "PENDIENTE"]]);
    assert.match(trabajos[0]!.vistaPrevia, /\*\*\* COPIA \*\*\*/);
    assert.match(trabajos[1]!.vistaPrevia, /RECIBO NO FISCAL[\s\S]*TOTAL/);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "sale", entityId: venta.id });
    assert.deepEqual(asientos.map((a) => a.action).sort(), ["venta.imprimir", "venta.reimprimir"]);
    const monitora = await local.app.ventas.imprimir(ctxMonitora, { saleId: venta.id }, AHORA);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
  });

  test("la anulación queda en la venta: quién autorizó y cómo volvió cada pago, con la referencia enmascarada", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    // $ 1,16 = Bs. 992,57 por Pago Móvil (sin IGTF).
    const cobro = {
      ...enEfectivo(c, "0", "116"),
      pagos: [{ method: "PAGO_MOVIL", amount: { minor: "99257", currency: "VES" }, datos: { kind: "PAGO_MOVIL", reference: "55501234", bankCode: "0102" } }],
      rateId: tasa,
    };
    const { venta } = valor(await local.app.cuentas.cobrar(ctxCajera, cobro, AHORA));
    assert.match(venta.payments[0]!.referencia ?? "", /···1234/);
    const pedido = { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO" };
    // Por el mismo medio, un Pago Móvil pide la referencia de la devolución.
    const sinReferencia = await local.app.cuentas.anular(ctxAdmin, { ...pedido, devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] }, pinDeAdmin(), AHORA);
    assert.equal(!sinReferencia.ok && sinReferencia.motivo, "INVALIDO");
    // En efectivo, lo que no entró en efectivo exige explicarlo.
    const sinExplicar = await local.app.cuentas.anular(ctxAdmin, { ...pedido, devoluciones: [{ paymentIndex: 0, via: "EFECTIVO" }] }, pinDeAdmin(), AHORA);
    assert.equal(!sinExplicar.ok && sinExplicar.motivo, "INVALIDO");
    const sinDecir = await local.app.cuentas.anular(ctxAdmin, { ...pedido, devoluciones: [] }, pinDeAdmin(), AHORA);
    assert.equal(!sinDecir.ok && sinDecir.motivo, "INVALIDO");

    const r = valor(await local.app.cuentas.anular(ctxAdmin, { ...pedido, devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO", reference: "77884821" }] }, pinDeAdmin(), AHORA));
    assert.deepEqual(r.venta.voided?.authorizedBy, { name: "Abigail Karam", role: "ADMIN" });
    assert.equal(r.venta.voided?.requestedBy, "Abigail Karam");
    assert.deepEqual(r.venta.voided?.refunds, [{ paymentIndex: 0, via: "MISMO_MEDIO", amount: { minor: "99257", currency: "VES" }, reference: "···4821" }]);
  });

  test("la administración anula sin autorización ajena, pero confirma con su propio PIN", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cobro = enEfectivo(c, "500", "131");
    // Cobrado en la oficina: lo que se devuelve en efectivo sale de esa gaveta (B3-5).
    valor(await local.app.cuentas.cobrar(ctxAdmin, cobro, AHORA));
    const pedido = { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] };
    const sinPin = await local.app.cuentas.anular(ctxAdmin, pedido, undefined, AHORA);
    assert.equal(!sinPin.ok && sinPin.mensaje, "Confirma con tu PIN.");
    const conOtro = await local.app.cuentas.anular(ctxAdmin, pedido, { autorizadorId: supervisor, pin: "5937", motivo: "Por otro" }, AHORA);
    assert.equal(!conOtro.ok && conOtro.mensaje, "Confirma con tu propio PIN.");
    const malo = await local.app.cuentas.anular(ctxAdmin, pedido, { ...pinDeAdmin(), pin: "0000" }, AHORA);
    assert.equal(!malo.ok && malo.mensaje, "PIN incorrecto.");
    valor(await local.app.cuentas.anular(ctxAdmin, pedido, pinDeAdmin(), AHORA));
  });
});

describe("la cortesía (F6-14, B3-4)", () => {
  test("se regala con la autorización comprobada en el servidor, que pone quién y cuándo", async () => {
    const c = await abrir(mostrador([lineaDeAgua(), lineaDeAgua()]));
    const linea = c.lines[0]!.id;
    const cmd = { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: linea, quitar: false, motivo: "INVITACION" };
    const sin = await local.app.cuentas.cortesia(ctxCajera, cmd, undefined, AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_PERMITIDO");
    const malo = await local.app.cuentas.cortesia(ctxCajera, cmd, { autorizadorId: supervisor, pin: "0000", motivo: "Invitación" }, AHORA);
    assert.equal(!malo.ok && malo.mensaje, "PIN de autorización incorrecto.");
    const r = valor(await local.app.cuentas.cortesia(ctxCajera, cmd, { autorizadorId: supervisor, pin: "5937", motivo: "Invitación" }, AHORA));
    const regalada = r.lines.find((l) => l.id === linea)!;
    assert.deepEqual(regalada.cortesia, {
      motivo: "INVITACION",
      autorizadaPor: { id: supervisor, name: "Luis Guerrero", role: "SUPERVISOR" },
      en: new Date(AHORA).toISOString(),
    });
    assert.deepEqual(regalada.amount, usd("100")); // conserva su importe
    // Un doble clic no la aplica dos veces.
    assert.deepEqual(valor(await local.app.cuentas.cortesia(ctxCajera, cmd, undefined, AHORA)), r);
    // Lo regalado no se cobra: queda una agua, $ 1,16.
    const { venta } = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(r, "500", "131"), AHORA));
    assert.deepEqual(venta.lineas.map((l) => l.cortesia), ["INVITACION", null]);
  });

  test("una pantalla ya no regala al guardar; se quita con el mismo mando", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const linea = c.lines[0]!;
    const aMano = await local.app.cuentas.guardar(ctxCajera, {
      cuenta: { ...c, lines: [{ ...linea, cortesia: { motivo: "INVITACION", autorizadaPor: { id: cajera, name: "Marisol Prieto", role: "SUPERVISOR" }, en: new Date(AHORA).toISOString() } }] },
    }, AHORA);
    assert.equal(!aMano.ok && aMano.problemas?.[0]?.message, "CORTESIA_DESDE_LA_PANTALLA");
    const dada = valor(await local.app.cuentas.cortesia(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: linea.id, quitar: false, motivo: "CONSUMO_DE_PERSONAL" }, pinDeAdmin(), AHORA));
    const quitada = valor(await local.app.cuentas.cortesia(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, version: dada.version, lineId: linea.id, quitar: true }, pinDeAdmin(), AHORA));
    assert.equal(quitada.lines[0]!.cortesia, undefined);
    const otraVez = await local.app.cuentas.cortesia(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, version: quitada.version, lineId: linea.id, quitar: true }, pinDeAdmin(), AHORA);
    assert.equal(!otraVez.ok && otraVez.problemas?.[0]?.message, "NO_REGALADA");
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: c.id });
    assert.ok(asientos.some((a) => a.action === "cuenta.cortesia" && a.authorizedBy === admin));
  });
});

describe("la tasa del cobro (ADR-019 §7)", () => {
  test("una tasa que dejó de regir vale 10 minutos para cerrar el cobro; después, no", async () => {
    const a = await abrir(mostrador([lineaDeAgua()]));
    const b = await abrir(mostrador([lineaDeAgua()]));
    // Se aplica otra a las 10:01 am, con los dos cobros a medias en la tasa de antes.
    valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "860.00", effectiveDate: HOY, valorVerificado: "860.00" }, AHORA + MIN));
    valor(await local.app.cuentas.cobrar(ctxCajera, enBolivares(a, "99257", "116"), AHORA + 5 * MIN));
    const tarde = await local.app.cuentas.cobrar(ctxCajera, enBolivares(b, "99257", "116"), AHORA + 12 * MIN);
    assert.equal(!tarde.ok && tarde.motivo, "CONFLICTO");
    assert.match(!tarde.ok ? tarde.mensaje : "", /ya no es la vigente/);
  });
});

describe("la cuenta de una mesa (B6-1, I-05)", () => {
  const deMesa = (tableId: string, lines: unknown[] = [], extra: Record<string, unknown> = {}) =>
    familia({ kind: "MESA", family: `Mesa ${tableId}`, sessionIds: [], lines, tableId, tableLabel: "99", ...extra });

  test("nace en una mesa del plano, con el número que dice el plano y no la pantalla", async () => {
    const c = await abrir(deMesa("mesa-1", [lineaDeAgua()]), ctxMesero);
    assert.equal(c.tableId, "mesa-1");
    assert.equal(c.tableLabel, "1");
  });

  test("una mesa tiene una sola cuenta abierta: la segunda choca", async () => {
    const r = await local.app.cuentas.guardar(ctxMesero, { cuenta: deMesa("mesa-1") }, AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_CON_CUENTA");
    assert.match(!r.ok ? r.mensaje : "", /La mesa 1 ya tiene su cuenta abierta/);
  });

  test("dos tablets que abren la misma mesa a la vez: entra una", async () => {
    const [a, b] = await Promise.all([
      local.app.cuentas.guardar(ctxMesero, { cuenta: deMesa("mesa-4", [lineaDeAgua()]) }, AHORA),
      local.app.cuentas.guardar(ctxCajera, { cuenta: deMesa("mesa-4", [lineaDeAgua()]) }, AHORA),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, JSON.stringify([a, b]));
  });

  test("una mesa que no está en el salón no abre cuenta", async () => {
    const r = await local.app.cuentas.guardar(ctxMesero, { cuenta: deMesa("mesa-99") }, AHORA);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_FUERA_DEL_PLANO");
  });

  test("lo que se pide en la mesa sale de la carta, con su precio", async () => {
    const aMano = { ...lineaDeAgua(), productId: undefined, taxCode: undefined };
    const r = await local.app.cuentas.guardar(ctxMesero, { cuenta: deMesa("mesa-2", [aMano]) }, AHORA);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_SIN_PRODUCTO");
    const barata = await local.app.cuentas.guardar(ctxMesero, { cuenta: deMesa("mesa-2", [{ ...lineaDeAgua(), amount: usd("50") }]) }, AHORA);
    assert.equal(!barata.ok && barata.problemas?.[0]?.message, "PRECIO_DISTINTO");
  });

  test("en un local sin plano, la cuenta de mesa no nace", async () => {
    const r = await otro.app.cuentas.guardar(otro.sistema, { cuenta: deMesa("mesa-1") }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE", JSON.stringify(r));
  });
});

describe("anular un pedido en producción (F6-14, B6-3)", () => {
  const deMesa = (tableId: string, lines: unknown[] = []) => familia({ kind: "MESA", family: `Mesa ${tableId}`, sessionIds: [], lines, tableId, tableLabel: "99" });
  const platoDePedido = (extra: Record<string, unknown> = {}) => ({ ...lineaDeAgua(), orderId: randomUUID(), ...extra });

  test("un «guardar» no lo anula: tiene su propio mando, con autorización", async () => {
    const c = await abrir(deMesa("mesa-5", [platoDePedido()]));
    const linea = c.lines[0]!;
    const aMano = await local.app.cuentas.guardar(ctxMesero, {
      cuenta: { ...c, lines: [{ ...linea, anulacion: { motivo: "PEDIDO_EQUIVOCADO", autorizadaPor: { id: admin, name: "Abigail Karam", role: "ADMIN" }, en: new Date(AHORA).toISOString() } }] },
    }, AHORA);
    assert.equal(!aMano.ok && aMano.problemas?.[0]?.message, "ANULACION_DESDE_LA_PANTALLA");

    const cmd = { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: linea.id, motivo: "PEDIDO_EQUIVOCADO" as const };
    const sinAutorizar = await local.app.cuentas.anularPedido(ctxMesero, cmd, undefined, AHORA);
    assert.equal(!sinAutorizar.ok && sinAutorizar.motivo, "NO_PERMITIDO");
    const r = valor(await local.app.cuentas.anularPedido(ctxMesero, cmd, { autorizadorId: supervisor, pin: "5937", motivo: "Se equivocó de mesa" }, AHORA));
    const anulada = r.lines.find((l) => l.id === linea.id)!;
    assert.deepEqual(anulada.anulacion, {
      motivo: "PEDIDO_EQUIVOCADO",
      autorizadaPor: { id: supervisor, name: "Luis Guerrero", role: "SUPERVISOR" },
      en: new Date(AHORA).toISOString(),
    });
    assert.deepEqual(anulada.amount, usd("100")); // conserva su importe
    // Un doble clic no la aplica dos veces.
    assert.deepEqual(valor(await local.app.cuentas.anularPedido(ctxMesero, cmd, undefined, AHORA)), r);

    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: c.id });
    assert.ok(asientos.some((a) => a.action === "pedido.anular" && a.authorizedBy === supervisor));
  });

  test("la administración se autoriza con su propio PIN, sin pedírselo a otro", async () => {
    const c = await abrir(deMesa("mesa-6", [platoDePedido()]));
    const linea = c.lines[0]!;
    const cmd = { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: linea.id, motivo: "CLIENTE_DESISTIO" as const };
    const sinPin = await local.app.cuentas.anularPedido(ctxAdmin, cmd, undefined, AHORA);
    assert.equal(!sinPin.ok && sinPin.mensaje, "Confirma con tu PIN.");
    const r = valor(await local.app.cuentas.anularPedido(ctxAdmin, cmd, pinDeAdmin(), AHORA));
    assert.deepEqual(r.lines.find((l) => l.id === linea.id)!.anulacion?.autorizadaPor, { id: admin, name: "Abigail Karam", role: "ADMIN" });
  });

  test("no se anula lo ya pagado, lo movido, lo regalado o lo del parque; ni dos veces", async () => {
    const pagada = await abrir(mostrador([platoDePedido()]));
    const { cuenta: cobrada } = valor(await local.app.cuentas.cobrar(ctxCajera, enEfectivo(pagada, "500", "131"), AHORA));
    const yaPagada = await local.app.cuentas.anularPedido(
      ctxAdmin,
      { idempotencyKey: randomUUID(), accountId: cobrada.id, version: cobrada.version, lineId: cobrada.lines[0]!.id, motivo: "OTRO", detalle: "Prueba" },
      pinDeAdmin(),
      AHORA,
    );
    assert.equal(!yaPagada.ok && yaPagada.problemas?.[0]?.message, "LINEA_PAGADA");

    const c = await abrir(deMesa("mesa-7", [platoDePedido()]));
    const linea = c.lines[0]!;
    const primera = valor(
      await local.app.cuentas.anularPedido(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: linea.id, motivo: "SIN_EXISTENCIA" }, pinDeAdmin(), AHORA),
    );
    const otraVez = await local.app.cuentas.anularPedido(
      ctxAdmin,
      { idempotencyKey: randomUUID(), accountId: c.id, version: primera.version, lineId: linea.id, motivo: "SIN_EXISTENCIA" },
      pinDeAdmin(),
      AHORA,
    );
    assert.equal(!otraVez.ok && otraVez.problemas?.[0]?.message, "YA_ANULADA");

    const deLaFamilia = await familiaDePrueba(local, ctxMonitora, AHORA);
    const delParque = await local.app.cuentas.anularPedido(
      ctxAdmin,
      { idempotencyKey: randomUUID(), accountId: deLaFamilia.id, version: deLaFamilia.version, lineId: deLaFamilia.lines[0]!.id, motivo: "OTRO", detalle: "Prueba" },
      pinDeAdmin(),
      AHORA,
    );
    assert.equal(!delParque.ok && delParque.problemas?.[0]?.message, "NO_ES_PEDIDO");
  });
});

describe("liberar una mesa sin consumo (B6-5, M-18)", () => {
  const deMesa = (tableId: string, lines: unknown[] = []) => familia({ kind: "MESA", family: `Mesa ${tableId}`, sessionIds: [], lines, tableId, tableLabel: "99" });
  const platoDePedido = () => ({ ...lineaDeAgua(), orderId: randomUUID() });
  const liberar = (ctx: Contexto, c: FamilyAccountDto, idempotencyKey: string = randomUUID()) =>
    local.app.cuentas.liberarMesa(ctx, { idempotencyKey, accountId: c.id, version: c.version }, AHORA);
  const pendientesDelCierre = async () => valor(await local.app.cortes.pendientes(ctxAdmin, undefined, AHORA)).cuentas.map((c) => c.id);

  test("con todo anulado, el mesero la libera sin PIN: queda «sin consumo», fuera del cierre y auditada", async () => {
    const c = await abrir(deMesa("mesa-9", [platoDePedido()]), ctxMesero);
    const anulada = valor(
      await local.app.cuentas.anularPedido(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: c.lines[0]!.id, motivo: "CLIENTE_DESISTIO" }, pinDeAdmin(), AHORA),
    );
    assert.ok((await pendientesDelCierre()).includes(c.id), "antes de liberarla, la mesa en $ 0 impedía cerrar la jornada");

    const clave = randomUUID();
    const libre = valor(await liberar(ctxMesero, anulada, clave));
    assert.equal(libre.status, "SIN_CONSUMO");
    assert.deepEqual(libre.lines, anulada.lines); // nada se borra: el plato sigue anulado, con su importe
    assert.ok(!(await pendientesDelCierre()).includes(c.id));
    // Un doble toque no la cierra dos veces.
    assert.deepEqual(valor(await liberar(ctxMesero, anulada, clave)), libre);
    const versiones = await versionesDe(c.id);
    assert.equal(versiones.filter((v) => v.cause === "LIBERAR").length, 1);

    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: c.id });
    assert.ok(asientos.some((a) => a.action === "mesa.liberar" && a.authorizedBy === null));
  });

  test("liberada, la mesa vuelve a abrir cuenta; la cerrada no se toca", async () => {
    const c = await abrir(deMesa("mesa-10", []), ctxMesero);
    const libre = valor(await liberar(ctxMesero, c));
    assert.equal(libre.status, "SIN_CONSUMO");
    const otraVez = await liberar(ctxMesero, libre);
    assert.equal(!otraVez.ok && otraVez.mensaje, "Esa cuenta ya está cerrada.");
    const aMano = await local.app.cuentas.guardar(ctxMesero, { cuenta: { ...libre, status: "ABIERTA" } }, AHORA);
    assert.equal(!aMano.ok && aMano.problemas?.[0]?.message, "CUENTA_SIN_CONSUMO");
    const nueva = await abrir(deMesa("mesa-10", [lineaDeAgua()]), ctxMesero);
    assert.notEqual(nueva.id, c.id);
  });

  test("con algo por cobrar, o si no es una mesa, no se libera", async () => {
    const conAgua = await abrir(deMesa("mesa-11", [lineaDeAgua()]), ctxMesero);
    const r = await liberar(ctxMesero, conAgua);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /algo por cobrar/);
    const deMostrador = await abrir(mostrador([lineaDeAgua()]));
    const m = await liberar(ctxCajera, deMostrador);
    assert.match(!m.ok ? m.mensaje : "", /Solo se libera una mesa/);
  });

  test("con la versión vieja choca: otra tablet acaba de pedir algo", async () => {
    const c = await abrir(deMesa("mesa-12", []), ctxMesero);
    const conPedido = valor(await local.app.cuentas.guardar(ctxMesero, { cuenta: { ...c, lines: [lineaDeAgua()] } }, AHORA));
    assert.ok(conPedido.version! > c.version!);
    const r = await liberar(ctxMesero, c);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
  });

  test("quien no atiende mesas no la libera, y otro local no la ve", async () => {
    const c = await abrir(deMesa("mesa-8", []), ctxMesero);
    const monitora = await liberar(ctxMonitora, c);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
    const cocina = await liberar(ctxCocina, c);
    assert.equal(!cocina.ok && cocina.motivo, "NO_PERMITIDO");
    const ajeno = await otro.app.cuentas.liberarMesa(otro.sistema, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version }, AHORA);
    assert.equal(!ajeno.ok && ajeno.motivo, "NO_DISPONIBLE", JSON.stringify(ajeno));
  });
});
