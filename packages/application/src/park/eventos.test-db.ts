/**
 * Los cumpleaños en el servidor, contra l2control_test — B10-1, V-10, D-EVT.
 *
 * Con reloj fijo (sábado 3 de octubre de 2026, 10:00 am en Caracas). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoEventosPublicadoDto, FamilyAccountDto, ReservaEventoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-03T14:00:00.000Z");
const HOY = "2026-10-03";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxMonitora: Contexto;
let ctxMesero: Contexto;
let ctxOtro: Contexto;
let supervisor: string;
let alquiler: string;
let torta: string;
let apartado: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

const TARIFARIO = {
  packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
};

/** El catálogo que publica administración: dos paquetes, uno retirado no; el anticipo del 50 %. */
const catalogo = (extra: Record<string, unknown> = {}, paquetes?: unknown[]) => ({
  anticipoBps: 5000,
  paquetes: paquetes ?? [
    { id: "basico", name: "Básico", price: usd("15000"), minInvitados: 10, maxInvitados: 20, incluye: [{ productId: alquiler, quantity: 1 }], active: true },
    {
      id: "full",
      name: "Full",
      price: usd("25001"),
      minInvitados: 15,
      maxInvitados: 25,
      incluye: [
        { productId: alquiler, quantity: 1 },
        { productId: torta, quantity: 2 },
      ],
      active: true,
    },
  ],
  ...extra,
});

let pulsera = 0;
/** Una reserva para el sábado 10 de octubre, de 3:00 pm a 6:00 pm, con una familia nueva. */
const reserva = (extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  fecha: "2026-10-10",
  inicio: 15 * 60,
  fin: 18 * 60,
  paqueteId: "basico",
  invitados: 15,
  cumpleanero: "Sofía",
  edad: 6,
  guardian: { fullName: "Carmen Rivas", contactReference: `0414-${String(5_000_000 + ++pulsera)}` },
  ...extra,
});
const reservar = async (cmd: unknown, ctx: Contexto = ctxCajera, ahora = AHORA): Promise<ReservaEventoDto> => valor(await local.app.eventos.reservar(ctx, cmd, ahora));
const cuentaDe = async (id: string): Promise<FamilyAccountDto> =>
  valor(await local.app.cuentas.leer(ctxCajera, AHORA)).cuentas.find((c) => c.id === id)!;
