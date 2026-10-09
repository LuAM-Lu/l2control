/**
 * El cierre del turno y de la jornada en el servidor, contra l2control_test — B3-5, F4-05 a F4-08,
 * JORNADA §3 a §5, D-JOR.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): la tasa del turno, el IVA,
 * el IGTF y el día de negocio dependen de él. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ArqueoDto, TurnoDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, impresoraDePrueba, type LocalDePrueba, FACTURA_DE_PRUEBA } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const ves = (minor: string) => ({ minor, currency: "VES" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

/** Un local con su gente, su tasa (855,6625), sus impuestos, agua a $ 1,00 y tarifario. */
interface Montado {
  l: LocalDePrueba;
  admin: string;
  supervisor: string;
  cajera: string;
  cajera2: string;
  ctxAdmin: Contexto;
  ctxSupervisor: Contexto;
  ctxMonitora: Contexto;
  agua: string;
  tasa: string;
}

const PIN = { admin: "4826", supervisor: "5937", cajera: "7391", cajera2: "2846", monitora: "6284" } as const;

async function montar(nombre: string, conDatos = true): Promise<Montado> {
  const l = await abrirLocalDePrueba(URL_APP, nombre);
  await impresoraDePrueba(l);
  const admin = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: PIN.admin });
  const supervisor = await crearPersona(l, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: PIN.supervisor });
  const cajera = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: PIN.cajera });
  const cajera2 = await crearPersona(l, { nombre: "Carla Ruiz", role: "CAJERO", pin: PIN.cajera2 });
  const monitora = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: PIN.monitora });
  const m: Montado = {
    l,
    admin,
    supervisor,
    cajera,
    cajera2,
    ctxAdmin: await contextoDe(l, await crearEquipo(l, "Oficina"), admin, PIN.admin),
    ctxSupervisor: await contextoDe(l, await crearEquipo(l, "Supervisión"), supervisor, PIN.supervisor),
    ctxMonitora: await contextoDe(l, await crearEquipo(l, "Entrada"), monitora, PIN.monitora),
    agua: "",
    tasa: "",
  };
  if (!conDatos) return m;
  m.tasa = valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 60 * MIN)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 300, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 60 * MIN));
  }
  const catalogo = valor(
    await l.app.productos.aplicar(
      l.sistema,
      { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } },
      AHORA - 60 * MIN,
    ),
  );
  m.agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
  return m;
}

/** Un equipo de caja nuevo con su turno abierto: $ 20,00 y Bs. 1.500,00 de fondo. */
async function caja(m: Montado, nombre: string, persona = m.cajera, pin: string = PIN.cajera, fondo = { usd: "2000", ves: "150000" }): Promise<{ ctx: Contexto; turno: TurnoDto }> {
  const ctx = await contextoDe(m.l, await crearEquipo(m.l, nombre), persona, pin);
  const turno = valor(
    await m.l.app.turnos.abrir(
      ctx,
      {
        fondos: [
          { currency: "USD", amount: usd(fondo.usd) },
          { currency: "VES", amount: ves(fondo.ves) },
        ],
      },
      undefined,
      AHORA - 30 * MIN,
    ),
  );
  return { ctx, turno };
}

/** Una venta de mostrador de un agua ($ 1,16), pagada como se diga. Devuelve la cuenta cobrada y la clave. */
async function vender(m: Montado, ctx: Contexto, pago: "EFECTIVO_USD" | "EFECTIVO_VES" = "EFECTIVO_USD", destinoSobra = "VUELTO", ahora = AHORA) {
  const c = valor(
    await m.l.app.cuentas.guardar(
      ctx,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(ahora).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: m.agua, taxCode: "GENERAL" }],
        },
      },
      ahora,
    ),
  );
  // $ 5,00 en efectivo llevan $ 0,15 de IGTF: se cobran $ 1,31 y sobran $ 3,69. Bs. 1.000,00 son $ 1,17: sobra un céntimo.
  const cmd =
    pago === "EFECTIVO_USD"
      ? { total: usd("131"), pagos: [{ method: "EFECTIVO_USD", amount: usd("500") }] }
      : { total: usd("116"), pagos: [{ method: "EFECTIVO_VES", amount: ves("100000") }], rateId: m.tasa };
  const clave = randomUUID();
  const r = valor(
    await m.l.app.cuentas.cobrar(ctx, { idempotencyKey: clave, accountId: c.id, version: c.version, lineIds: c.lines.map((x) => x.id), destinoSobra, cliente: FACTURA_DE_PRUEBA, ...cmd }, ahora),
  );
  return { cuenta: r.cuenta, clave };
}

/** Un conteo por billetes: billetes de 100 unidades menores y monedas de 1, que sumen lo dicho. */
const billetes = (minor: bigint, currency: "USD" | "VES") => [
  { denominacion: { minor: "100", currency }, cantidad: Number(minor / 100n) },
  { denominacion: { minor: "1", currency }, cantidad: Number(minor % 100n) },
];
const conteo = (turnoId: string, usdMinor: bigint, vesMinor: bigint) => ({
  turnoId,
  conteos: [
    { currency: "USD", billetes: billetes(usdMinor, "USD") },
    { currency: "VES", billetes: billetes(vesMinor, "VES") },
  ],
});

const arquear = async (m: Montado, ctx: Contexto, turnoId: string, usdMinor: bigint, vesMinor: bigint, ahora = AHORA): Promise<ArqueoDto> =>
  valor(await m.l.app.cortes.arquear(ctx, conteo(turnoId, usdMinor, vesMinor), ahora));

