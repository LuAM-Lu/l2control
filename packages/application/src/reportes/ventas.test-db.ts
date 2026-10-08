/**
 * El informe de ventas contra l2control_test — B11-1, F9-01 (M-29).
 *
 * Un día con dos turnos: uno sellado con su Z (ventas en dólares y en bolívares, una de mesa y una anulada) y otro
 * abierto. El informe cuenta lo vendido por origen y por cajera, lo cobrado por medio con la tasa de cada cobro, deja
 * las anuladas aparte y cuadra cada turno con su Z. Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en
 * Caracas). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { InformeDeVentasDto, TurnoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;
const PIN = { admin: "4826", supervisor: "5937", cajera: "7391", cajera2: "2846", monitora: "6284" } as const;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const pinDe = (autorizadorId: string, pin: string, motivo = "Revisado") => ({ autorizadorId, pin, motivo });

let l: LocalDePrueba;
let ids: { admin: string; supervisor: string; cajera: string; cajera2: string };
let ctxAdmin: Contexto;
let ctxSupervisor: Contexto;
let ctxMonitora: Contexto;
let agua: string;
let tasa: string;
let turnoA: TurnoDto;
let turnoB: TurnoDto;

/** Una cuenta (de mostrador o de una mesa) con un agua de $ 1,00, cobrada como se diga. */
async function vender(ctx: Contexto, pago: "EFECTIVO_USD" | "EFECTIVO_VES", mesa = false) {
  const c = valor(
    await l.app.cuentas.guardar(
      ctx,
      {
        cuenta: {
          id: randomUUID(),
          kind: mesa ? "MESA" : "MOSTRADOR",
          family: mesa ? "Mesa 1" : "Mostrador",
          ...(mesa ? { tableId: "mesa-1", tableLabel: "1" } : {}),
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
  // $ 5,00 en efectivo llevan $ 0,15 de IGTF: total $ 1,31. Bs. 1.000,00 a 855,6625 son $ 1,17 de $ 1,16.
  const cmd =
    pago === "EFECTIVO_USD"
      ? { total: usd("131"), pagos: [{ method: "EFECTIVO_USD", amount: usd("500") }] }
      : { total: usd("116"), pagos: [{ method: "EFECTIVO_VES", amount: ves("100000") }], rateId: tasa };
  const clave = randomUUID();
  const r = valor(await l.app.cuentas.cobrar(ctx, { idempotencyKey: clave, accountId: c.id, version: c.version, lineIds: c.lines.map((x) => x.id), destinoSobra: "VUELTO", ...cmd }, AHORA));
  return { cuenta: r.cuenta, clave };
}

async function caja(nombre: string, persona: string, pin: string): Promise<{ ctx: Contexto; turno: TurnoDto }> {
  const ctx = await contextoDe(l, await crearEquipo(l, nombre), persona, pin);
  const turno = valor(await l.app.turnos.abrir(ctx, { fondos: [{ currency: "USD", amount: usd("2000") }, { currency: "VES", amount: ves("150000") }] }, undefined, AHORA - 30 * MIN));
  return { ctx, turno };
}

const informe = (ctx: Contexto, q: Record<string, unknown>) => l.app.reportes.ventas(ctx, q, AHORA + 30 * MIN);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Reportes de ventas");
  await impresoraDePrueba(l);
  await planoDePrueba(l);
  ids = {
    admin: await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: PIN.admin }),
    supervisor: await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: PIN.supervisor }),
    cajera: await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: PIN.cajera }),
    cajera2: await crearPersona(l, { nombre: "Carla Ruiz", role: "CAJERO", pin: PIN.cajera2 }),
  };
  const monitora = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: PIN.monitora });
  ctxAdmin = await contextoDe(l, await crearEquipo(l, "Oficina"), ids.admin, PIN.admin);
  ctxSupervisor = await contextoDe(l, await crearEquipo(l, "Supervisión"), ids.supervisor, PIN.supervisor);
  ctxMonitora = await contextoDe(l, await crearEquipo(l, "Entrada"), monitora, PIN.monitora);
  tasa = valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 60 * MIN)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  agua = valor(
    await l.app.productos.aplicar(l.sistema, { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } }, AHORA - 60 * MIN),
  ).productos.find((p) => p.nombre === "Agua mineral")!.id;

  // Turno A (Marisol): dos de mostrador (en dólares y en bolívares), una de mesa y una anulada; sellado con su Z.
  const a = await caja("Caja 1", ids.cajera, PIN.cajera);
  turnoA = a.turno;
  await vender(a.ctx, "EFECTIVO_USD");
  await vender(a.ctx, "EFECTIVO_VES");
  await vender(a.ctx, "EFECTIVO_USD", true);
  const anulada = await vender(a.ctx, "EFECTIVO_USD");
  valor(
    await l.app.cuentas.anular(
      a.ctx,
      { idempotencyKey: randomUUID(), accountId: anulada.cuenta.id, cobroKey: anulada.clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
      pinDe(ids.supervisor, PIN.supervisor, "Cobro repetido"),
      AHORA + MIN,
    ),
  );
  // Esperado en la gaveta: $ 20,00 + 1,31 + 1,31 = $ 22,62, y Bs. 1.500,00 + 1.000,00 - el vuelto de un céntimo.
  const esperado = (await l.app.cortes.corteX(ctxSupervisor, { turnoId: turnoA.id }, AHORA + 2 * MIN)) as { ok: true; valor: { gaveta: { currency: string; esperado: { minor: string } }[] } };
  const enGaveta = (c: string) => BigInt(esperado.valor.gaveta.find((g) => g.currency === c)!.esperado.minor);
  const billetes = (minor: bigint, currency: "USD" | "VES") => [
    { denominacion: { minor: "100", currency }, cantidad: Number(minor / 100n) },
    { denominacion: { minor: "1", currency }, cantidad: Number(minor % 100n) },
  ];
  const arqueo = valor(
    await l.app.cortes.arquear(
      a.ctx,
      { turnoId: turnoA.id, conteos: [{ currency: "USD", billetes: billetes(enGaveta("USD"), "USD") }, { currency: "VES", billetes: billetes(enGaveta("VES"), "VES") }] },
      AHORA + 3 * MIN,
    ),
  );
  valor(
    await l.app.cortes.corteZ(
      a.ctx,
      { idempotencyKey: randomUUID(), turnoId: turnoA.id, arqueoId: arqueo.id, cierre: "RELEVO", quedaEnGaveta: [usd("2000"), ves("150000")] },
      pinDe(ids.cajera, PIN.cajera, "Cierro el turno"),
      AHORA + 4 * MIN,
    ),
  );

  // Turno B (Carla), abierto: una venta.
  const b = await caja("Caja 2", ids.cajera2, PIN.cajera2);
  turnoB = b.turno;
  await vender(b.ctx, "EFECTIVO_USD");
});