/** El cobro del anticipo en efectivo en dólares, justo. */
const cobroDe = (c: FamilyAccountDto, total: string) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  lineIds: c.lines.filter((l) => !l.paid).map((l) => l.id),
  total: usd(total),
  pagos: [{ method: "EFECTIVO_USD", amount: usd(total) }],
  destinoSobra: "VUELTO",
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Cumpleaños");
  otro = await abrirLocalDePrueba(URL_APP, "Cumpleaños de otro");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const mesero = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  ctxAdmin = await contextoElevado(local, await crearEquipo(local, "Oficina"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Salón"), mesero, "3175");
  const otraCajera = await crearPersona(otro, { nombre: "Rosa Mata", role: "CAJERO", pin: "8462" });
  ctxOtro = await contextoDe(otro, await crearEquipo(otro, "Caja"), otraCajera, "8462");

  valor(await local.app.tarifario.publicar(local.sistema, TARIFARIO));
  valor(await otro.app.tarifario.publicar(otro.sistema, TARIFARIO));
  valor(await local.app.turnos.abrir(ctxCajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, undefined, AHORA - 2 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 10 * MIN));
  }
  const crear = async (nombre: string, tipo: string, precioMinor: string) =>
    valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Cumpleaños", taxCode: "GENERAL", tipo, precioMinor } }, AHORA - 5 * MIN)).productos.find(
      (p) => p.nombre === nombre,
    )!.id;
  alquiler = await crear("Alquiler del salón", "SERVICIO", "10000");
  torta = await crear("Torta de cumpleaños", "PREPARADO", "3000");
  apartado = await crear("Piñata", "PREPARADO", "2000");
  valor(await local.app.productos.aplicar(local.sistema, { kind: "ACTIVAR", productId: apartado, activo: false }, AHORA - 4 * MIN));
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("los paquetes de cumpleaños (D-EVT)", () => {
  let v1: CatalogoEventosPublicadoDto;

  test("sin publicar no hay paquetes, y se dice el aforo con que se cargarán", async () => {
    const c = await local.app.eventos.leerCatalogo(ctxCajera);
    assert.equal(c.catalogo, null);
    assert.equal(c.version, null);
    assert.equal(c.aforo, 30);
    const sin = await local.app.eventos.reservar(ctxCajera, reserva(), AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_DISPONIBLE");
  });

  test("los publica administración, con los nombres del catálogo de productos; la caja no", async () => {
    const cajera = await local.app.eventos.publicarCatalogo(ctxCajera, { sobre: null, catalogo: catalogo() }, AHORA);
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
    v1 = valor(await local.app.eventos.publicarCatalogo(ctxAdmin, { sobre: null, catalogo: catalogo() }, AHORA));
    assert.equal(v1.version, 1);
    assert.equal(v1.publicadoPor, "Abigail Karam");
    assert.deepEqual(
      v1.catalogo!.paquetes[1]!.incluye.map((x) => [x.name, x.quantity]),
      [
        ["Alquiler del salón", 1],
        ["Torta de cumpleaños", 2],
      ],
    );
    // Publicar lo mismo no añade versión.
    assert.equal(valor(await local.app.eventos.publicarCatalogo(ctxAdmin, { sobre: 1, catalogo: catalogo() }, AHORA)).version, 1);
  });

  test("ningún paquete pasa del aforo, ninguno se borra, y lo que incluye se vende hoy", async () => {
    const grande = await local.app.eventos.publicarCatalogo(
      ctxAdmin,
      { sobre: 1, catalogo: catalogo({}, [...catalogo().paquetes, { id: "mega", name: "Mega", price: usd("40000"), minInvitados: 20, maxInvitados: 31, incluye: [], active: true }]) },
      AHORA,
    );
    assert.equal(!grande.ok && grande.problemas?.[0]?.message, "SOBRE_EL_AFORO");
    const borrado = await local.app.eventos.publicarCatalogo(ctxAdmin, { sobre: 1, catalogo: catalogo({}, [catalogo().paquetes[0]]) }, AHORA);
    assert.equal(!borrado.ok && borrado.problemas?.[0]?.message, "PAQUETE_DESAPARECE");
    const conApartado = catalogo();
    (conApartado.paquetes[0] as { incluye: unknown[] }).incluye = [{ productId: apartado, quantity: 1 }];
    const r = await local.app.eventos.publicarCatalogo(ctxAdmin, { sobre: 1, catalogo: conApartado }, AHORA);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "PRODUCTO_QUE_NO_SE_VENDE");
    const viejo = await local.app.eventos.publicarCatalogo(ctxAdmin, { sobre: null, catalogo: catalogo() }, AHORA);
    assert.equal(!viejo.ok && viejo.motivo, "CONFLICTO");
  });
});