const corteZ = (turnoId: string, arqueoId: string, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  turnoId,
  arqueoId,
  cierre: "RELEVO",
  quedaEnGaveta: [usd("2000"), ves("150000")],
  ...extra,
});
const pinDe = (autorizadorId: string, pin: string, motivo = "Cierro el turno") => ({ autorizadorId, pin, motivo });

const asientosDe = (m: Montado, action: string) =>
  m.l.base.conTenant(m.l.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action }, orderBy: { occurredAt: "asc" } }));

let m: Montado;
let otro: Montado;

before(async () => {
  m = await montar("Cortes");
  otro = await montar("Cortes de otro", false);
});

after(async () => {
  await Promise.all([m.l.cerrar(), otro.l.cerrar()]);
});

describe("cómo va el turno: la vista y el corte X (F4-05)", () => {
  test("la vista sale del libro y es a ciegas: sin lo que debería haber en la gaveta", async () => {
    const { ctx, turno } = await caja(m, "Caja vista");
    await vender(m, ctx);
    await vender(m, ctx, "EFECTIVO_VES", "RESIDUO");
    const v = valor(await m.l.app.cortes.vista(ctx, undefined, AHORA));
    assert.equal(v.tipo, "VISTA");
    assert.equal(v.id, null);
    assert.equal(v.gaveta, null);
    assert.equal(v.turno.id, turno.id);
    assert.equal(v.ventas.cantidad, 2);
    // $ 1,31 + $ 1,16 (lo que entró en bolívares vale $ 1,16 de venta), y el IGTF del pago en divisas.
    assert.deepEqual(v.ventas.total, usd("247"));
    assert.deepEqual(v.ventas.igtf, usd("15"));
    const porMedio = Object.fromEntries(v.porMedio.map((p) => [p.methodCode, p.cobrado.minor]));
    assert.deepEqual(porMedio, { EFECTIVO_USD: "500", EFECTIVO_VES: "100000" });
    // El céntimo que quedó en caja es una excepción del turno.
    assert.deepEqual(
      v.excepciones.map((e) => [e.tipo, e.importe?.minor]),
      [["RESIDUO", "1"]],
    );
  });

  test("el corte X enseña la gaveta a supervisión: fondo más lo que entró menos el vuelto, y se guarda", async () => {
    const { ctx, turno } = await caja(m, "Caja X");
    await vender(m, ctx);
    await vender(m, ctx, "EFECTIVO_USD", "PROPINA");
    await vender(m, ctx, "EFECTIVO_VES", "RESIDUO");
    // La cajera saca su X sin lo que debería haber en la gaveta: el arqueo sigue siendo a ciegas.
    const suyo = valor(await m.l.app.cortes.corteX(ctx, {}, AHORA));
    assert.equal(suyo.tipo, "X");
    assert.equal(suyo.gaveta, null);
    const x = valor(await m.l.app.cortes.corteX(m.ctxSupervisor, { turnoId: turno.id }, AHORA));
    assert.ok(x.id);
    const gaveta = Object.fromEntries(x.gaveta!.map((g) => [g.currency, [g.fondo.minor, g.entradas.minor, g.salidas.minor, g.esperado.minor]]));
    // Dólares: $ 20 + $ 5 + $ 5 − $ 3,69 de vuelto (la propina se quedó en los $ 5). Bolívares: Bs. 1.500 + 1.000.
    assert.deepEqual(gaveta, { USD: ["2000", "1000", "369", "2631"], VES: ["150000", "100000", "0", "250000"] });
    // Se repite sin tocar el turno.
    const otraX = valor(await m.l.app.cortes.corteX(ctx, { turnoId: turno.id }, AHORA + MIN));
    assert.notEqual(otraX.id, x.id);
    assert.equal((await m.l.app.turnos.delEquipo(ctx))!.estado, "ABIERTO");
    assert.equal((await asientosDe(m, "turno.corte_x")).filter((a) => a.entityId === turno.id).length, 3);
  });

  test("la vista y el X de otro equipo son de quien ve la sucursal; la monitora no ve ninguno", async () => {
    const { turno } = await caja(m, "Caja ajena vista");
    const cajera2 = await contextoDe(m.l, await crearEquipo(m.l, "Caja de Carla"), m.cajera2, PIN.cajera2);
    const vista = await m.l.app.cortes.vista(cajera2, turno.id, AHORA);
    assert.equal(!vista.ok && vista.motivo, "NO_PERMITIDO");
    const x = await m.l.app.cortes.corteX(cajera2, { turnoId: turno.id }, AHORA);
    assert.equal(!x.ok && x.motivo, "NO_PERMITIDO");
    assert.equal(valor(await m.l.app.cortes.vista(m.ctxSupervisor, turno.id, AHORA)).turno.id, turno.id);
    const monitora = await m.l.app.cortes.vista(m.ctxMonitora, turno.id, AHORA);
    assert.equal(!monitora.ok && monitora.motivo, "NO_PERMITIDO");
    // Un equipo sin turno no tiene nada que enseñar.
    const sinTurno = await m.l.app.cortes.vista(cajera2, undefined, AHORA);
    assert.equal(!sinTurno.ok && sinTurno.motivo, "NO_DISPONIBLE");
  });

  test("las excepciones del turno: cortesía, reimpresión y anulación, con quién y quién autorizó", async () => {
    const { ctx } = await caja(m, "Caja excepciones");
    // Una cortesía en una cuenta que después se cobra.
    const c = valor(
      await m.l.app.cuentas.guardar(
        ctx,
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
            lines: [1, 2].map(() => ({ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: m.agua, taxCode: "GENERAL" })),
          },
        },
        AHORA,
      ),
    );
    const regalada = valor(
      await m.l.app.cuentas.cortesia(
        ctx,
        { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: c.lines[0]!.id, motivo: "INVITACION", quitar: false },
        pinDe(m.supervisor, PIN.supervisor, "Invitación"),
        AHORA,
      ),
    );
    const clave = randomUUID();
    valor(
      await m.l.app.cuentas.cobrar(
        ctx,
        { idempotencyKey: clave, accountId: c.id, version: regalada.version, lineIds: [c.lines[1]!.id], total: usd("131"), pagos: [{ method: "EFECTIVO_USD", amount: usd("500") }], destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA },
        AHORA,
      ),
    );
    const venta = valor(await m.l.app.ventas.delTurno(ctx)).ventas.find((v) => v.cobroKey === clave)!;
    valor(await m.l.app.ventas.imprimir(ctx, { saleId: venta.id }, AHORA));
    valor(await m.l.app.ventas.imprimir(ctx, { saleId: venta.id }, AHORA + MIN));
    // Y otra venta, anulada.
    const anulada = await vender(m, ctx);
    valor(
      await m.l.app.cuentas.anular(
        ctx,
        { idempotencyKey: randomUUID(), accountId: anulada.cuenta.id, cobroKey: anulada.clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
        pinDe(m.supervisor, PIN.supervisor, "Cobro repetido"),
        AHORA + 2 * MIN,
      ),
    );
    const x = valor(await m.l.app.cortes.corteX(m.ctxSupervisor, { turnoId: (await m.l.app.turnos.delEquipo(ctx))!.id }, AHORA + 3 * MIN));
    assert.deepEqual(
      x.excepciones.map((e) => [e.tipo, e.usuario, e.autorizadoPor]),
      [
        ["CORTESIA", "Marisol Prieto", "Luis Guerrero"],
        ["REIMPRESION", "Marisol Prieto", null],
        ["ANULACION", "Marisol Prieto", "Luis Guerrero"],
      ],
    );
    assert.equal(x.ventas.cantidad, 2);
    assert.equal(x.ventas.anuladas, 1);
    // Lo anulado no cuenta en la venta ni en la gaveta: solo la venta que quedó ($ 1,31).
    assert.deepEqual(x.ventas.total, usd("131"));
    assert.deepEqual(x.gaveta!.find((g) => g.currency === "USD")!.esperado, usd("2131"));
  });
});

