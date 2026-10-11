/**
 * Un día que no se cerró, contra l2control_test — B3-24 (M-38, W-2).
 *
 * El 9 de octubre la caja quedó abierta y una venta del 10 entró en el día 9. Aquí: el día de negocio termina a la hora
 * de los ajustes (4:00 am de fábrica); hasta entonces la caja cobra lo de la noche, y desde entonces es de un día
 * anterior: no cobra lo nuevo («ciérrala antes de cobrar»), sí lo de su día, y su cierre pide solo lo de su día.
 *
 * Con reloj fijo: el turno abre el domingo 27 de septiembre de 2026 a las 9:30 am (Caracas, UTC−4); su día termina el
 * lunes 28 a las 4:00 am (08:00 UTC). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TurnoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba, FACTURA_DE_PRUEBA } from "../para-pruebas.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { turnoParaCobrar } from "./turnos.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const HOY = "2026-09-27";
const ABRE = Date.parse("2026-09-27T13:30:00.000Z"); // 9:30 am del 27
const NOCHE = Date.parse("2026-09-28T03:00:00.000Z"); // 11:00 pm del 27
const MADRUGADA = Date.parse("2026-09-28T05:30:00.000Z"); // 1:30 am del 28
const FIN = Date.parse("2026-09-28T08:00:00.000Z"); // 4:00 am del 28: termina el día 27
const MANANA = Date.parse("2026-09-28T14:00:00.000Z"); // 10:00 am del 28
const MIN = 60_000;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

const PIN = { admin: "4826", cajera: "7391", cajera2: "2846" } as const;

interface Montado {
  l: LocalDePrueba;
  cajera: string;
  cajera2: string;
  ctxAdmin: Contexto;
  agua: string;
}

async function montar(nombre: string, finDelDiaMin?: number): Promise<Montado> {
  const l = await abrirLocalDePrueba(URL_APP, nombre);
  await impresoraDePrueba(l);
  const admin = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: PIN.admin });
  const cajera = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: PIN.cajera });
  const cajera2 = await crearPersona(l, { nombre: "Carla Ruiz", role: "CAJERO", pin: PIN.cajera2 });
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, ABRE - 60 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, ABRE - 60 * MIN));
  }
  const catalogo = valor(
    await l.app.productos.aplicar(
      l.sistema,
      { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } },
      ABRE - 60 * MIN,
    ),
  );
  if (finDelDiaMin !== undefined) {
    const v = await l.app.ajustes.leer(l.sistema);
    valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, finDelDiaMin } }));
  }
  return {
    l,
    cajera,
    cajera2,
    ctxAdmin: await contextoDe(l, await crearEquipo(l, "Oficina"), admin, PIN.admin),
    agua: catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id,
  };
}

/** Un equipo de caja nuevo con su turno abierto a `cuando`: $ 20,00 y Bs. 1.500,00 de fondo. */
async function caja(m: Montado, nombre: string, cuando = ABRE, persona = m.cajera, pin: string = PIN.cajera): Promise<{ ctx: Contexto; turno: TurnoDto }> {
  const ctx = await contextoDe(m.l, await crearEquipo(m.l, nombre), persona, pin);
  const turno = valor(
    await m.l.app.turnos.abrir(ctx, { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: ves("150000") }] }, undefined, cuando),
  );
  return { ctx, turno };
}

/** Una cuenta del mostrador con un agua, por cobrar desde `cuando`. */
async function cuentaDe(m: Montado, ctx: Contexto, cuando: number) {
  return valor(
    await m.l.app.cuentas.guardar(
      ctx,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(cuando).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: m.agua, taxCode: "GENERAL" }],
        },
      },
      cuando,
    ),
  );
}

/** Cobra una cuenta de un agua con $ 5,00 en efectivo ($ 1,31 con el IGTF; el resto, de vuelto). */
const cobrar = (m: Montado, ctx: Contexto, c: { id: string; version?: number | undefined; lines: { id: string }[] }, cuando: number) =>
  m.l.app.cuentas.cobrar(
    ctx,
    {
      idempotencyKey: randomUUID(),
      accountId: c.id,
      version: c.version,
      lineIds: c.lines.map((x) => x.id),
      destinoSobra: "VUELTO",
      cliente: FACTURA_DE_PRUEBA,
      total: usd("131"),
      pagos: [{ method: "EFECTIVO_USD", amount: usd("500") }],
    },
    cuando,
  );

const asientosDe = (m: Montado, accountId: string) =>
  m.l.base.conTenant(m.l.sistema.tenantId, (tx) => tx.payment.count({ where: { documentId: accountId } }));