describe("reservar (V-10)", () => {
  test("la reserva copia el paquete, calcula anticipo y saldo, y abre la cuenta del evento en la cola de la caja", async () => {
    const cmd = reserva();
    const r = await reservar(cmd);
    assert.equal(r.estado, "ANTICIPO_POR_COBRAR");
    assert.deepEqual([r.fecha, r.inicio, r.fin, r.invitados, r.cumpleanero, r.edad], ["2026-10-10", 900, 1080, 15, "Sofía", 6]);
    assert.equal(r.representante.fullName, "Carmen Rivas");
    assert.equal(r.paquete.name, "Básico");
    assert.deepEqual([r.anticipoBps, r.anticipo, r.saldo], [5000, usd("7500"), usd("7500")]);
    assert.equal(r.reservadaPor, "Marisol Prieto");
    assert.equal(r.cancelada, null);

    const c = await cuentaDe(r.cuenta.id);
    assert.deepEqual([c.kind, c.status, c.mode, c.eventId, c.orderNumber], ["EVENTO", "POR_COBRAR", "PREPAGO", r.id, r.cuenta.orderNumber]);
    assert.equal(c.pendingSince, new Date(AHORA).toISOString());
    assert.deepEqual(
      c.lines.map((l) => [l.kind, l.concept, l.amount.minor, l.paid]),
      [["EVENTO", "Anticipo 50 % · Cumpleaños de Sofía (10/10)", "7500", false]],
    );
    // Un doble clic devuelve la misma reserva, sin otra cuenta.
    assert.deepEqual(await reservar(cmd, ctxCajera, AHORA + 3000), r);
  });

  test("con céntimos impares el anticipo se redondea y el saldo cuadra con el precio", async () => {
    const r = await reservar(reserva({ paqueteId: "full", invitados: 20, fecha: "2026-10-17" }));
    assert.deepEqual([r.anticipo, r.saldo], [usd("12501"), usd("12500")]);
  });

  test("la familia del directorio no se duplica: el mismo contacto es la misma familia", async () => {
    const a = await reservar(reserva({ fecha: "2026-10-24", guardian: { fullName: "Pedro Gil", contactReference: "0424-7777777" } }));
    const b = await reservar(reserva({ fecha: "2026-10-31", guardian: { fullName: "Pedro Gil R.", contactReference: "0424-777-7777" } }));
    assert.equal(b.representante.id, a.representante.id);
    const c = await reservar(reserva({ fecha: "2026-11-07", guardian: undefined, guardianId: a.representante.id }));
    assert.equal(c.representante.fullName, "Pedro Gil");
  });

  test("lo que no cabe se niega con su motivo: fecha pasada, invitados, aforo del horario y paquete retirado", async () => {
    const motivo = async (cmd: unknown) => {
      const r = await local.app.eventos.reservar(ctxCajera, cmd, AHORA);
      assert.equal(r.ok, false);
      return !r.ok ? r.problemas?.[0]?.message : null;
    };
    assert.equal(await motivo(reserva({ fecha: "2026-10-02" })), "FECHA_PASADA");
    assert.equal(await motivo(reserva({ invitados: 9 })), "INVITADOS_FUERA_DEL_PAQUETE");
    assert.equal(await motivo(reserva({ invitados: 21 })), "INVITADOS_FUERA_DEL_PAQUETE");
    // El sábado 10 ya hay 15 invitados de 3:00 pm a 6:00 pm: con 20 más a las 5:00 pm se pasa de 30.
    assert.equal(await motivo(reserva({ paqueteId: "full", invitados: 20, inicio: 17 * 60, fin: 19 * 60 })), "AFORO_DEL_HORARIO");
    assert.ok(await reservar(reserva({ paqueteId: "full", invitados: 20, inicio: 18 * 60, fin: 20 * 60 })), "a las 6:00 pm ya terminó el otro");
    assert.equal(await motivo(reserva({ paqueteId: "no-existe" })), "PAQUETE_RETIRADO");
    // El contrato: el horario empieza antes de terminar.
    const r = await local.app.eventos.reservar(ctxCajera, reserva({ inicio: 18 * 60, fin: 15 * 60 }), AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
  });

  test("reserva quien atiende en la caja; la monitora y el mesero, no", async () => {
    for (const ctx of [ctxMonitora, ctxMesero]) {
      const r = await local.app.eventos.reservar(ctx, reserva({ fecha: "2026-12-05" }), AHORA);
      assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    }
  });
});

describe("el anticipo en la caja y la cancelación (DEC-24)", () => {
  test("la caja cobra el anticipo con su IVA y la reserva queda confirmada; cobrado, no se cancela", async () => {
    const r = await reservar(reserva({ fecha: "2026-11-14" }));
    const c = await cuentaDe(r.cuenta.id);
    const cobro = cobroDe(c, "8700");
    const hecho = valor(await local.app.cuentas.cobrar(ctxCajera, cobro, AHORA + MIN));
    assert.equal(hecho.cuenta.status, "COBRADA");
    assert.equal(hecho.venta.total.minor, "8700");
    const agenda = valor(await local.app.eventos.agenda(ctxCajera, { desde: "2026-11-14", hasta: "2026-11-14" }, AHORA));
    assert.equal(agenda.reservas.find((x) => x.id === r.id)!.estado, "CONFIRMADA");

    const cobrada = await local.app.eventos.cancelar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA + 2 * MIN);
    assert.equal(!cobrada.ok && cobrada.motivo, "CONFLICTO");
    assert.match(!cobrada.ok ? cobrada.mensaje : "", /anula su cobro/);

    // Devolver el anticipo es anular su cobro: la cuenta vuelve a la cola y la reserva se puede cancelar.
    const anulado = valor(
      await local.app.cuentas.anular(
        ctxCajera,
        { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cobro.idempotencyKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
        { autorizadorId: supervisor, pin: "5937", motivo: "El cliente desistió" },
        AHORA + 3 * MIN,
      ),
    );
    assert.equal(anulado.cuenta.status, "POR_COBRAR");
    const cmd = { idempotencyKey: randomUUID(), reservaId: r.id };
    const cancelada = valor(await local.app.eventos.cancelar(ctxCajera, cmd, AHORA + 4 * MIN));
    assert.equal(cancelada.estado, "CANCELADA");
    assert.deepEqual(cancelada.cancelada, { en: new Date(AHORA + 4 * MIN).toISOString(), por: "Marisol Prieto" });
    assert.equal(cancelada.cuenta.status, "SIN_CONSUMO");
    // Un doble clic devuelve lo mismo; otra cancelación, no.
    assert.deepEqual(valor(await local.app.eventos.cancelar(ctxCajera, cmd, AHORA + 5 * MIN)), cancelada);
    const otraVez = await local.app.eventos.cancelar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA + 5 * MIN);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
  });

  test("cancelada antes de cobrar, la cuenta sale de la cola y de los pendientes del cierre, y libera el horario", async () => {
    const r = await reservar(reserva({ fecha: "2026-11-21", paqueteId: "full", invitados: 25 }));
    const enCola = valor(await local.app.cortes.pendientes(ctxCajera, undefined, AHORA));
    assert.ok(enCola.cuentas.some((c) => c.id === r.cuenta.id && c.kind === "EVENTO"), "el anticipo por cobrar impide cerrar la jornada");
    valor(await local.app.eventos.cancelar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA + MIN));
    const despues = valor(await local.app.cortes.pendientes(ctxCajera, undefined, AHORA + 2 * MIN));
    assert.ok(!despues.cuentas.some((c) => c.id === r.cuenta.id));
    // Con la reserva cancelada, el horario tiene sitio otra vez.
    assert.equal((await reservar(reserva({ fecha: "2026-11-21", paqueteId: "full", invitados: 25 }), ctxCajera, AHORA + 3 * MIN)).estado, "ANTICIPO_POR_COBRAR");
  });

  test("la caja no le añade, no lo regala, no lo descuenta ni lo da por incobrable: se cobra o se cancela la reserva", async () => {
    const r = await reservar(reserva({ fecha: "2026-11-28" }));
    const c = await cuentaDe(r.cuenta.id);
    const guardar = await local.app.cuentas.guardar(ctxCajera, { cuenta: { ...c, split: { parts: 2, paid: 0 } } }, AHORA);
    assert.equal(!guardar.ok && guardar.problemas?.[0]?.message, "EVENTO_DESDE_LA_PANTALLA");
    const regalo = await local.app.cuentas.cortesia(
      ctxCajera,
      { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: c.lines[0]!.id, quitar: false, motivo: "INVITACION" },
      { autorizadorId: supervisor, pin: "5937", motivo: "Invitación" },
      AHORA,
    );
    assert.equal(regalo.ok, false);
    assert.match(!regalo.ok ? regalo.mensaje : "", /no se regala/);
    const incobrable = await local.app.cuentas.incobrable(
      ctxCajera,
      { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, motivo: "SE_FUE_SIN_PAGAR" },
      { autorizadorId: supervisor, pin: "5937", motivo: "Se fue" },
      AHORA,
    );
    assert.equal(!incobrable.ok && incobrable.motivo, "CONFLICTO");
    assert.match(!incobrable.ok ? incobrable.mensaje : "", /se cancela la reserva/);
    assert.equal((await cuentaDe(c.id)).version, c.version, "nada de eso añadió versión");
  });
});