describe("el arqueo a ciegas y el corte Z (F4-06, F4-07)", () => {
  test("la cajera cuenta, ve la diferencia después, y dentro del umbral firma su Z con su PIN", async () => {
    const { ctx, turno } = await caja(m, "Caja relevo");
    await vender(m, ctx);
    // Esperado: $ 21,31 y Bs. 1.500,00. Cuenta $ 21,31 y Bs. 1.495,00: faltan Bs. 5,00, que son $ 0,01.
    const a = await arquear(m, ctx, turno.id, 2131n, 149500n);
    assert.deepEqual(a.esperado, [usd("2131"), ves("150000")]);
    assert.deepEqual(a.diferencias, [usd("0"), ves("-500")]);
    assert.deepEqual(a.diferenciaEnDolares, usd("1"));
    assert.equal(a.firma, "CAJERA");
    assert.deepEqual(a.umbral, usd("100"));

    // Sin PIN, con uno malo o con el de otra persona, no: el Z lo firma quien cierra.
    // Deja el fondo en dólares y todos los bolívares que contó (no se deja lo que no hay).
    const cmd = corteZ(turno.id, a.id, { quedaEnGaveta: [usd("2000"), ves("149500")] });
    const sinPin = await m.l.app.cortes.corteZ(ctx, cmd, undefined, AHORA);
    assert.equal(!sinPin.ok && sinPin.motivo, "NO_PERMITIDO");
    const malo = await m.l.app.cortes.corteZ(ctx, cmd, pinDe(m.cajera, "0000"), AHORA);
    assert.equal(!malo.ok && malo.mensaje, "PIN incorrecto.");
    const ajeno = await m.l.app.cortes.corteZ(ctx, cmd, pinDe(m.supervisor, PIN.supervisor), AHORA);
    assert.equal(!ajeno.ok && ajeno.mensaje, "Confirma con tu propio PIN.");

    const z = valor(await m.l.app.cortes.corteZ(ctx, cmd, pinDe(m.cajera, PIN.cajera), AHORA));
    assert.equal(z.tipo, "Z");
    // El ticket del corte sale solo, en la impresora de recibos (B5-2, JORNADA C5).
    const ticket = valor(await m.l.app.impresion.trabajos(ctx, AHORA)).trabajos.find((t) => t.corteId === z.id);
    assert.equal(ticket?.tipo, "CORTE");
    assert.match(ticket!.vistaPrevia, /CORTE Z[\s\S]*Arqueo/);
    assert.equal(z.turno.estado, "CERRADO_Z");
    assert.equal(z.arqueo!.id, a.id);
    assert.deepEqual(z.cierre, {
      tipo: "RELEVO",
      firma: "CAJERA",
      firmadoPor: "Marisol Prieto",
      autorizadoPor: null,
      justificacion: null,
      // Deja el fondo y retira lo vendido (D-JOR).
      quedaEnGaveta: [usd("2000"), ves("149500")],
      retirado: [usd("131"), ves("0")],
      // La cerró ella, en su equipo (B3-15).
      cerradoDesde: null,
    });
    // La diferencia es una excepción del turno, dentro del umbral.
    const dif = z.excepciones.find((e) => e.tipo === "DIFERENCIA")!;
    assert.equal(dif.motivo, "Dentro del umbral");
    assert.deepEqual(dif.importe, usd("1"));

    // Un doble clic devuelve el mismo Z sin volver a pedir el PIN.
    assert.deepEqual(valor(await m.l.app.cortes.corteZ(ctx, cmd, undefined, AHORA + 5000)), z);
    assert.deepEqual(await m.l.app.cortes.ultimoZ(ctx), z);
    const [asiento] = (await asientosDe(m, "turno.corte_z")).filter((x) => x.entityId === turno.id);
    assert.equal((asiento!.after as { firma: string }).firma, "CAJERA");
  });

  test("después del Z nada toca el turno: ni se cobra, ni se cuenta, ni se corta, ni se anula lo suyo", async () => {
    const { ctx, turno } = await caja(m, "Caja sellada");
    const venta = await vender(m, ctx);
    const a = await arquear(m, ctx, turno.id, 2131n, 150000n);
    valor(await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, a.id), pinDe(m.cajera, PIN.cajera), AHORA));

    assert.equal(await m.l.app.turnos.delEquipo(ctx), null);
    const cuenta = valor(
      await m.l.app.cuentas.guardar(
        ctx,
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
            lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: m.agua, taxCode: "GENERAL" }],
          },
        },
        AHORA,
      ),
    );
    const cobro = await m.l.app.cuentas.cobrar(
      ctx,
      { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version, lineIds: cuenta.lines.map((l) => l.id), total: usd("131"), pagos: [{ method: "EFECTIVO_USD", amount: usd("500") }], destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA },
      AHORA,
    );
    assert.equal(cobro.ok, false);
    for (const r of [
      await m.l.app.cortes.arquear(ctx, conteo(turno.id, 0n, 0n), AHORA),
      await m.l.app.cortes.corteX(ctx, { turnoId: turno.id }, AHORA),
      await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, a.id), pinDe(m.cajera, PIN.cajera), AHORA),
    ]) {
      assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    }
    // La venta de un turno sellado no se anula (ni desde otro turno abierto): el Z ya la contó.
    const siguiente = await caja(m, "Caja sellada 2");
    const anular = await m.l.app.cuentas.anular(
      siguiente.ctx,
      { idempotencyKey: randomUUID(), accountId: venta.cuenta.id, cobroKey: venta.clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }] },
      pinDe(m.supervisor, PIN.supervisor, "Cobro repetido"),
      AHORA,
    );
    assert.equal(!anular.ok && anular.motivo, "CONFLICTO", JSON.stringify(anular));
  });

  test("por encima del umbral firma supervisión, con su 🔐 y una justificación", async () => {
    const { ctx, turno } = await caja(m, "Caja diferencia");
    await vender(m, ctx);
    // Sobran $ 0,50 y faltan Bs. 500,00 (= $ 0,58): $ 1,08, que pasa del umbral aunque se «compensen».
    const a = await arquear(m, ctx, turno.id, 2181n, 100000n);
    assert.deepEqual(a.diferencias, [usd("50"), ves("-50000")]);
    assert.deepEqual(a.diferenciaEnDolares, usd("108"));
    assert.equal(a.firma, "SUPERVISION");

    const queda = { quedaEnGaveta: [usd("2000"), ves("100000")] };
    const sinJustificar = await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, a.id, queda), pinDe(m.supervisor, PIN.supervisor), AHORA);
    assert.equal(!sinJustificar.ok && sinJustificar.problemas?.[0]?.path[0], "justificacion");
    const cmd = corteZ(turno.id, a.id, { ...queda, justificacion: "Se dio vuelto en dólares por falta de bolívares" });
    const conSuPin = await m.l.app.cortes.corteZ(ctx, cmd, pinDe(m.cajera, PIN.cajera), AHORA);
    assert.equal(!conSuPin.ok && conSuPin.motivo, "NO_PERMITIDO");
    const sinPin = await m.l.app.cortes.corteZ(ctx, cmd, undefined, AHORA);
    assert.equal(!sinPin.ok && sinPin.motivo, "NO_PERMITIDO");
    assert.deepEqual(await m.l.app.cuentas.autorizadores(ctx, "turno.corteZ"), [
      { id: m.admin, nombre: "Abigail Karam", rol: "ADMIN" },
      { id: m.supervisor, nombre: "Luis Guerrero", rol: "SUPERVISOR" },
    ]);

    const z = valor(await m.l.app.cortes.corteZ(ctx, cmd, pinDe(m.supervisor, PIN.supervisor, "Revisé la gaveta"), AHORA));
    assert.equal(z.cierre!.firma, "SUPERVISION");
    assert.equal(z.cierre!.firmadoPor, "Marisol Prieto");
    assert.equal(z.cierre!.autorizadoPor, "Luis Guerrero");
    assert.equal(z.cierre!.justificacion, "Se dio vuelto en dólares por falta de bolívares");
    const dif = z.excepciones.find((e) => e.tipo === "DIFERENCIA")!;
    assert.deepEqual([dif.motivo, dif.autorizadoPor, dif.importe], ["Se dio vuelto en dólares por falta de bolívares", "Luis Guerrero", usd("108")]);
    const [asiento] = (await asientosDe(m, "turno.corte_z")).filter((x) => x.entityId === turno.id);
    assert.equal(asiento!.authorizedBy, m.supervisor);
    assert.equal(asiento!.reason, "Se dio vuelto en dólares por falta de bolívares");
  });

  test("al anular no se devuelve en efectivo lo que la gaveta del turno no tiene", async () => {
    const { ctx } = await caja(m, "Caja con venta");
    const venta = await vender(m, ctx);
    // Supervisión anula desde otra caja, abierta sin fondo: el dinero saldría de una gaveta vacía.
    const vacia = await caja(m, "Caja vacía", m.supervisor, PIN.supervisor, { usd: "0", ves: "0" });
    const pedido = {
      idempotencyKey: randomUUID(),
      accountId: venta.cuenta.id,
      cobroKey: venta.clave,
      motivo: "ERROR_EN_COBRO",
      devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }],
    };
    const r = await m.l.app.cuentas.anular(vacia.ctx, pedido, pinDe(m.supervisor, PIN.supervisor, "Cobro repetido"), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /no hay dólares suficientes/);
    // Desde la caja que cobró, sí: ahí está el dinero.
    valor(await m.l.app.cuentas.anular(ctx, pedido, pinDe(m.supervisor, PIN.supervisor, "Cobro repetido"), AHORA));
  });

  test("el Z se niega si entró dinero después de contar, o si no es el último conteo", async () => {
    const { ctx, turno } = await caja(m, "Caja recuento");
    const primero = await arquear(m, ctx, turno.id, 2000n, 150000n);
    await vender(m, ctx);
    const tarde = await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, primero.id), pinDe(m.cajera, PIN.cajera), AHORA);
    assert.equal(!tarde.ok && tarde.motivo, "CONFLICTO");
    assert.match(!tarde.ok ? tarde.mensaje : "", /vuelve a contar/);

    const segundo = await arquear(m, ctx, turno.id, 2131n, 150000n, AHORA + MIN);
    const viejo = await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, primero.id), pinDe(m.cajera, PIN.cajera), AHORA + MIN);
    assert.equal(!viejo.ok && viejo.motivo, "CONFLICTO");
    // Lo que se deja no puede ser más de lo contado.
    const demasiado = await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, segundo.id, { quedaEnGaveta: [usd("5000")] }), pinDe(m.cajera, PIN.cajera), AHORA + MIN);
    assert.equal(!demasiado.ok && demasiado.motivo, "INVALIDO");
    const z = valor(await m.l.app.cortes.corteZ(ctx, corteZ(turno.id, segundo.id, { quedaEnGaveta: [] }), pinDe(m.cajera, PIN.cajera), AHORA + MIN));
    // Sin dejar nada, se retira todo lo contado.
    assert.deepEqual(z.cierre!.retirado, [usd("2131"), ves("150000")]);
  });

  test("un conteo mal escrito no se registra", async () => {
    const { ctx, turno } = await caja(m, "Caja conteo malo");
    for (const malo of [
      { turnoId: turno.id, conteos: conteo(turno.id, 0n, 0n).conteos.slice(0, 1) },
      { turnoId: turno.id, conteos: [conteo(turno.id, 0n, 0n).conteos[0], conteo(turno.id, 0n, 0n).conteos[0]] },
      { turnoId: turno.id, conteos: [{ currency: "USD", billetes: [{ denominacion: ves("100"), cantidad: 1 }] }, conteo(turno.id, 0n, 0n).conteos[1]] },
      { turnoId: turno.id, conteos: [{ currency: "USD", billetes: [{ denominacion: usd("100"), cantidad: -1 }] }, conteo(turno.id, 0n, 0n).conteos[1]] },
    ]) {
      const r = await m.l.app.cortes.arquear(ctx, malo, AHORA);
      assert.equal(!r.ok && r.motivo, "INVALIDO", JSON.stringify(malo));
    }
  });

  test("el turno de otro equipo lo cierra supervisión, no otra cajera", async () => {
    const { ctx, turno } = await caja(m, "Caja abandonada");
    await vender(m, ctx);
    const cajera2 = await contextoDe(m.l, await crearEquipo(m.l, "Caja de Carla 2"), m.cajera2, PIN.cajera2);
    const r = await m.l.app.cortes.arquear(cajera2, conteo(turno.id, 2131n, 150000n), AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = (await asientosDe(m, "turno.arqueo")).filter((a) => a.outcome === "NEGADO" && a.actorId === m.cajera2);
    assert.equal(negados.length, 1);

    const a = await arquear(m, m.ctxSupervisor, turno.id, 2131n, 150000n);
    assert.equal(a.contadoPor, "Luis Guerrero");
    const z = valor(await m.l.app.cortes.corteZ(m.ctxSupervisor, corteZ(turno.id, a.id), pinDe(m.supervisor, PIN.supervisor), AHORA));
    assert.equal(z.cierre!.firmadoPor, "Luis Guerrero");
    // Queda dicho desde qué equipo se cerró (B3-15): no es el suyo.
    assert.ok(z.cierre!.cerradoDesde && z.cierre!.cerradoDesde.length > 0, "dice el equipo de supervisión");
    assert.equal(z.turno.estado, "CERRADO_Z");
    // La cajera que dejó el equipo ya no tiene turno en él.
    assert.equal(await m.l.app.turnos.delEquipo(ctx), null);
  });

  test("otro local no ve ni cierra el turno de este", async () => {
    const { turno } = await caja(m, "Caja privada");
    const otroCtx = { ...otro.l.sistema, quien: m.ctxSupervisor.quien! };
    const r = await otro.l.app.cortes.vista(otroCtx, turno.id, AHORA);
    assert.equal(r.ok, false);
    const x = await otro.l.app.cortes.corteX(otro.ctxSupervisor, { turnoId: turno.id }, AHORA);
    assert.equal(!x.ok && x.motivo, "NO_DISPONIBLE");
  });
});

