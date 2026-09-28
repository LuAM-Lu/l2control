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
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

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
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
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
  const producto = (nombre: string, precioMinor: string) => ({ kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", controlaStock: false, precioMinor } });
  const catalogo = valor(await local.app.productos.aplicar(local.sistema, producto("Agua mineral", "100"), AHORA - 5 * MIN));
  agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
  const conGomitas = valor(await local.app.productos.aplicar(local.sistema, producto("Gomitas", "150"), AHORA - 5 * MIN));
  gomitas = conGomitas.productos.find((p) => p.nombre === "Gomitas")!.id;
  valor(await local.app.productos.aplicar(local.sistema, { kind: "ACTIVAR", productId: gomitas, activo: false }, AHORA - 4 * MIN));
});

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
    const f = await abrir(familia(), ctxMonitora);
    const sinPaquete = await local.app.cuentas.guardar(ctxMonitora, { cuenta: { ...f, lines: [] } }, AHORA);
    assert.equal(!sinPaquete.ok && sinPaquete.problemas?.[0]?.message, "LINEA_QUITADA");
  });

  test("cada estación guarda las cuentas que le tocan", async () => {
    await abrir(familia(), ctxMonitora);
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
    const abierta = await abrir(familia(), ctxMonitora);
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
    const pedido = { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO" };

    const sin = await local.app.cuentas.anular(ctxCajera, pedido, undefined, AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_PERMITIDO");
    assert.deepEqual(await local.app.cuentas.autorizadores(ctxCajera), [
      { id: (await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findFirstOrThrow({ where: { role: "ADMIN" } }))).id, nombre: "Abigail Karam" },
      { id: supervisor, nombre: "Luis Guerrero" },
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
    const primera = valor(await local.app.cuentas.cobrar(ctxCajera, p1, AHORA));
    const p2 = enBolivares(primera.cuenta, "148885", "174");
    valor(await local.app.cuentas.cobrar(ctxCajera, p2, AHORA));
    // Con la cuenta completa, anular la primera parte devuelve a la cola lo que pagó la última.
    const anulada = valor(await local.app.cuentas.anular(ctxAdmin, { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: p1.idempotencyKey, motivo: "CLIENTE_DESISTIO" }, undefined, AHORA));
    assert.deepEqual(anulada.cuenta.split, { parts: 2, paid: 1 });
    assert.equal(anulada.cuenta.status, "POR_COBRAR");
    assert.ok(anulada.cuenta.lines.every((l) => !l.paid));
    assert.deepEqual(anulada.libro.aplicado, usd("174"));
    // Y la parte que falta se cobra otra vez.
    const otra = valor(await local.app.cuentas.cobrar(ctxCajera, enBolivares(anulada.cuenta, "148885", "174"), AHORA));
    assert.equal(otra.cuenta.status, "COBRADA");
  });

  test("otro local no ve la cuenta ni anula sus cobros", async () => {
    const c = await abrir(mostrador([lineaDeAgua()]));
    const cobro = enEfectivo(c, "500", "131");
    valor(await local.app.cuentas.cobrar(ctxCajera, cobro, AHORA));
    const r = await otro.app.cuentas.anular(otro.sistema, { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO" }, undefined, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    const g = await otro.app.cuentas.guardar(otro.sistema, { cuenta: { ...c, family: "Otra" } }, AHORA);
    assert.equal(!g.ok && g.motivo, "NO_DISPONIBLE");
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