let m: Montado;
before(async () => {
  m = await montar("Prueba B3-24 Día");
});
after(async () => {
  await m.l.cerrar();
});

describe("el día de negocio termina a la hora de los ajustes (B3-24)", () => {
  test("el turno dice cuándo termina su día: el día siguiente a las 4:00 am", async () => {
    const { ctx, turno } = await caja(m, "Prueba B3-24 Caja Fin");
    assert.equal(turno.businessDate, HOY);
    assert.equal(turno.terminaEl, new Date(FIN).toISOString());
    assert.equal((await m.l.app.turnos.delEquipo(ctx))?.terminaEl, new Date(FIN).toISOString());
  });

  test("a la 1:30 am sigue siendo el día: cobra lo de la noche y una caja nueva es del día que se trabaja", async () => {
    const { ctx } = await caja(m, "Prueba B3-24 Caja Noche");
    const c = await cuentaDe(m, ctx, MADRUGADA);
    valor(await cobrar(m, ctx, c, MADRUGADA));
    const otra = await caja(m, "Prueba B3-24 Caja Madrugada", MADRUGADA, m.cajera2, PIN.cajera2);
    assert.equal(otra.turno.businessDate, HOY);
  });

  test("Inicio, a la 1:30 am, sigue en el día que se trabaja", async () => {
    assert.equal(valor(await m.l.app.cortes.resumenDelDia(m.ctxAdmin, MADRUGADA)).dia, HOY);
    assert.equal(valor(await m.l.app.cortes.resumenDelDia(m.ctxAdmin, MANANA)).dia, "2026-09-28");
  });
});

describe("la caja de un día anterior (B3-24)", () => {
  test("desde las 4:00 am no cobra lo nuevo: dice de qué día es, pide cerrarse y no deja asientos", async () => {
    const { ctx } = await caja(m, "Prueba B3-24 Caja Vieja");
    const hoy = await cuentaDe(m, ctx, MANANA);
    const r = await cobrar(m, ctx, hoy, MANANA);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.motivo === "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /Esta caja es del 27 de septiembre: ciérrala antes de cobrar/);
    assert.deepEqual(!r.ok ? r.problemas?.map((p) => p.message) : [], ["CAJA_DE_OTRO_DIA"]);
    assert.equal(await asientosDe(m, hoy.id), 0);
    // Un minuto antes de las 4:00 am, todavía era su día.
    const antes = await cuentaDe(m, ctx, FIN - MIN);
    valor(await cobrar(m, ctx, antes, FIN - MIN));
  });

  test("lo de su día sí: la cuenta de anoche se cobra en la caja de anoche, y cuenta en ese día", async () => {
    const { ctx, turno } = await caja(m, "Prueba B3-24 Caja Anoche");
    const anoche = await cuentaDe(m, ctx, NOCHE);
    const r = valor(await cobrar(m, ctx, anoche, MANANA));
    assert.equal(r.cuenta.status, "COBRADA");
    const venta = await m.l.base.conTenant(m.l.sistema.tenantId, (tx) => tx.sale.findFirstOrThrow({ where: { accountId: anoche.id }, select: { shiftId: true } }));
    assert.equal(venta.shiftId, turno.id);
  });

  test("corrige lo que ella cobró, pero no lo de otra caja, ni saca hoy dinero de la gaveta", async () => {
    const { ctx, turno } = await caja(m, "Prueba B3-24 Caja Correcciones");
    const decide = (uso: Parameters<typeof turnoParaCobrar>[3]) =>
      m.l.base.conTenant(m.l.sistema.tenantId, async (tx) => {
        const r = await turnoParaCobrar(tx, ctx, MANANA, uso);
        return "ok" in r ? r.problemas?.[0]?.message : "SI";
      });
    assert.equal(await decide({ kind: "CORRECCION", turnoId: turno.id }), "SI");
    assert.equal(await decide({ kind: "CORRECCION", turnoId: randomUUID() }), "CAJA_DE_OTRO_DIA");
    assert.equal(await decide({ kind: "SALIDA" }), "CAJA_DE_OTRO_DIA");
    assert.equal(await decide({ kind: "COBRO", abiertaEn: null }), "CAJA_DE_OTRO_DIA");
    assert.equal(await decide({ kind: "COBRO", abiertaEn: null, desdePapel: true }), "SI");
    assert.equal(await decide({ kind: "LECTURA" }), "SI");
  });

  test("abrir otra caja en el mismo equipo dice de qué día es la que sigue abierta", async () => {
    const { ctx } = await caja(m, "Prueba B3-24 Caja Repetida");
    const r = await m.l.app.turnos.abrir(ctx, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: ves("0") }] }, undefined, MANANA);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.mensaje : "", /abierta la caja del 27 de septiembre: ciérrala antes de abrir la de hoy/);
  });
});

