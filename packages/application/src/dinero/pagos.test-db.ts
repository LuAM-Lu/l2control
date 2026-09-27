/**
 * El libro de pagos en el servidor, contra l2control_test — B2-3, §5.5, F3-09, F3-10.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): la tasa del día y el
 * IGTF vigente dependen de él. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { LibroDocumentoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxMonitora: Contexto;
let supervisor: string;
let tasa: string;
let pendiente: string;

const DOC = randomUUID();
const FONDO = {
  fondos: [
    { currency: "USD", amount: { minor: "0", currency: "USD" } },
    { currency: "VES", amount: { minor: "0", currency: "VES" } },
  ],
};
const usd = (major: string) => ({ kind: "COBRO", method: "EFECTIVO_USD", amount: { minor: major.replace(".", ""), currency: "USD" } });
const pagoMovil = (major: string, rateId: string) => ({ kind: "COBRO", method: "PAGO_MOVIL", amount: { minor: major.replace(".", ""), currency: "VES" }, rateId });
const cobro = (asientos: unknown[], documentId = DOC, idempotencyKey: string = randomUUID()) => ({ idempotencyKey, documentId, asientos });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const filasDe = (clave: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.payment.count({ where: { operationKey: clave } }));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Libro");
  otro = await abrirLocalDePrueba(URL_APP, "Libro de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
  const ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Supervisión"), supervisor, "5937");
  // Sin turno abierto no se cobra (B3-1): la caja y la oficina abren el suyo.
  for (const ctx of [ctxCajera, ctxAdmin]) valor(await local.app.turnos.abrir(ctx, FONDO, AHORA - 120_000));

  // La tasa del día, aplicada; y otra que supervisión deja pendiente.
  tasa = valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA)).id;
  pendiente = valor(await local.app.tasas.capturar(ctxSupervisor, { pair: "USD/VES", source: "BCV", value: "856.00", effectiveDate: HOY }, AHORA + 1000)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 60_000));
  }
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("asentar un cobro (F3-09)", () => {
  let libro: LibroDocumentoDto;

  test("un pago mixto: cada asiento con su moneda, la tasa congelada y el IGTF que pone el servidor", async () => {
    libro = valor(await local.app.pagos.asentar(ctxCajera, cobro([usd("3.00"), pagoMovil("1711.33", tasa)]), AHORA));
    assert.equal(libro.asientos.length, 2);
    const [efectivo, movil] = libro.asientos;
    // El IGTF solo en divisas: 3 % de 3,00.
    assert.deepEqual(efectivo!.igtf, { minor: "9", currency: "USD" });
    assert.deepEqual(movil!.igtf, { minor: "0", currency: "VES" });
    // El valor de la tasa lo copió el servidor de la base.
    assert.deepEqual(movil!.rate, { id: tasa, value: "855.6625" });
    assert.equal(efectivo!.recordedBy, "Marisol Prieto");
    // El saldo es la suma del libro: 3,00 $ + 1.711,33 Bs a 855,6625 = 5,00 $.
    assert.deepEqual(libro.cobrado, { minor: "500", currency: "USD" });
    assert.deepEqual(libro.igtf, { minor: "9", currency: "USD" });
  });

  test("un doble clic produce un solo cobro (I-11)", async () => {
    const clave = randomUUID();
    const doc = randomUUID();
    const [a, b] = await Promise.all([
      local.app.pagos.asentar(ctxCajera, cobro([usd("10.00")], doc, clave), AHORA),
      local.app.pagos.asentar(ctxCajera, cobro([usd("10.00")], doc, clave), AHORA),
    ]);
    assert.deepEqual(valor(a).asientos.map((x) => x.id), valor(b).asientos.map((x) => x.id));
    assert.equal(await filasDe(clave), 1);
  });

  test("un reintento con la misma clave devuelve lo asentado, sin asentar ni auditar otra vez", async () => {
    const clave = randomUUID();
    const doc = randomUUID();
    const primero = valor(await local.app.pagos.asentar(ctxCajera, cobro([usd("7.00")], doc, clave), AHORA));
    const segundo = valor(await local.app.pagos.asentar(ctxCajera, cobro([usd("7.00")], doc, clave), AHORA + 5000));
    assert.deepEqual(segundo, primero);
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "payment", entityId: primero.asientos[0]!.id });
    assert.equal(asientos.filter((a) => a.action === "pago.asentar").length, 1);
  });

  test("la misma clave con otro contenido es un conflicto, no un segundo cobro", async () => {
    const clave = randomUUID();
    const doc = randomUUID();
    valor(await local.app.pagos.asentar(ctxCajera, cobro([usd("7.00")], doc, clave), AHORA));
    const r = await local.app.pagos.asentar(ctxCajera, cobro([usd("8.00")], doc, clave), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.equal(await filasDe(clave), 1);
  });

  test("todo o nada: si un asiento no vale, no se asienta ninguno", async () => {
    const clave = randomUUID();
    const r = await local.app.pagos.asentar(ctxCajera, cobro([usd("3.00"), pagoMovil("100.00", pendiente)], randomUUID(), clave), AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.equal(await filasDe(clave), 0);
  });

  test("con una tasa sin confirmar o de otro local no se cobra (ADR-005)", async () => {
    for (const rateId of [pendiente, randomUUID()]) {
      const r = await local.app.pagos.asentar(ctxCajera, cobro([pagoMovil("100.00", rateId)]), AHORA);
      assert.equal(!r.ok && r.motivo, "INVALIDO", rateId);
    }
  });

  test("el navegador no pone el IGTF, el valor de la tasa ni quién cobra (ADR-017)", async () => {
    for (const asiento of [
      { ...usd("3.00"), igtf: { minor: "0", currency: "USD" } },
      { ...pagoMovil("100.00", tasa), rateValue: "1.00" },
    ]) {
      const r = await local.app.pagos.asentar(ctxCajera, cobro([asiento]), AHORA);
      assert.equal(!r.ok && r.motivo, "INVALIDO");
    }
    const r = await local.app.pagos.asentar(ctxCajera, { ...cobro([usd("3.00")]), cajero: "Otra persona" }, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("un vuelto que no es efectivo no se asienta (§5.6)", async () => {
    const r = await local.app.pagos.asentar(ctxCajera, cobro([usd("20.00"), { kind: "VUELTO", method: "PAGO_MOVIL", amount: { minor: "171133", currency: "VES" }, rateId: tasa }]), AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("la monitora no cobra (DEC-25), y el intento queda en la auditoría", async () => {
    const r = await local.app.pagos.asentar(ctxMonitora, cobro([usd("3.00")]), AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxMonitora.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "pago.asentar" && a.outcome === "NEGADO"));
  });

  test("sin turno abierto en el equipo no se cobra (F4-01)", async () => {
    const r = await local.app.pagos.asentar(ctxMonitora, cobro([usd("3.00")]), AHORA);
    // La monitora ni siquiera cobra; quien sí cobra, sin turno, tampoco:
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const cajeraSinTurno = await contextoDe(local, await crearEquipo(local, "Caja sin turno"), ctxCajera.quien!.userId!, "7391");
    const sin = await local.app.pagos.asentar(cajeraSinTurno, cobro([usd("3.00")]), AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_DISPONIBLE");
    assert.match(!sin.ok ? sin.mensaje : "", /turno/);
  });

  test("el asiento dice en qué turno entró", async () => {
    const turno = (await local.app.turnos.delEquipo(ctxCajera))!;
    const libro = valor(await local.app.pagos.libro(ctxAdmin, DOC));
    const filas = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.payment.findMany({ where: { id: { in: libro.asientos.map((a) => a.id) } } }));
    assert.ok(filas.every((f) => f.shiftId === turno.id));
  });

  test("sin IGTF vigente no se cobra en divisas", async () => {
    const persona = await crearPersona(otro, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
    const ctx = await contextoDe(otro, await crearEquipo(otro, "Caja"), persona, "7391");
    valor(await otro.app.turnos.abrir(ctx, FONDO, AHORA));
    const r = await otro.app.pagos.asentar(ctx, cobro([usd("3.00")]), AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    assert.match(!r.ok ? r.mensaje : "", /IGTF/);
  });
});

describe("revertir (F3-10)", () => {
  let efectivo: string;

  test("la reversión es un asiento más: el original queda intacto y el saldo baja", async () => {
    const antes = valor(await local.app.pagos.libro(ctxAdmin, DOC));
    efectivo = antes.asientos.find((a) => a.method === "EFECTIVO_USD")!.id;
    const libro = valor(await local.app.pagos.revertir(ctxAdmin, { idempotencyKey: randomUUID(), paymentId: efectivo, motivo: "ERROR_EN_COBRO" }, undefined, AHORA));
    assert.equal(libro.asientos.length, 3);
    const original = libro.asientos.find((a) => a.id === efectivo)!;
    const rev = libro.asientos.find((a) => a.reversesId === efectivo)!;
    // El original, como estaba; y ahora sabe quién lo revirtió.
    const { reversedById: _antes, ...originalAntes } = antes.asientos.find((a) => a.id === efectivo)!;
    const { reversedById: _despues, ...originalDespues } = original;
    assert.deepEqual(originalDespues, originalAntes);
    assert.deepEqual(original.amount, { minor: "300", currency: "USD" });
    assert.equal(original.reversedById, rev.id);
    assert.deepEqual([rev.amount, rev.igtf, rev.motivo], [{ minor: "-300", currency: "USD" }, { minor: "-9", currency: "USD" }, "ERROR_EN_COBRO"]);
    // Queda lo del Pago Móvil: 2,00 $, sin IGTF.
    assert.deepEqual(libro.cobrado, { minor: "200", currency: "USD" });
    assert.deepEqual(libro.igtf, { minor: "0", currency: "USD" });
  });

  test("un asiento se revierte una sola vez, y una reversión no se revierte", async () => {
    const otraVez = await local.app.pagos.revertir(ctxAdmin, { idempotencyKey: randomUUID(), paymentId: efectivo, motivo: "ERROR_EN_COBRO" }, undefined, AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
    const libro = valor(await local.app.pagos.libro(ctxAdmin, DOC));
    const rev = libro.asientos.find((a) => a.reversesId === efectivo)!;
    const deLaReversion = await local.app.pagos.revertir(ctxAdmin, { idempotencyKey: randomUUID(), paymentId: rev.id, motivo: "ERROR_EN_COBRO" }, undefined, AHORA);
    assert.equal(!deLaReversion.ok && deLaReversion.motivo, "INVALIDO");
  });

  test("la reversión en bolívares lleva la tasa del cobro, no la de hoy", async () => {
    const movil = valor(await local.app.pagos.libro(ctxAdmin, DOC)).asientos.find((a) => a.method === "PAGO_MOVIL")!;
    const libro = valor(await local.app.pagos.revertir(ctxAdmin, { idempotencyKey: randomUUID(), paymentId: movil.id, motivo: "CLIENTE_DESISTIO" }, undefined, AHORA));
    assert.deepEqual(libro.asientos.find((a) => a.reversesId === movil.id)!.rate, { id: tasa, value: "855.6625" });
    assert.deepEqual(libro.cobrado, { minor: "0", currency: "USD" });
  });

  test("la caja revierte solo con la autorización de supervisión (DEC-24)", async () => {
    const doc = randomUUID();
    const id = valor(await local.app.pagos.asentar(ctxCajera, cobro([usd("4.00")], doc), AHORA)).asientos[0]!.id;
    const sin = await local.app.pagos.revertir(ctxCajera, { idempotencyKey: randomUUID(), paymentId: id, motivo: "ERROR_EN_COBRO" }, undefined, AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_PERMITIDO");
    const pinMalo = await local.app.pagos.revertir(ctxCajera, { idempotencyKey: randomUUID(), paymentId: id, motivo: "ERROR_EN_COBRO" }, { autorizadorId: supervisor, pin: "0000", motivo: "Cobro repetido" }, AHORA);
    assert.equal(!pinMalo.ok && pinMalo.motivo, "NO_PERMITIDO");
    const libro = valor(
      await local.app.pagos.revertir(ctxCajera, { idempotencyKey: randomUUID(), paymentId: id, motivo: "ERROR_EN_COBRO" }, { autorizadorId: supervisor, pin: "5937", motivo: "Cobro repetido" }, AHORA),
    );
    const rev = libro.asientos.find((a) => a.reversesId === id)!;
    assert.equal(rev.authorizedBy, "Luis Guerrero");
    assert.equal(rev.recordedBy, "Marisol Prieto");
  });

  test("un doble clic al revertir deja una sola reversión", async () => {
    const doc = randomUUID();
    const id = valor(await local.app.pagos.asentar(ctxAdmin, cobro([usd("6.00")], doc), AHORA)).asientos[0]!.id;
    const clave = randomUUID();
    const cmd = { idempotencyKey: clave, paymentId: id, motivo: "ERROR_EN_COBRO" };
    const [a, b] = await Promise.all([
      local.app.pagos.revertir(ctxAdmin, cmd, undefined, AHORA),
      local.app.pagos.revertir(ctxAdmin, cmd, undefined, AHORA),
    ]);
    assert.deepEqual(valor(a), valor(b));
    assert.equal(await filasDe(clave), 1);
  });

  test("se audita con el original y la reversión", async () => {
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "payment", entityId: efectivo });
    const rev = asientos.find((a) => a.action === "pago.revertir")!;
    assert.equal(rev.reason, "ERROR_EN_COBRO");
    assert.equal((rev.before as { amountMinor?: string }).amountMinor, "300");
  });
});

describe("aislamiento", () => {
  test("otro local no ve el libro de este ni revierte sus asientos", async () => {
    assert.deepEqual(valor(await otro.app.pagos.libro(otro.sistema, DOC)).asientos, []);
    const id = valor(await local.app.pagos.libro(ctxAdmin, DOC)).asientos[0]!.id;
    // Con su propio turno abierto, para que el rechazo sea por no ver el asiento y no por otra cosa.
    const admin = await crearPersona(otro, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
    const ctx = await contextoDe(otro, await crearEquipo(otro, "Oficina"), admin, "4826");
    valor(await otro.app.turnos.abrir(ctx, FONDO, AHORA));
    const r = await otro.app.pagos.revertir(ctx, { idempotencyKey: randomUUID(), paymentId: id, motivo: "ERROR_EN_COBRO" }, undefined, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
    assert.match(!r.ok ? r.mensaje : "", /no existe/);
  });
});