describe("la agenda y el aviso de hoy", () => {
  test("la agenda va en orden de día y de hora, con el día de hoy del local", async () => {
    const a = valor(await local.app.eventos.agenda(ctxCajera, { desde: "2026-10-10", hasta: "2026-10-10" }, AHORA));
    assert.equal(a.hoy, HOY);
    assert.equal(a.ahora, 10 * 60, "son las 10:00 am en el local");
    assert.deepEqual(
      a.reservas.map((x) => x.inicio),
      [...a.reservas.map((x) => x.inicio)].sort((x, y) => x - y),
    );
    assert.ok(a.reservas.length >= 2);
    const largo = await local.app.eventos.agenda(ctxCajera, { desde: "2026-10-01", hasta: "2027-03-01" }, AHORA);
    assert.equal(!largo.ok && largo.motivo, "INVALIDO");
  });

  test("hoy: solo los cumpleaños de hoy que siguen en pie", async () => {
    const hoy = await reservar(reserva({ fecha: HOY, inicio: 16 * 60, fin: 19 * 60, cumpleanero: "Mateo" }));
    const cancelado = await reservar(reserva({ fecha: HOY, inicio: 10 * 60 + 30, fin: 12 * 60, cumpleanero: "Lucía" }));
    valor(await local.app.eventos.cancelar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: cancelado.id }, AHORA));
    const d = valor(await local.app.eventos.deHoy(ctxMonitora, AHORA));
    assert.deepEqual(d.reservas.map((x) => x.id), [hoy.id]);
    const m = await local.app.eventos.deHoy(ctxMesero, AHORA);
    assert.equal(!m.ok && m.motivo, "NO_PERMITIDO");
  });

  test("otro local no ve las reservas ni los paquetes de este", async () => {
    assert.equal((await otro.app.eventos.leerCatalogo(ctxOtro)).catalogo, null);
    const a = valor(await otro.app.eventos.agenda(ctxOtro, { desde: "2026-10-01", hasta: "2026-12-31" }, AHORA));
    assert.deepEqual(a.reservas, []);
  });
});