describe("la jornada (JORNADA §5) y las cuentas incobrables (D-JOR)", () => {
  let j: Montado;
  /** La caja que cierra la jornada; la abre la primera prueba. */
  let ctxPrincipal: Contexto | undefined;
  before(async () => {
    j = await montar("Jornada");
    valor(
      await j.l.app.tarifario.publicar(j.l.sistema, {
        packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("1000"), active: true }],
        policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
      }),
    );
  });
  after(async () => {
    await j.l.cerrar();
  });

  test("con otra caja abierta se cierra la caja aunque haya pendientes; la última es el cierre del día y no se deja con pendientes (B3-15)", async () => {
    const principal = await caja(j, "Caja principal");
    ctxPrincipal = principal.ctx;
    const segunda = await caja(j, "Caja taquilla", j.cajera2, PIN.cajera2);
    const familia = await familiaDePrueba(j.l, j.ctxMonitora, AHORA - 20 * MIN);
    const mostrador = await vender(j, principal.ctx);
    // Una venta por cobrar, sin cobrar.
    const porCobrar = valor(
      await j.l.app.cuentas.guardar(
        principal.ctx,
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
            lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: j.agua, taxCode: "GENERAL" }],
          },
        },
        AHORA,
      ),
    );

    const p = valor(await j.l.app.cortes.pendientes(principal.ctx, undefined, AHORA));
    assert.deepEqual(p.cuentas.map((c) => c.id).sort(), [familia.id, porCobrar.id].sort());
    assert.ok(!p.cuentas.some((c) => c.id === mostrador.cuenta.id));
    assert.equal(p.ninos.length, 1);
    assert.equal(p.ninos[0]!.accountId, familia.id);
    assert.deepEqual(p.huerfanas, []);
    assert.deepEqual(p.turnos.map((t) => t.id), [segunda.turno.id]);

    // La taquilla cierra primero, con la principal abierta: es el cierre de su caja, y lo abierto sigue para la otra. Lo
    // que pida la pantalla no cuenta (antes se elegía): aquí pide «el día» y el servidor cierra solo esta caja.
    const b = await arquear(j, segunda.ctx, segunda.turno.id, 2000n, 150000n);
    const deLaTaquilla = valor(await j.l.app.cortes.corteZ(segunda.ctx, corteZ(segunda.turno.id, b.id, { cierre: "JORNADA" }), pinDe(j.cajera2, PIN.cajera2), AHORA));
    assert.equal(deLaTaquilla.cierre?.tipo, "RELEVO");

    // La principal es la última: su cierre es el del día, y con pendientes no se deja, aunque la pantalla pida otra cosa.
    const a = await arquear(j, principal.ctx, principal.turno.id, 2131n, 150000n);
    const jornada = await j.l.app.cortes.corteZ(principal.ctx, corteZ(principal.turno.id, a.id, { cierre: "RELEVO" }), pinDe(j.cajera, PIN.cajera), AHORA);
    assert.equal(!jornada.ok && jornada.motivo, "CONFLICTO");
    assert.equal(!jornada.ok && jornada.mensaje, "La jornada no se cierra con pendientes: 2 cuentas pendientes y 1 niño en sala.");
    // Lo que no se dejó cerrar queda en la auditoría, con su porqué (v0.104.2).
    const negados = await j.l.base.conTenant(j.l.sistema.tenantId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "turno.corte_z", outcome: "NEGADO" }, orderBy: { occurredAt: "desc" }, take: 1 }),
    );
    assert.match(negados[0]?.reason ?? "", /La jornada no se cierra con pendientes/);
  });

  test("una cuenta que no se va a cobrar se marca incobrable con 🔐; con niños en sala, todavía no", async () => {
    const ctx = ctxPrincipal!;
    const p = valor(await j.l.app.cortes.pendientes(ctx, undefined, AHORA));
    const familia = p.cuentas.find((c) => c.kind === "FAMILIA")!;
    const mostrador = p.cuentas.find((c) => c.kind === "MOSTRADOR")!;
    const cmd = (c: { id: string; version?: number | undefined }, extra: Record<string, unknown> = {}) => ({
      idempotencyKey: randomUUID(),
      accountId: c.id,
      version: c.version!,
      motivo: "SE_FUE_SIN_PAGAR",
      ...extra,
    });

    // Con el niño dentro, primero su salida.
    const conNino = await j.l.app.cuentas.incobrable(ctx, cmd(familia), pinDe(j.supervisor, PIN.supervisor, "Se fue"), AHORA);
    assert.equal(!conNino.ok && conNino.motivo, "CONFLICTO");
    assert.match(!conNino.ok ? conNino.mensaje : "", /salida/);

    // La cajera necesita a supervisión; «Otro» pide explicarlo.
    const sin = await j.l.app.cuentas.incobrable(ctx, cmd(mostrador), undefined, AHORA);
    assert.equal(!sin.ok && sin.motivo, "NO_PERMITIDO");
    const otroSinDecir = await j.l.app.cuentas.incobrable(ctx, cmd(mostrador, { motivo: "OTRO" }), pinDe(j.supervisor, PIN.supervisor, "Se fue"), AHORA);
    assert.equal(!otroSinDecir.ok && otroSinDecir.motivo, "INVALIDO");
    const pedido = cmd(mostrador, { detalle: "Se fue sin pagar el agua" });
    const hecha = valor(await j.l.app.cuentas.incobrable(ctx, pedido, pinDe(j.supervisor, PIN.supervisor, "Se fue sin pagar"), AHORA));
    assert.equal(hecha.status, "INCOBRABLE");
    assert.equal(hecha.version, mostrador.version + 1);
    // Nada se borra: lo que se debía sigue en sus líneas. Un reintento devuelve lo mismo.
    assert.equal(hecha.lines.length, 1);
    assert.deepEqual(valor(await j.l.app.cuentas.incobrable(ctx, pedido, undefined, AHORA)), hecha);
    const otraVez = await j.l.app.cuentas.incobrable(ctx, cmd(hecha), pinDe(j.supervisor, PIN.supervisor, "Otra vez"), AHORA);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
    // Y ninguna pantalla la toca después.
    const tocada = await j.l.app.cuentas.guardar(ctx, { cuenta: { ...hecha, status: "POR_COBRAR" } }, AHORA);
    assert.equal(tocada.ok, false);

    // La familia sale (el paquete sigue por cobrar) y entonces sí se puede dar por incobrable.
    const sala = valor(await j.l.app.parque.sala(j.ctxMonitora, AHORA));
    const salida = valor(
      await j.l.app.parque.salir(
        j.ctxMonitora,
        { idempotencyKey: randomUUID(), sessionIds: sala.sessions.map((s) => s.id), disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } },
        AHORA,
      ),
    );
    assert.equal(salida.account.status, "POR_COBRAR");
    valor(await j.l.app.cuentas.incobrable(ctx, cmd(salida.account, { motivo: "NO_PUEDE_PAGAR" }), pinDe(j.supervisor, PIN.supervisor, "No puede pagar"), AHORA));
    const vacio = valor(await j.l.app.cortes.pendientes(ctx, undefined, AHORA));
    assert.deepEqual([vacio.cuentas, vacio.ninos, vacio.huerfanas, vacio.turnos], [[], [], [], []]);
  });

  test("sin pendientes, la jornada se cierra, y las incobrables salen en las excepciones del Z", async () => {
    const ctx = ctxPrincipal!;
    const turno = (await j.l.app.turnos.delEquipo(ctx))!;
    const a = await arquear(j, ctx, turno.id, 2131n, 150000n, AHORA + MIN);
    const z = valor(await j.l.app.cortes.corteZ(ctx, corteZ(turno.id, a.id, { cierre: "JORNADA" }), pinDe(j.cajera, PIN.cajera), AHORA + MIN));
    assert.equal(z.cierre!.tipo, "JORNADA");
    const incobrables = z.excepciones.filter((e) => e.tipo === "INCOBRABLE");
    assert.deepEqual(
      incobrables.map((e) => [e.usuario, e.autorizadoPor, e.importe?.minor]),
      [
        // Lo que se debía con su IVA: el agua a $ 1,16 y el paquete de $ 10,00 a $ 11,60.
        ["Marisol Prieto", "Luis Guerrero", "116"],
        ["Marisol Prieto", "Luis Guerrero", "1160"],
      ],
    );
    assert.match(incobrables[0]!.motivo, /Se fue sin pagar · Se fue sin pagar el agua/);
  });

  test("con todas las cajas cerradas no se dan cortesías ni descuentos; y el día cerrado no avisa al abrir (B3-15)", async () => {
    const ctx = ctxPrincipal!;
    const id = randomUUID();
    const cuenta = valor(
      await j.l.app.cuentas.guardar(
        ctx,
        {
          cuenta: {
            id,
            kind: "MOSTRADOR",
            family: "Mostrador",
            mode: "PREPAGO",
            status: "ABIERTA",
            openedAt: new Date(AHORA).toISOString(),
            sessionIds: [],
            closedSessionIds: [],
            lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: j.agua, taxCode: "GENERAL" }],
          },
        },
        AHORA + 2 * MIN,
      ),
    );
    const cortesia = await j.l.app.cuentas.cortesia(
      j.l.sistema,
      { idempotencyKey: randomUUID(), accountId: cuenta.id, version: cuenta.version, lineId: cuenta.lines[0]!.id, motivo: "INVITACION", quitar: false },
      undefined,
      AHORA + 2 * MIN,
    );
    assert.equal(!cortesia.ok && cortesia.motivo, "NO_DISPONIBLE", JSON.stringify(cortesia));
    assert.match(!cortesia.ok ? cortesia.mensaje : "", /todas las cajas cerradas/);
    const apertura = await j.l.app.cortes.comprobarApertura(ctx, AHORA + 3 * MIN);
    assert.equal(apertura.jornadaSinCerrar, null, "el último Z fue el del día");
  });

  test("el resumen del día sale del libro de todos los turnos, con sus diferencias; la cajera no lo ve", async () => {
    const r = valor(await j.l.app.cortes.resumenDelDia(j.ctxAdmin, AHORA + 2 * MIN));
    assert.equal(r.dia, HOY);
    assert.equal(r.turnos.length, 2);
    assert.ok(r.turnos.every((t) => t.turno.estado === "CERRADO_Z" && t.firma === "CAJERA"));
    assert.deepEqual(r.turnos.map((t) => t.diferenciaEnDolares), [usd("0"), usd("0")]);
    assert.equal(r.ventas.cantidad, 1);
    assert.deepEqual(r.ventas.total, usd("131"));
    assert.deepEqual(r.ventas.igtf, usd("15"));
    assert.deepEqual(
      r.porMedio.map((p) => [p.methodCode, p.cobrado.minor]),
      [["EFECTIVO_USD", "500"]],
    );
    assert.deepEqual(
      r.excepciones.map((e) => e.tipo),
      ["INCOBRABLE", "INCOBRABLE"],
    );
    const cajera = await j.l.app.cortes.resumenDelDia(ctxPrincipal!, AHORA);
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
  });
});