after(async () => {
  await l.cerrar();
});

describe("las ventas de un periodo (F9-01)", () => {
  let r: InformeDeVentasDto;

  test("lo vendido, sin las anuladas; lo anulado aparte, con su motivo y quién lo autorizó", async () => {
    r = valor(await informe(ctxSupervisor, { desde: HOY, hasta: HOY }));
    assert.deepEqual([r.resumen.ventas, r.resumen.vendido, r.resumen.anuladas, r.resumen.anulado], [4, usd("509"), 1, usd("131")]);
    assert.deepEqual([r.resumen.turnos, r.resumen.turnosSinZ], [2, 1]);
    assert.deepEqual(
      r.anuladas.map((a) => [a.cajera, a.total, a.motivo, a.autorizadoPor]),
      [["Marisol Prieto", usd("131"), "Error en el cobro", "Luis Guerrero"]],
    );
    assert.deepEqual([r.encabezado.generadoPor, r.encabezado.generadoEn], ["Luis Guerrero", new Date(AHORA + 30 * MIN).toISOString()]);
  });

  test("por origen (la cuenta en que se cobró) y por cajera", () => {
    assert.deepEqual(
      r.porOrigen.map((o) => [o.origen, o.ventas, o.vendido]),
      [
        ["PARQUE", 0, usd("0")],
        ["RESTAURANTE", 1, usd("131")],
        ["MOSTRADOR", 3, usd("378")],
        ["CUMPLEANOS", 0, usd("0")],
      ],
    );
    assert.deepEqual(
      r.porCajera.map((c) => [c.cajera, c.ventas, c.vendido, c.anuladas]),
      [
        ["Carla Ruiz", 1, usd("131"), 0],
        ["Marisol Prieto", 3, usd("378"), 1],
      ],
    );
  });

  test("por medio, en su moneda, y en dólares con la tasa de cada cobro", () => {
    const efectivo = r.porMedio.find((m) => m.medio === "EFECTIVO_USD")!;
    // Cuatro cobros de $ 5,00 con su vuelto de $ 3,69, menos la anulada devuelta: $ 1,31 × 3; y el céntimo que sobró de
    // la venta en bolívares, devuelto en dólares.
    assert.deepEqual(efectivo.neto, usd("392"));
    assert.deepEqual(efectivo.enDolares, usd("392"));
    const bolivares = r.porMedio.find((m) => m.medio === "EFECTIVO_VES")!;
    assert.equal(bolivares.moneda, "VES");
    assert.deepEqual(bolivares.cobrado, ves("100000"));
    // Bs. 1.000,00 a 855,6625 son $ 1,17; el vuelto, en su moneda y con la misma tasa.
    assert.ok(bolivares.enDolares && BigInt(bolivares.enDolares.minor) >= 116n && BigInt(bolivares.enDolares.minor) <= 117n, JSON.stringify(bolivares));
    assert.ok(r.resumen.cobradoEnDolares);
  });

  test("cada turno: el sellado cuadra con su Z; el abierto todavía no tiene", () => {
    const a = r.porTurno.find((t) => t.id === turnoA.id)!;
    const b = r.porTurno.find((t) => t.id === turnoB.id)!;
    assert.deepEqual([a.estado, a.abrio, a.ventas, a.anuladas, a.vendido, a.cuadre], ["CERRADO_Z", "Marisol Prieto", 3, 1, usd("378"), { estado: "CUADRA", diferencias: [] }]);
    assert.deepEqual([b.estado, b.cuadre.estado], ["ABIERTO", "SIN_Z"]);
    assert.deepEqual(r.cajeras.map((c) => c.nombre), ["Carla Ruiz", "Marisol Prieto"]);
  });

  test("solo lo de una cajera: sus turnos", async () => {
    const solo = valor(await informe(ctxAdmin, { desde: HOY, hasta: HOY, cajera: ids.cajera2 }));
    assert.deepEqual([solo.cajera?.nombre, solo.resumen.ventas, solo.porTurno.map((t) => t.id)], ["Carla Ruiz", 1, [turnoB.id]]);
  });

  test("otro día no tiene nada; el periodo se valida y es de quien ve la sucursal", async () => {
    const ayer = valor(await informe(ctxAdmin, { desde: "2026-09-26", hasta: "2026-09-26" }));
    assert.deepEqual([ayer.resumen.ventas, ayer.porTurno.length, ayer.porMedio.length], [0, 0, 0]);
    const alReves = await informe(ctxAdmin, { desde: HOY, hasta: "2026-09-20" });
    assert.equal(!alReves.ok && alReves.motivo, "INVALIDO");
    const largo = await informe(ctxAdmin, { desde: "2026-01-01", hasta: HOY });
    assert.match(!largo.ok ? (largo.problemas?.[0]?.message ?? "") : "", /Hasta 93 días/);
    const monitora = await informe(ctxMonitora, { desde: HOY, hasta: HOY });
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
  });
});