describe("el día del evento (B10-2)", () => {
  let refresco: string;
  let agotado: string;
  /** Lo que queda de un producto: la suma de sus movimientos. */
  const existencia = async (productId: string) =>
    (await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.aggregate({ where: { productId }, _sum: { quantity: true } })))._sum.quantity ?? 0;
  const salidaDe = (sessionIds: string[]) => ({ idempotencyKey: randomUUID(), sessionIds, disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } });
  const entrada = (reservaId: string, pulseras: string[]) => ({ idempotencyKey: randomUUID(), reservaId, pulseras });
  let pulsera = 0;
  const pulseras = (n: number) => Array.from({ length: n }, () => `AK-${String(7000 + ++pulsera)}`);
  /** Una reserva de hoy, de 10:30 am a 1:00 pm, con su anticipo cobrado (salvo que se diga). */
  const deHoyConfirmada = async (paqueteId: string, invitados: number, cobrar = true) => {
    const r = await reservar(reserva({ fecha: HOY, inicio: 10 * 60 + 30, fin: 13 * 60, paqueteId, invitados, cumpleanero: "Valentina" }));
    if (cobrar) {
      const c = await cuentaDe(r.cuenta.id);
      valor(await local.app.cuentas.cobrar(ctxCajera, cobroDe(c, "2320"), AHORA));
    }
    return r;
  };

  before(async () => {
    const crear = async (nombre: string) =>
      valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "150" } }, AHORA - 5 * MIN)).productos.find(
        (p) => p.nombre === nombre,
      )!.id;
    refresco = await crear("Refresco en lata");
    agotado = await crear("Jugo en caja");
    valor(
      await local.app.entradas.registrar(
        local.sistema,
        { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId: refresco, bultos: 1, unidadesPorBulto: 10, costo: { por: "BULTO", minor: "500" } }] },
        AHORA - 4 * MIN,
      ),
    );
    const vigente = await local.app.eventos.leerCatalogo(ctxCajera);
    const paquetes = vigente.catalogo!.paquetes.map((p) => ({ ...p, incluye: p.incluye.map(({ productId, quantity }) => ({ productId, quantity })) }));
    valor(
      await local.app.eventos.publicarCatalogo(
        ctxAdmin,
        {
          sobre: vigente.version,
          catalogo: {
            anticipoBps: 5000,
            paquetes: [
              ...paquetes,
              { id: "con-refresco", name: "Con refresco", price: usd("4000"), minInvitados: 2, maxInvitados: 5, incluye: [{ productId: refresco, quantity: 2 }], active: true },
              { id: "sin-existencia", name: "Sin existencia", price: usd("4000"), minInvitados: 1, maxInvitados: 5, incluye: [{ productId: agotado, quantity: 1 }], active: true },
            ],
          },
        },
        AHORA,
      ),
    );
  });

  test("sin el anticipo cobrado no empieza, ni entran invitados; otro día, tampoco", async () => {
    const r = await deHoyConfirmada("con-refresco", 3, false);
    const empezar = await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA);
    assert.equal(!empezar.ok && empezar.motivo, "CONFLICTO");
    assert.match(!empezar.ok ? empezar.mensaje : "", /Primero se cobra el anticipo/);
    const entrar = await local.app.eventos.entrarInvitados(ctxMonitora, entrada(r.id, pulseras(1)), AHORA);
    assert.equal(!entrar.ok && entrar.motivo, "CONFLICTO");
    valor(await local.app.eventos.cancelar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA));

    const otroDia = await reservar(reserva({ fecha: "2026-12-12" }));
    const c = await cuentaDe(otroDia.cuenta.id);
    valor(await local.app.cuentas.cobrar(ctxCajera, cobroDe(c, "8700"), AHORA));
    const antes = await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: otroDia.id }, AHORA);
    assert.match(!antes.ok ? antes.mensaje : "", /empieza ese día/);
  });

  test("empezar abre la cuenta del día con el saldo y lo incluido, que sale del estante; una vez", async () => {
    const r = await deHoyConfirmada("con-refresco", 3);
    assert.equal(r.estado, "ANTICIPO_POR_COBRAR", "la reserva devuelta es de antes del cobro");
    const antes = await existencia(refresco);
    const e = valor(await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA));
    assert.equal(e.estado, "EN_CURSO");
    assert.deepEqual([e.dia!.cuenta.status, e.dia!.entraron, e.dia!.dentro], ["POR_COBRAR", 0, 0]);
    const dia = await cuentaDe(e.dia!.cuenta.id);
    assert.deepEqual([dia.kind, dia.eventDay, dia.eventId, dia.mode], ["EVENTO", true, r.id, "PREPAGO"]);
    assert.deepEqual(
      dia.lines.map((l) => [l.concept, l.amount.minor, l.productId ?? null]),
      [
        ["Saldo · Cumpleaños de Valentina (Con refresco)", "2000", null],
        ["Refresco en lata · incluido", "0", refresco],
        ["Refresco en lata · incluido", "0", refresco],
      ],
    );
    assert.equal(await existencia(refresco), antes - 2, "los dos refrescos salieron del estante");
    // Otra vez (otro toque, otra clave): el mismo día, sin otra cuenta ni otra salida del estante.
    const otra = valor(await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA + MIN));
    assert.equal(otra.dia!.cuenta.id, e.dia!.cuenta.id);
    assert.equal(await existencia(refresco), antes - 2);
  });

  test("sin existencia de lo incluido el día no empieza", async () => {
    const r = await deHoyConfirmada("sin-existencia", 2);
    const e = await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA);
    assert.equal(!e.ok && e.motivo, "INVALIDO");
    assert.match(!e.ok ? e.mensaje : "", /Jugo en caja/);
    assert.equal(valor(await local.app.eventos.agenda(ctxCajera, { desde: HOY, hasta: HOY }, AHORA)).reservas.find((x) => x.id === r.id)!.estado, "CONFIRMADA");
  });

  test("los invitados entran con sus pulseras a la cuenta del día, sin cobro y hasta los reservados; la primera entrada lo empieza", async () => {
    const r = await deHoyConfirmada("con-refresco", 3);
    const cmd = entrada(r.id, pulseras(2));
    const hecha = valor(await local.app.eventos.entrarInvitados(ctxMonitora, cmd, AHORA));
    assert.equal(hecha.sessions.length, 2);
    assert.ok(hecha.sessions.every((s) => s.accountId === hecha.account.id && s.packagePrice.minor === "0" && s.packageName === "Cumpleaños de Valentina"));
    assert.equal(hecha.account.eventDay, true);
    // Hasta la hora de fin del evento (1:00 pm; son las 10:00 am): 180 minutos.
    assert.deepEqual(hecha.sessions[0]!.duration, { kind: "fixed", minutes: 180 });
    assert.equal(hecha.sessions[0]!.terms.penaltyPricePerBlock.minor, "0", "no se cobra tiempo de más");
    // Un reintento devuelve la misma entrada.
    assert.deepEqual(valor(await local.app.eventos.entrarInvitados(ctxMonitora, cmd, AHORA + 2000)), hecha);
    // En sala, con el representante de la reserva.
    const sala = valor(await local.app.parque.sala(ctxMonitora, AHORA));
    assert.ok(hecha.sessions.every((s) => sala.sessions.some((x) => x.id === s.id && x.guardianName === "Carmen Rivas")));
    // Se reservaron 3: con dos más, sobra uno.
    const demas = await local.app.eventos.entrarInvitados(ctxMonitora, entrada(r.id, pulseras(2)), AHORA);
    assert.equal(!demas.ok && demas.problemas?.[0]?.message, "INVITADOS_COMPLETOS");
    // Una pulsera ya activa no entra dos veces.
    const repetida = await local.app.eventos.entrarInvitados(ctxMonitora, entrada(r.id, [hecha.sessions[0]!.wristbandCode]), AHORA);
    assert.equal(!repetida.ok && repetida.problemas?.[0]?.message, "PULSERA_ACTIVA");
    const agenda = valor(await local.app.eventos.deHoy(ctxCajera, AHORA)).reservas.find((x) => x.id === r.id)!;
    assert.deepEqual([agenda.estado, agenda.dia!.entraron, agenda.dia!.dentro], ["EN_CURSO", 2, 2]);
    // Un invitado no recarga tiempo.
    const recarga = await local.app.parque.recargar(ctxMonitora, { idempotencyKey: randomUUID(), sessionId: hecha.sessions[0]!.id, packageId: "pkg-60" }, AHORA);
    assert.equal(!recarga.ok && recarga.motivo, "CONFLICTO");
  });

  test("el saldo se cobra en la caja con invitados dentro; que salgan no la reabre, y hasta cobrarlo está en los pendientes", async () => {
    const r = await deHoyConfirmada("con-refresco", 3);
    const hecha = valor(await local.app.eventos.entrarInvitados(ctxMonitora, entrada(r.id, pulseras(3)), AHORA));
    const [a, b, c] = hecha.sessions.map((s) => s.id);
    // Sale uno: nada que cobrar por él, y la cuenta del día sigue en la caja con el saldo.
    const s1 = valor(await local.app.parque.salir(ctxMonitora, salidaDe([a!]), AHORA + 30 * MIN));
    assert.equal(s1.lines[0]!.total.minor, "0");
    assert.equal(s1.account.status, "POR_COBRAR");
    assert.ok(valor(await local.app.cortes.pendientes(ctxCajera, undefined, AHORA + 31 * MIN)).cuentas.some((x) => x.id === hecha.account.id));
    // Se cobra el saldo con su IVA (lo incluido va a $ 0): saldada, aunque queden dos dentro.
    const dia = await cuentaDe(hecha.account.id);
    const cobro = valor(await local.app.cuentas.cobrar(ctxCajera, cobroDe(dia, "2320"), AHORA + 32 * MIN));
    assert.equal(cobro.cuenta.status, "COBRADA");
    // Salen los demás después de las 1:00 pm: en gracia, sin tiempo de más, y la cuenta sigue cobrada.
    const s2 = valor(await local.app.parque.salir(ctxMonitora, salidaDe([b!, c!]), AHORA + 3 * 60 * MIN + 40 * MIN));
    assert.ok(s2.lines.every((l) => l.total.minor === "0"));
    assert.equal(s2.account.status, "COBRADA");
    assert.ok(!valor(await local.app.cortes.pendientes(ctxCajera, undefined, AHORA + 4 * 60 * MIN)).cuentas.some((x) => x.id === hecha.account.id));
    const agenda = valor(await local.app.eventos.agenda(ctxCajera, { desde: HOY, hasta: HOY }, AHORA)).reservas.find((x) => x.id === r.id)!;
    assert.deepEqual([agenda.estado, agenda.dia!.entraron, agenda.dia!.dentro], ["SALDADA", 3, 0]);
  });
});