describe("el cierre de la caja de un día anterior pide solo lo de su día (B3-24)", () => {
  test("lo de hoy no frena el cierre de ayer: queda para la caja de hoy", async () => {
    const u = await montar("Prueba B3-24 Cierre");
    try {
      const { ctx, turno } = await caja(u, "Prueba B3-24 Caja Cierre");
      const anoche = await cuentaDe(u, ctx, NOCHE);
      const hoy = await cuentaDe(u, ctx, MANANA);

      // Antes de las 4:00 am, las dos son del día: las dos frenan el cierre.
      assert.equal(valor(await u.l.app.cortes.pendientes(u.ctxAdmin, turno.id, FIN - MIN)).cuentas.length, 2);
      // Desde las 4:00 am, solo la de anoche: la de hoy es de la caja de hoy.
      const p = valor(await u.l.app.cortes.pendientes(u.ctxAdmin, turno.id, MANANA));
      assert.deepEqual(p.cuentas.map((c) => c.id), [anoche.id]);

      // Se resuelve lo de su día y la caja cierra el día, con la de hoy todavía por cobrar.
      valor(await cobrar(u, ctx, anoche, MANANA));
      const esperado = await u.l.base.conTenant(u.l.sistema.tenantId, (tx) => esperadoEnGaveta(tx, turno.id));
      // Lo que dice el libro, en billetes de 100 unidades menores y monedas de 1: sin diferencia, firma la cajera.
      const cuenta = (currency: "USD" | "VES") => {
        const minor = esperado.get(currency)!.amount;
        return {
          currency,
          billetes: [
            { denominacion: { minor: "100", currency }, cantidad: Number(minor / 100n) },
            { denominacion: { minor: "1", currency }, cantidad: Number(minor % 100n) },
          ],
        };
      };
      const arqueo = valor(await u.l.app.cortes.arquear(ctx, { turnoId: turno.id, conteos: [cuenta("USD"), cuenta("VES")] }, MANANA));
      const z = valor(
        await u.l.app.cortes.corteZ(
          ctx,
          { idempotencyKey: randomUUID(), turnoId: turno.id, arqueoId: arqueo.id, quedaEnGaveta: [usd("2000"), ves("150000")] },
          { autorizadorId: u.cajera, pin: PIN.cajera, motivo: "Cierro el día 27" },
          MANANA,
        ),
      );
      assert.equal(z.cierre?.tipo, "JORNADA");
      const sigue = valor(await u.l.app.cuentas.leer(u.ctxAdmin, MANANA)).cuentas;
      assert.equal(sigue.find((c) => c.id === hoy.id)?.status, "POR_COBRAR");
    } finally {
      await u.l.cerrar();
    }
  });
});

describe("con el día terminando a medianoche (B3-24)", () => {
  test("a la 1:30 am ya es otro día: la caja de la tarde no cobra lo nuevo", async () => {
    const u = await montar("Prueba B3-24 Medianoche", 0);
    try {
      const { ctx, turno } = await caja(u, "Prueba B3-24 Caja Medianoche");
      assert.equal(turno.terminaEl, "2026-09-28T04:00:00.000Z");
      const c = await cuentaDe(u, ctx, MADRUGADA);
      const r = await cobrar(u, ctx, c, MADRUGADA);
      assert.equal(r.ok, false);
      assert.deepEqual(!r.ok ? r.problemas?.map((p) => p.message) : [], ["CAJA_DE_OTRO_DIA"]);
    } finally {
      await u.l.cerrar();
    }
  });

  test("los ajustes no aceptan un fin del día pasadas las 10:00 am", async () => {
    const v = await m.l.app.ajustes.leer(m.l.sistema);
    assert.equal(v.ajustes.finDelDiaMin, 240);
    const r = await m.l.app.ajustes.publicar(m.l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, finDelDiaMin: 601 } });
    assert.equal(r.ok, false);
  });

  test("la hora no se mueve con una caja abierta: dejaría su turno de otro día de golpe", async () => {
    const v = await m.l.app.ajustes.leer(m.l.sistema);
    const r = await m.l.app.ajustes.publicar(m.l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, finDelDiaMin: 300 } });
    assert.ok(!r.ok && r.motivo === "CONFLICTO");
    assert.deepEqual(!r.ok ? r.problemas?.map((p) => p.path.join(".")) : [], ["ajustes.finDelDiaMin"]);
  });
});