describe("al abrir el turno se comprueba lo necesario (JORNADA §3, A3)", () => {
  test("un local sin tasa, sin impuestos y sin tarifario lo lista, con qué bloquea y dónde se arregla", async () => {
    const r = await otro.l.app.cortes.comprobarApertura(otro.ctxAdmin, AHORA);
    assert.deepEqual(
      r.faltan.map((f) => [f.que, f.bloquea, f.enlace]),
      [
        ["TASA", "Cobrar en bolívares", "/panel/ajustes/tasas"],
        ["IMPUESTOS", "Cobrar", "/panel/ajustes/impuestos"],
        ["TARIFARIO", "La entrada al parque", "/panel/ajustes/tarifas"],
      ],
    );
  });

  test("con todo, no falta nada", async () => {
    valor(
      await m.l.app.tarifario.publicar(m.l.sistema, {
        packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("1000"), active: true }],
        policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
      }),
    );
    assert.deepEqual((await m.l.app.cortes.comprobarApertura(m.ctxAdmin, AHORA)).faltan, []);
  });
});

describe("los umbrales de la caja son del local (B4-4)", () => {
  /** Publica en el local de `u` los ajustes vigentes con `cambio` encima. */
  const ajustar = async (u: Montado, cambio: Record<string, unknown>) => {
    const v = await u.l.app.ajustes.leer(u.l.sistema);
    valor(await u.l.app.ajustes.publicar(u.l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, ...cambio } }));
  };

  test("el arqueo firma con el umbral del local, y el conteo guarda con cuál se decidió", async () => {
    const u = await montar("Cortes con umbral");
    try {
      await ajustar(u, { umbralArqueo: usd("25") });
      const { ctx, turno } = await caja(u, "Caja umbral");
      await vender(u, ctx);
      // Sobran $ 0,50: con $ 1,00 lo firmaría la cajera; con $ 0,25, supervisión.
      const a = await arquear(u, ctx, turno.id, 2181n, 150000n);
      assert.deepEqual(a.diferenciaEnDolares, usd("50"));
      assert.deepEqual(a.umbral, usd("25"));
      assert.equal(a.firma, "SUPERVISION");

      // Subir el umbral después no cambia lo que ya se contó.
      await ajustar(u, { umbralArqueo: usd("100") });
      const fila = await u.l.base.conTenant(u.l.sistema.tenantId, (tx) => tx.shiftCount.findUniqueOrThrow({ where: { id: a.id } }));
      assert.equal(fila.thresholdUsdMinor, 25n);
      assert.equal(fila.signer, "SUPERVISION");
      const otraVez = await arquear(u, ctx, turno.id, 2181n, 150000n);
      assert.deepEqual(otraVez.umbral, usd("100"));
      assert.equal(otraVez.firma, "CAJERA");
    } finally {
      await u.l.cerrar();
    }
  });

  test("lo que la caja puede quedarse de residuo es lo del local", async () => {
    const u = await montar("Cortes con residuo");
    try {
      const { ctx } = await caja(u, "Caja residuo");
      // Un agua ($ 1,16) pagada con Bs. 1.050,00 (≈ $ 1,23): sobran unos $ 0,07.
      const cobrar = async () => {
        const c = valor(
          await u.l.app.cuentas.guardar(
            ctx,
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
                lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: u.agua, taxCode: "GENERAL" }],
              },
            },
            AHORA,
          ),
        );
        return u.l.app.cuentas.cobrar(
          ctx,
          {
            idempotencyKey: randomUUID(),
            accountId: c.id,
            version: c.version,
            lineIds: c.lines.map((x) => x.id),
            destinoSobra: "RESIDUO", cliente: FACTURA_DE_PRUEBA,
            total: usd("116"),
            pagos: [{ method: "EFECTIVO_VES", amount: ves("105000") }],
            rateId: u.tasa,
          },
          AHORA,
        );
      };
      // De fábrica, $ 0,05: no cabe.
      const conCinco = await cobrar();
      assert.equal(!conCinco.ok && conCinco.problemas?.[0]?.path[0], "destinoSobra", JSON.stringify(conCinco));
      // El local lo sube a $ 0,10: cabe.
      await ajustar(u, { maxRetenido: usd("10") });
      valor(await cobrar());
    } finally {
      await u.l.cerrar();
    }
  });
});