describe("el saldo incobrable (B10-2)", () => {
  test("con el saldo dado por incobrable no entran más invitados", async () => {
    const r = await reservar(reserva({ fecha: HOY, inicio: 10 * 60 + 30, fin: 13 * 60, paqueteId: "basico", invitados: 10, cumpleanero: "Martina" }));
    valor(await local.app.cuentas.cobrar(ctxCajera, cobroDe(await cuentaDe(r.cuenta.id), "8700"), AHORA));
    const e = valor(await local.app.eventos.empezar(ctxCajera, { idempotencyKey: randomUUID(), reservaId: r.id }, AHORA));
    const dia = await cuentaDe(e.dia!.cuenta.id);
    valor(
      await local.app.cuentas.incobrable(
        ctxCajera,
        { idempotencyKey: randomUUID(), accountId: dia.id, version: dia.version, motivo: "NO_PUEDE_PAGAR" },
        { autorizadorId: supervisor, pin: "5937", motivo: "No vino nadie" },
        AHORA,
      ),
    );
    const agenda = valor(await local.app.eventos.deHoy(ctxCajera, AHORA)).reservas.find((x) => x.id === r.id)!;
    assert.equal(agenda.estado, "SALDO_INCOBRABLE");
    const entrar = await local.app.eventos.entrarInvitados(ctxMonitora, { idempotencyKey: randomUUID(), reservaId: r.id, pulseras: ["AK-7999"] }, AHORA);
    assert.equal(!entrar.ok && entrar.motivo, "CONFLICTO");
    assert.match(!entrar.ok ? entrar.mensaje : "", /incobrable/);
  });
});
