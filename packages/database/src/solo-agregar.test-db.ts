/**
 * Tablas de solo-agregar (regla 5) y FK compuestas entre tenants, sobre el tarifario del
 * parque, que es la primera tabla que las usa.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { abrirBase, type Base } from "./index.ts";
import { borrarTenantsDePrueba } from "./para-pruebas.ts";
import { errorDeBase, type MotivoDeBase } from "./errores.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const URL_MIGRADOR = process.env.L2_DB_TEST_MIGRATOR_URL!;

let app: Base;
let migrador: Base;
/** Cada local con dos cuentas: el libro solo cita cuentas de su local (B3-3). */
const A = { tenant: randomUUID(), sucursal: randomUUID(), doc: randomUUID(), doc2: randomUUID() };
const B = { tenant: randomUUID(), sucursal: randomUUID(), doc: randomUUID(), doc2: randomUUID() };
const contenido = { packages: [], policy: {} };
/** El catálogo de medios de las pruebas (B3-2): el libro solo cita medios del local. */
const MEDIOS = [
  { code: "EFECTIVO_USD", label: "Efectivo $", currency: "USD", givesChange: true, triggersIgtf: true, dataKind: null, active: true },
  { code: "PAGO_MOVIL", label: "Pago Móvil", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PAGO_MOVIL", active: true },
  { code: "PDV_DEBITO", label: "Punto débito", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PUNTO", active: true },
  { code: "PDV_CREDITO", label: "Punto crédito", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: "PUNTO", active: false },
  { code: "ZELLE", label: "Zelle", currency: "USD", givesChange: false, triggersIgtf: true, dataKind: "ZELLE", active: true },
];
/** Algo con la forma del cifrado de @l2/application (`v1.<iv>.<etiqueta>.<datos>`). */
const CIFRADO = `v1.${"a".repeat(16)}.${"b".repeat(22)}.cGFnbw`;

before(async () => {
  app = await abrirBase(URL_APP);
  migrador = await abrirBase(URL_MIGRADOR);
  for (const t of [A, B]) {
    await app.conTenant(t.tenant, async (tx) => {
      await tx.tenant.create({ data: { id: t.tenant, name: `prueba ${t.tenant}` } });
      await tx.branch.create({ data: { id: t.sucursal, tenantId: t.tenant, name: "Principal" } });
      await tx.parkTariffVersion.create({
        data: { tenantId: t.tenant, branchId: t.sucursal, version: 1, content: contenido },
      });
      await tx.paymentMethod.createMany({
        data: MEDIOS.map((m, position) => ({ tenantId: t.tenant, ...m, position, createdByName: "Preparación de la prueba" })),
      });
      await tx.account.createMany({
        data: [t.doc, t.doc2].map((id, i) => ({ id, tenantId: t.tenant, branchId: t.sucursal, kind: "MOSTRADOR", orderNumber: i + 1, openedAt: new Date(), openedByName: "Preparación de la prueba" })),
      });
    });
  }
});

after(async () => {
  await borrarTenantsDePrueba(URL_APP, [A.tenant, B.tenant]);
  await Promise.all([app.cerrar(), migrador.cerrar()]);
});

/** Valida que la promesa falle por `motivo` (el SQLSTATE, no el texto de Prisma). */
const por = (motivo: MotivoDeBase) => (e: unknown) => {
  assert.equal(errorDeBase(e)?.motivo, motivo, String(e));
  return true;
};
const SOLO_AGREGAR = por("SOLO_AGREGAR");

test("una versión publicada no se edita", async () => {
  await assert.rejects(
    app.conTenant(A.tenant, (tx) => tx.parkTariffVersion.updateMany({ where: {}, data: { content: { otro: 1 } } })),
    SOLO_AGREGAR,
  );
});

test("una versión publicada no se borra", async () => {
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkTariffVersion.deleteMany({})), SOLO_AGREGAR);
});

test("el rechazo dice qué tabla y qué operación", async () => {
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkTariffVersion.deleteMany({})), (e: unknown) => {
    assert.match(errorDeBase(e)?.detalle ?? "", /park_tariff_version solo admite filas nuevas: DELETE/);
    return true;
  });
});

test("ni el dueño de la tabla puede reescribirla", async () => {
  await assert.rejects(
    migrador.conTenant(A.tenant, (tx) => tx.parkTariffVersion.deleteMany({})),
    SOLO_AGREGAR,
  );
  await assert.rejects(
    migrador.conTenant(A.tenant, (tx) => tx.$executeRawUnsafe("TRUNCATE park_tariff_version")),
    SOLO_AGREGAR,
  );
});

test("publicar otra versión sí se puede", async () => {
  const v2 = await app.conTenant(A.tenant, (tx) =>
    tx.parkTariffVersion.create({ data: { tenantId: A.tenant, branchId: A.sucursal, version: 2, content: contenido } }),
  );
  assert.equal(v2.version, 2);
});

test("la misma versión no se publica dos veces", async () => {
  await assert.rejects(
    app.conTenant(B.tenant, (tx) =>
      tx.parkTariffVersion.create({ data: { tenantId: B.tenant, branchId: B.sucursal, version: 1, content: contenido } }),
    ),
    por("DUPLICADO"),
  );
});

test("la versión es positiva", async () => {
  await assert.rejects(
    app.conTenant(B.tenant, (tx) =>
      tx.parkTariffVersion.create({ data: { tenantId: B.tenant, branchId: B.sucursal, version: 0, content: contenido } }),
    ),
    por("RESTRICCION"),
  );
});

test("A no puede publicar en la sucursal de B aunque firme con su propio tenant", async () => {
  // Las comprobaciones de FK no pasan por la RLS: sin la FK compuesta (tenant_id, branch_id)
  // esta fila entraría citando una sucursal ajena.
  await assert.rejects(
    app.conTenant(A.tenant, (tx) =>
      tx.parkTariffVersion.create({ data: { tenantId: A.tenant, branchId: B.sucursal, version: 9, content: contenido } }),
    ),
    por("REFERENCIA_INVALIDA"),
  );
});

/* ── tasas de cambio (B2-1, F3-03): la tasa y su confirmación tampoco se reescriben ── */

const tasa = (tenantId: string, value: string, minuto: number) => ({
  tenantId,
  pair: "USD/VES",
  value,
  source: "MANUAL",
  effectiveDate: new Date("2026-09-18T00:00:00.000Z"),
  capturedAt: new Date(Date.UTC(2026, 8, 18, 12, minuto)),
  capturedByName: "Prueba",
});

test("una tasa y su confirmación no se editan ni se borran", async () => {
  const t = await app.conTenant(A.tenant, async (tx) => {
    const r = await tx.exchangeRate.create({ data: tasa(A.tenant, "228.41", 0) });
    await tx.exchangeRateConfirmation.create({
      data: { tenantId: A.tenant, rateId: r.id, confirmedByName: "Prueba", doubleChecked: true },
    });
    return r;
  });
  await assert.rejects(
    app.conTenant(A.tenant, (tx) => tx.exchangeRate.update({ where: { id: t.id }, data: { value: "300.00" } })),
    SOLO_AGREGAR,
  );
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.exchangeRateConfirmation.deleteMany({})), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.exchangeRate.deleteMany({})), SOLO_AGREGAR);
});

test("la base rechaza una tasa cero o con coma, aunque el código se equivoque (I-03)", async () => {
  for (const [i, value] of ["0", "0.000", "228,41", "-5", "2.2841e2"].entries()) {
    await assert.rejects(
      app.conTenant(A.tenant, (tx) => tx.exchangeRate.create({ data: tasa(A.tenant, value, 10 + i) })),
      por("RESTRICCION"),
      value,
    );
  }
});

test("A no confirma una tasa de B ni la confirma dos veces", async () => {
  const deB = await app.conTenant(B.tenant, (tx) => tx.exchangeRate.create({ data: tasa(B.tenant, "228.41", 0) }));
  await assert.rejects(
    app.conTenant(A.tenant, (tx) =>
      tx.exchangeRateConfirmation.create({
        data: { tenantId: A.tenant, rateId: deB.id, confirmedByName: "Prueba", doubleChecked: false },
      }),
    ),
    por("REFERENCIA_INVALIDA"),
  );
  const confirmar = () =>
    app.conTenant(B.tenant, (tx) =>
      tx.exchangeRateConfirmation.create({
        data: { tenantId: B.tenant, rateId: deB.id, confirmedByName: "Prueba", doubleChecked: false },
      }),
    );
  await confirmar();
  await assert.rejects(confirmar(), por("DUPLICADO"));
});

test("una tasa retenida la trajo un proceso, y con un motivo de la lista (ADR-019)", async () => {
  const persona = randomUUID();
  for (const [i, data] of [
    { ...tasa(A.tenant, "230.00", 30), heldBack: "SALTO", capturedBy: persona },
    { ...tasa(A.tenant, "230.00", 31), heldBack: "PORQUE_SI" },
  ].entries()) {
    await assert.rejects(app.conTenant(A.tenant, (tx) => tx.exchangeRate.create({ data })), por("RESTRICCION"), String(i));
  }
  await app.conTenant(A.tenant, (tx) => tx.exchangeRate.create({ data: { ...tasa(A.tenant, "230.00", 32), heldBack: "SOLO_TERCERO" } }));
});

test("una confirmación automática no tiene persona, autorizador ni doble tecleo (ADR-019)", async () => {
  const persona = randomUUID();
  for (const [i, extra] of [{ confirmedBy: persona }, { doubleChecked: true }, { authorizedBy: persona, authorizedByName: "Otra" }].entries()) {
    const t = await app.conTenant(A.tenant, (tx) => tx.exchangeRate.create({ data: tasa(A.tenant, "231.00", 40 + i) }));
    await assert.rejects(
      app.conTenant(A.tenant, (tx) =>
        tx.exchangeRateConfirmation.create({
          data: { tenantId: A.tenant, rateId: t.id, confirmedByName: "Aplicada automáticamente (BCV)", doubleChecked: false, automatic: true, ...extra },
        }),
      ),
      por("RESTRICCION"),
      JSON.stringify(extra),
    );
  }
});

/** Una alícuota programada de `tenant` (B2-2), `n` segundos después de una hora fija. */
const alicuota = (tenant: string, n: number, extra: Partial<{ tax: string; code: string | null; basisPoints: number; retraso: number }> = {}) => {
  const programada = new Date(Date.UTC(2026, 8, 27, 14, 0, n));
  return {
    tenantId: tenant,
    tax: extra.tax ?? "IVA",
    code: extra.code === undefined ? "GENERAL" : extra.code,
    basisPoints: extra.basisPoints ?? 1600,
    scheduledAt: programada,
    effectiveFrom: new Date(programada.getTime() + (extra.retraso ?? 0)),
    scheduledByName: "Semilla",
  };
};

test("una alícuota programada no se edita ni se borra (B2-2)", async () => {
  const f = await app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 0) }));
  await assert.rejects(
    app.conTenant(A.tenant, (tx) => tx.taxRate.update({ where: { id: f.id }, data: { basisPoints: 1500 } })),
    SOLO_AGREGAR,
  );
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.taxRate.deleteMany({})), SOLO_AGREGAR);
});

test("la base no deja programar hacia atrás, ni lo exento, ni un IGTF con trato (F3-06)", async () => {
  const malas = [
    alicuota(A.tenant, 10, { retraso: -1 }),
    alicuota(A.tenant, 11, { code: "EXENTA", basisPoints: 0 }),
    alicuota(A.tenant, 12, { code: null }),
    alicuota(A.tenant, 13, { tax: "IGTF", code: "GENERAL", basisPoints: 300 }),
    alicuota(A.tenant, 14, { tax: "IGTF", code: null, basisPoints: 10_000 }),
    alicuota(A.tenant, 15, { basisPoints: 10_001 }),
    alicuota(A.tenant, 16, { tax: "ISLR" }),
  ];
  for (const [i, data] of malas.entries()) {
    await assert.rejects(app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data })), por("RESTRICCION"), String(i));
  }
  // Para el futuro y el IGTF sin trato, sí.
  await app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 20, { retraso: 86_400_000 }) }));
  await app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 21, { tax: "IGTF", code: null, basisPoints: 300 }) }));
});

test("dos programaciones del mismo impuesto en el mismo instante no se ordenan: la segunda se rechaza", async () => {
  await app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 30, { tax: "IGTF", code: null, basisPoints: 300 }) }));
  await assert.rejects(
    app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 30, { tax: "IGTF", code: null, basisPoints: 200 }) })),
    por("DUPLICADO"),
  );
  // El general y el reducido sí pueden programarse en el mismo instante.
  await app.conTenant(A.tenant, (tx) => tx.taxRate.create({ data: alicuota(A.tenant, 30, { code: "REDUCIDA", basisPoints: 800 }) }));
});

/* ── El libro de pagos (B2-3, §5.5, I-09, I-11) ─────────────────────────────── */

let lineaLibre = 0;
let equiposCreados = 0;

/** Un turno abierto de `t`, con su equipo y su persona (el libro exige turno desde B3-1). */
async function abrirTurno(t: { tenant: string; sucursal: string }, extra: Record<string, unknown> = {}) {
  return app.conTenant(t.tenant, async (tx) => {
    const persona = await tx.staffUser.create({ data: { tenantId: t.tenant, fullName: "Marisol Prieto", role: "CAJERO" } });
    const equipo = await tx.device.create({
      data: { tenantId: t.tenant, branchId: t.sucursal, label: `Caja ${++equiposCreados}`, status: "APROBADO", secretHash: randomUUID() },
    });
    return tx.cashShift.create({
      data: {
        tenantId: t.tenant,
        branchId: t.sucursal,
        deviceId: equipo.id,
        pointLabel: equipo.label,
        businessDate: new Date("2026-09-27T00:00:00.000Z"),
        status: "ABIERTO",
        openedBy: persona.id,
        openedByName: persona.fullName,
        ...extra,
      },
    });
  });
}
const turnos = new Map<string, string>();
const turnoDe = async (t: { tenant: string; sucursal: string }) => {
  if (!turnos.has(t.tenant)) turnos.set(t.tenant, (await abrirTurno(t)).id);
  return turnos.get(t.tenant)!;
};
/** Un asiento de `t` en efectivo en dólares; `extra` cambia lo que haga falta. */
const asiento = (t: { tenant: string; sucursal: string; doc: string }, extra: Record<string, unknown> = {}) => ({
  tenantId: t.tenant,
  branchId: t.sucursal,
  documentId: t.doc,
  operationKey: randomUUID(),
  line: lineaLibre++ % 20,
  kind: "COBRO",
  method: "EFECTIVO_USD",
  currency: "USD",
  amountMinor: 580n,
  igtfMinor: 17n,
  businessDate: new Date("2026-09-27T00:00:00.000Z"),
  recordedByName: "Marisol Prieto",
  ...extra,
});
const crearAsiento = async (t: { tenant: string; sucursal: string; doc: string }, extra: Record<string, unknown> = {}) => {
  const shiftId = await turnoDe(t);
  return app.conTenant(t.tenant, (tx) => tx.payment.create({ data: { shiftId, ...asiento(t, extra) } }));
};

test("un asiento del libro no se edita ni se borra (I-09)", async () => {
  const p = await crearAsiento(A);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.payment.update({ where: { id: p.id }, data: { amountMinor: 1n } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.payment.deleteMany({})), SOLO_AGREGAR);
});

test("la misma operación no se asienta dos veces (I-11)", async () => {
  const clave = randomUUID();
  await crearAsiento(A, { operationKey: clave, line: 0 });
  await assert.rejects(crearAsiento(A, { operationKey: clave, line: 0 }), por("DUPLICADO"));
});

test("la base rechaza un asiento mal formado aunque el código se equivoque", async () => {
  const tasaA = await app.conTenant(A.tenant, (tx) => tx.exchangeRate.create({ data: tasa(A.tenant, "855.6625", 50) }));
  const malos: Record<string, unknown>[] = [
    { amountMinor: 0n }, // un original es positivo
    { amountMinor: -580n, igtfMinor: -17n }, // negativo sin ser reversión
    { method: "PAGO_MOVIL", currency: "VES", amountMinor: 427831n, igtfMinor: 0n, referenceCipher: CIFRADO }, // bolívares sin tasa
    { rateId: tasaA.id, rateValue: "855.6625" }, // dólares con tasa
    { method: "PAGO_MOVIL", currency: "VES", rateId: tasaA.id, rateValue: null, igtfMinor: 0n, referenceCipher: CIFRADO }, // tasa sin su valor
    { kind: "VUELTO", igtfMinor: 17n }, // IGTF en un vuelto
    { kind: "VUELTO", method: "ZELLE", igtfMinor: 0n }, // vuelto que no es efectivo
    { reason: "ERROR_EN_COBRO" }, // motivo en un original
    { kind: "REGALO" },
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(crearAsiento(A, extra), por("RESTRICCION"), String(i));
  }
});

test("una reversión es el original con el signo contrario, una sola vez (F3-10)", async () => {
  const o = await crearAsiento(A);
  const rev = { reversesId: o.id, reason: "ERROR_EN_COBRO", amountMinor: -580n, igtfMinor: -17n };
  // Otro importe, otro medio u otro documento: no es una reversión.
  for (const extra of [{ amountMinor: -500n }, { method: "ZELLE" }, { documentId: A.doc2 }, { igtfMinor: 0n }]) {
    await assert.rejects(crearAsiento(A, { ...rev, ...extra }), por("RESTRICCION"), JSON.stringify(extra, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  }
  // «Otro» sin explicar, tampoco.
  await assert.rejects(crearAsiento(A, { ...rev, reason: "OTRO" }), por("RESTRICCION"));
  const r = await crearAsiento(A, rev);
  // Dos veces, no; y una reversión no se revierte.
  await assert.rejects(crearAsiento(A, rev), por("DUPLICADO"));
  await assert.rejects(crearAsiento(A, { reversesId: r.id, reason: "ERROR_EN_COBRO", amountMinor: 580n, igtfMinor: 17n }), por("RESTRICCION"));
});

test("A no cita la tasa de B ni revierte un asiento de B", async () => {
  const tasaB = await app.conTenant(B.tenant, (tx) => tx.exchangeRate.create({ data: tasa(B.tenant, "855.6625", 51) }));
  await assert.rejects(
    crearAsiento(A, { method: "PAGO_MOVIL", currency: "VES", amountMinor: 427831n, igtfMinor: 0n, rateId: tasaB.id, rateValue: "855.6625", referenceCipher: CIFRADO }),
    por("REFERENCIA_INVALIDA"),
  );
  const deB = await crearAsiento(B);
  await assert.rejects(crearAsiento(A, { reversesId: deB.id, reason: "ERROR_EN_COBRO", amountMinor: -580n, igtfMinor: -17n }), por("REFERENCIA_INVALIDA"));
});

/* ── El turno de caja (B3-1, I-06, I-14) ────────────────────────────────────── */

test("un equipo no tiene dos turnos sin corte Z (I-06)", async () => {
  const t = await abrirTurno(A);
  await assert.rejects(
    app.conTenant(A.tenant, (tx) =>
      tx.cashShift.create({
        data: { tenantId: A.tenant, branchId: A.sucursal, deviceId: t.deviceId, pointLabel: t.pointLabel, businessDate: t.businessDate, status: "ABIERTO", openedBy: t.openedBy, openedByName: t.openedByName },
      }),
    ),
    por("DUPLICADO"),
  );
});

test("un turno no se borra, no reescribe su apertura y no retrocede (F4-06)", async () => {
  const t = await abrirTurno(A);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShift.delete({ where: { id: t.id } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { businessDate: new Date("2026-01-01") } })), SOLO_AGREGAR);
  await app.conTenant(A.tenant, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { status: "EN_CIERRE" } }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { status: "ABIERTO" } })), SOLO_AGREGAR);
  // El corte Z sin firma no se acepta; con firma, sí, y ya no se reabre.
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { status: "CERRADO_Z" } })), por("RESTRICCION"));
  await app.conTenant(A.tenant, (tx) =>
    tx.cashShift.update({ where: { id: t.id }, data: { status: "CERRADO_Z", closedAt: new Date(), closedBy: t.openedBy, closedByName: t.openedByName } }),
  );
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { status: "ABIERTO", closedAt: null, closedBy: null, closedByName: null } })), SOLO_AGREGAR);
});

test("no se cobra en un turno con corte Z (I-14)", async () => {
  const t = await abrirTurno(A);
  await app.conTenant(A.tenant, (tx) =>
    tx.cashShift.update({ where: { id: t.id }, data: { status: "CERRADO_Z", closedAt: new Date(), closedBy: t.openedBy, closedByName: t.openedByName } }),
  );
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.payment.create({ data: { shiftId: t.id, ...asiento(A) } })), por("RESTRICCION"));
});

test("el fondo inicial es por moneda de la gaveta, no negativo, y no se edita", async () => {
  const t = await abrirTurno(A);
  const fondo = (currency: string, amountMinor: bigint) => app.conTenant(A.tenant, (tx) => tx.cashShiftFloat.create({ data: { tenantId: A.tenant, shiftId: t.id, currency, amountMinor } }));
  const f = await fondo("USD", 2000n);
  await fondo("VES", 0n);
  await assert.rejects(fondo("USDT", 100n), por("RESTRICCION"));
  await assert.rejects(fondo("USD", 100n), por("DUPLICADO"));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShiftFloat.update({ where: { id: f.id }, data: { amountMinor: 1n } })), SOLO_AGREGAR);
  const t2 = await abrirTurno(A);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.cashShiftFloat.create({ data: { tenantId: A.tenant, shiftId: t2.id, currency: "VES", amountMinor: -1n } })), por("RESTRICCION"));
});

/* ── Día de negocio y feriados (B2-4, ADR-009, D-FER) ───────────────────────── */

test("un asiento lleva el día de negocio de su turno, no otro (I-13)", async () => {
  await assert.rejects(crearAsiento(A, { businessDate: new Date("2026-09-28T00:00:00.000Z") }), por("RESTRICCION"));
  const p = await crearAsiento(A);
  assert.equal(p.businessDate.toISOString().slice(0, 10), "2026-09-27");
});

const feriado = (t: string, day: string, name = "Resistencia Indígena") =>
  app.conTenant(t, (tx) => tx.bankHoliday.create({ data: { tenantId: t, day: new Date(`${day}T00:00:00.000Z`), name, createdByName: "Abigail Karam" } }));

test("un feriado es un día entre semana, uno por día", async () => {
  await assert.rejects(feriado(A.tenant, "2026-10-17"), por("RESTRICCION")); // sábado
  await feriado(A.tenant, "2026-10-12");
  await assert.rejects(feriado(A.tenant, "2026-10-12", "Otro nombre"), por("DUPLICADO"));
  // Otro tenant tiene su propio calendario.
  await feriado(B.tenant, "2026-10-12");
});

test("un feriado no se borra ni se reescribe: se retira una vez, y después se puede volver a registrar", async () => {
  const f = await feriado(A.tenant, "2026-12-24", "Víspera de Navidad");
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.bankHoliday.delete({ where: { id: f.id } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.bankHoliday.update({ where: { id: f.id }, data: { name: "Otro" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.bankHoliday.update({ where: { id: f.id }, data: { retiredAt: new Date() } })), por("RESTRICCION"));
  const retiro = { retiredAt: new Date(), retiredByName: "Abigail Karam" };
  await app.conTenant(A.tenant, (tx) => tx.bankHoliday.update({ where: { id: f.id }, data: retiro }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.bankHoliday.update({ where: { id: f.id }, data: { retiredByName: "Otra persona" } })), SOLO_AGREGAR);
  await feriado(A.tenant, "2026-12-24", "Víspera de Navidad");
});

/* ── Medios de pago, terminales y datos del local (B3-2, F4-02, F4-04, §7.6) ─── */

const terminal = (t: { tenant: string; sucursal: string }, name: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) => tx.posTerminal.create({ data: { tenantId: t.tenant, branchId: t.sucursal, name, bank: "Banesco", createdByName: "Abigail Karam", ...extra } }));
const tasaDe = async (t: { tenant: string }, minuto: number) =>
  (await app.conTenant(t.tenant, (tx) => tx.exchangeRate.create({ data: tasa(t.tenant, "855.6625", minuto) }))).id;

test("el medio de un asiento es del catálogo del local, con su moneda", async () => {
  // Un medio que el local no tiene, o el de otro local, no se cita.
  await assert.rejects(crearAsiento(A, { method: "BIOPAGO" }), por("REFERENCIA_INVALIDA"));
  await app.conTenant(B.tenant, (tx) =>
    tx.paymentMethod.create({ data: { tenantId: B.tenant, code: "SOLO_DE_B", label: "Solo de B", currency: "USD", givesChange: false, triggersIgtf: false, dataKind: null, active: true, position: 9, createdByName: "Abigail Karam" } }),
  );
  await assert.rejects(crearAsiento(A, { method: "SOLO_DE_B" }), por("REFERENCIA_INVALIDA"));
  // Un Zelle en bolívares no existe: el Zelle del local es en dólares.
  const tasaA = await tasaDe(A, 52);
  await assert.rejects(crearAsiento(A, { method: "ZELLE", currency: "VES", rateId: tasaA, rateValue: "855.6625", igtfMinor: 0n, referenceCipher: CIFRADO }), por("REFERENCIA_INVALIDA"));
});

test("un cobro lleva los datos que su medio pide, cifrados, y solo un cobro los lleva (F4-04)", async () => {
  const tasaA = await tasaDe(A, 53);
  const movil = { method: "PAGO_MOVIL", currency: "VES", amountMinor: 427831n, igtfMinor: 0n, rateId: tasaA, rateValue: "855.6625" };
  const malos: Record<string, unknown>[] = [
    movil, // un Pago Móvil sin referencia no se concilia
    { referenceCipher: CIFRADO }, // el efectivo no trae referencia
    { ...movil, referenceCipher: "0987654321" }, // en claro, no
    { ...movil, referenceCipher: CIFRADO, referenceDigest: "no-es-una-huella" },
    { kind: "VUELTO", igtfMinor: 0n, referenceCipher: CIFRADO }, // el vuelto no viene de un banco
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(crearAsiento(A, extra), por("RESTRICCION"), String(i));
  }
  const p = await crearAsiento(A, { ...movil, referenceCipher: CIFRADO, referenceDigest: "f".repeat(64) });
  assert.equal(p.referenceCipher, CIFRADO);
  // Su reversión no repite la referencia.
  await assert.rejects(crearAsiento(A, { ...movil, amountMinor: -427831n, reversesId: p.id, reason: "ERROR_EN_COBRO", referenceCipher: CIFRADO }), por("RESTRICCION"));
  await crearAsiento(A, { ...movil, amountMinor: -427831n, reversesId: p.id, reason: "ERROR_EN_COBRO" });
});

test("un medio apagado no cobra; el punto de venta dice su terminal vigente, de su sucursal", async () => {
  const tasaA = await tasaDe(A, 54);
  const punto = { method: "PDV_DEBITO", currency: "VES", amountMinor: 50000n, igtfMinor: 0n, rateId: tasaA, rateValue: "855.6625", referenceCipher: CIFRADO };
  const vigente = await terminal(A, "Punto Banesco A");
  const retirado = await terminal(A, "Punto Viejo A");
  await app.conTenant(A.tenant, (tx) => tx.posTerminal.update({ where: { id: retirado.id }, data: { retiredAt: new Date(), retiredByName: "Abigail Karam" } }));
  const deB = await terminal(B, "Punto Banesco B");
  await assert.rejects(crearAsiento(A, { ...punto, method: "PDV_CREDITO", terminalId: vigente.id }), por("RESTRICCION")); // apagado
  await assert.rejects(crearAsiento(A, punto), por("RESTRICCION")); // sin terminal
  await assert.rejects(crearAsiento(A, { ...punto, terminalId: retirado.id }), por("RESTRICCION"));
  await assert.rejects(crearAsiento(A, { ...punto, terminalId: deB.id }), por("REFERENCIA_INVALIDA"));
  await assert.rejects(crearAsiento(A, { method: "PAGO_MOVIL", currency: "VES", amountMinor: 50000n, igtfMinor: 0n, rateId: tasaA, rateValue: "855.6625", referenceCipher: CIFRADO, terminalId: vigente.id }), por("RESTRICCION"));
  await crearAsiento(A, { ...punto, terminalId: vigente.id });
});

test("un medio no se borra ni se redefine: se enciende, se apaga y se renombra", async () => {
  const m = await app.conTenant(A.tenant, (tx) => tx.paymentMethod.findUniqueOrThrow({ where: { tenantId_code: { tenantId: A.tenant, code: "ZELLE" } } }));
  await app.conTenant(A.tenant, (tx) => tx.paymentMethod.update({ where: { id: m.id }, data: { active: false, label: "Zelle local" } }));
  for (const data of [{ currency: "USDT" }, { code: "ZELLE_2" }, { dataKind: null }, { givesChange: true }]) {
    await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paymentMethod.update({ where: { id: m.id }, data })), SOLO_AGREGAR, JSON.stringify(data));
  }
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paymentMethod.delete({ where: { id: m.id } })), SOLO_AGREGAR);
  // Vaciarlo tampoco: lo niega la FK del libro antes que su disparador.
  await assert.rejects(migrador.conTenant(A.tenant, (tx) => tx.$executeRawUnsafe("TRUNCATE payment_method")));
  await app.conTenant(A.tenant, (tx) => tx.paymentMethod.update({ where: { id: m.id }, data: { active: true, label: "Zelle" } }));
});

test("un medio mal definido no entra, aunque el código se equivoque", async () => {
  const medio = { tenantId: A.tenant, label: "Nuevo", currency: "VES", givesChange: false, triggersIgtf: false, dataKind: null, active: false, position: 20, createdByName: "Abigail Karam" };
  const malos: Record<string, unknown>[] = [
    { code: "biopago" }, // el código es estable y en mayúsculas
    { code: "USDT_VUELTO", currency: "USDT", givesChange: true }, // en la gaveta no hay USDT
    { code: "EFECTIVO_REF", givesChange: true, dataKind: "PAGO_MOVIL" }, // el efectivo no pide referencia
    { code: "RARO", dataKind: "CHEQUE" },
    { code: "EUROS", currency: "EUR" },
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paymentMethod.create({ data: { ...medio, ...extra } as never })), por("RESTRICCION"), String(i));
  }
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.paymentMethod.create({ data: { ...medio, code: "ZELLE" } })), por("DUPLICADO"));
});

test("un terminal no se borra ni se reescribe: se retira una vez; dos vigentes no se llaman igual", async () => {
  const t = await terminal(A, "Punto Mercantil A");
  await assert.rejects(terminal(A, "punto mercantil a "), por("DUPLICADO"));
  await terminal(B, "Punto Mercantil A"); // otro local, otro nombre
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.posTerminal.update({ where: { id: t.id }, data: { name: "Otro" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.posTerminal.delete({ where: { id: t.id } })), SOLO_AGREGAR);
  await app.conTenant(A.tenant, (tx) => tx.posTerminal.update({ where: { id: t.id }, data: { retiredAt: new Date(), retiredByName: "Abigail Karam" } }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.posTerminal.update({ where: { id: t.id }, data: { retiredByName: "Otra persona" } })), SOLO_AGREGAR);
  // Retirado, el nombre queda libre.
  await terminal(A, "Punto Mercantil A");
});

test("los datos del local se guardan cifrados y no se reescriben (§7.6)", async () => {
  const datos = (dataCipher: string, kind = "PAGO_MOVIL") =>
    app.conTenant(A.tenant, (tx) => tx.collectionDetails.create({ data: { tenantId: A.tenant, kind, dataCipher, recordedByName: "Abigail Karam" } }));
  await assert.rejects(datos('{"phone":"0414-2345678"}'), por("RESTRICCION"));
  await assert.rejects(datos(CIFRADO, "USDT"), por("RESTRICCION"));
  const d = await datos(CIFRADO);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.collectionDetails.update({ where: { id: d.id }, data: { dataCipher: CIFRADO } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.collectionDetails.delete({ where: { id: d.id } })), SOLO_AGREGAR);
});

/* ── Catálogo de productos (B9-1, F8-02) ─────────────────────────────────────── */

const producto = (t: { tenant: string }, name: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.product.create({ data: { tenantId: t.tenant, name, category: "Bebidas", taxCode: "GENERAL", kind: "PRODUCTO", tracksStock: true, sku: `BEB-${String(++skuLibre).padStart(4, "0")}`, active: true, createdByName: "Abigail Karam", ...extra } as never }),
  );
/** El correlativo de los SKU de prueba: cada producto, el suyo. */
let skuLibre = 0;
const precioDe = (t: { tenant: string }, productId: string, amountMinor: bigint, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) => {
    const ahora = new Date();
    return tx.productPrice.create({
      data: { tenantId: t.tenant, productId, amountMinor, effectiveFrom: ahora, scheduledAt: ahora, scheduledByName: "Abigail Karam", ...extra } as never,
    });
  });

test("un producto no se borra; se edita y se aparta, pero quién lo creó no cambia", async () => {
  const p = await producto(A, "Agua mineral");
  await app.conTenant(A.tenant, (tx) => tx.product.update({ where: { id: p.id }, data: { name: "Agua mineral 600 ml", taxCode: "EXENTA", active: false } }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.product.update({ where: { id: p.id }, data: { createdByName: "Otra persona" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.product.delete({ where: { id: p.id } })), SOLO_AGREGAR);
  await assert.rejects(migrador.conTenant(A.tenant, (tx) => tx.$executeRawUnsafe("TRUNCATE product CASCADE")));
});

test("un nombre, un producto, sin mayúsculas ni espacios de más; en otro local, otro", async () => {
  await producto(A, "Malta");
  await assert.rejects(producto(A, "  MALTA "), por("DUPLICADO"));
  await producto(B, "Malta");
});

test("un producto mal definido no entra, aunque el código se equivoque", async () => {
  const malos: [string, Record<string, unknown>][] = [
    ["X", {}], // nombre de una letra
    ["Refresco", { category: "B" }],
    ["Refresco", { taxCode: "SUPER" }],
    ["Refresco", { createdByName: " " }],
  ];
  for (const [i, [name, extra]] of malos.entries()) {
    await assert.rejects(producto(A, name, extra), por("RESTRICCION"), String(i));
  }
});

test("un precio es de solo-agregar, en dólares, mayor que cero y nunca hacia atrás", async () => {
  const p = await producto(A, "Jugo natural");
  const ahora = new Date();
  const malos: [bigint, Record<string, unknown>][] = [
    [0n, {}],
    [-100n, {}],
    [1_000_001n, {}], // más de $ 10.000,00: se tecleó otra moneda
    [250n, { currency: "VES" }],
    [250n, { effectiveFrom: new Date(ahora.getTime() - 60_000), scheduledAt: ahora }],
  ];
  for (const [i, [monto, extra]] of malos.entries()) {
    await assert.rejects(precioDe(A, p.id, monto, extra), por("RESTRICCION"), String(i));
  }
  const bueno = await precioDe(A, p.id, 250n);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.productPrice.update({ where: { id: bueno.id }, data: { amountMinor: 300n } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.productPrice.delete({ where: { id: bueno.id } })), SOLO_AGREGAR);
  // Dos en el mismo instante no se ordenan.
  await assert.rejects(precioDe(A, p.id, 300n, { effectiveFrom: bueno.effectiveFrom, scheduledAt: bueno.scheduledAt }), por("DUPLICADO"));
});

test("A no pone precio a un producto de B", async () => {
  const deB = await producto(B, "Tequeños");
  await assert.rejects(precioDe(A, deB.id, 500n), por("REFERENCIA_INVALIDA"));
});

/* ── Las cuentas (B3-3) ───────────────────────────────────────────────────────── */

const cuenta = (t: { tenant: string; sucursal: string }, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.account.create({ data: { id: randomUUID(), tenantId: t.tenant, branchId: t.sucursal, kind: "FAMILIA", orderNumber: 100 + lineaLibre++, openedAt: new Date(), openedByName: "Marisol Prieto", ...extra } as never }),
  );
const version = (t: { tenant: string }, accountId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.accountVersion.create({
      data: { tenantId: t.tenant, accountId, version: 1, status: "ABIERTA", content: { id: accountId, status: "ABIERTA" }, cause: "GUARDAR", savedAt: new Date(), savedByName: "Marisol Prieto", ...extra } as never,
    }),
  );

test("el libro cita una cuenta de su local", async () => {
  await assert.rejects(crearAsiento(A, { documentId: randomUUID() }), por("REFERENCIA_INVALIDA"));
  await assert.rejects(crearAsiento(A, { documentId: B.doc }), por("REFERENCIA_INVALIDA"));
});

test("una cuenta no se reescribe ni se borra; su número de orden no se repite en la sucursal", async () => {
  const c = await cuenta(A);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.account.update({ where: { id: c.id }, data: { kind: "MESA" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.account.delete({ where: { id: c.id } })), SOLO_AGREGAR);
  await assert.rejects(cuenta(A, { orderNumber: c.orderNumber }), por("DUPLICADO"));
  await cuenta(B, { orderNumber: c.orderNumber }); // otro local, su propia serie
  for (const extra of [{ kind: "CAFETERIA" }, { orderNumber: 0 }, { openedByName: " " }]) {
    await assert.rejects(cuenta(A, extra), por("RESTRICCION"), JSON.stringify(extra));
  }
});

test("cada cambio de una cuenta es una versión nueva; ninguna se reescribe", async () => {
  const c = await cuenta(A);
  const v1 = await version(A, c.id);
  await assert.rejects(version(A, c.id), por("DUPLICADO")); // dos cambios sobre la misma versión
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.accountVersion.update({ where: { id: v1.id }, data: { status: "COBRADA" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.accountVersion.delete({ where: { id: v1.id } })), SOLO_AGREGAR);
});

test("una versión dice lo mismo en su columna y en su JSON, y un cobro cita su operación una vez", async () => {
  const c = await cuenta(A);
  const malos: Record<string, unknown>[] = [
    { status: "POR_COBRAR" }, // la columna dice otra cosa que el JSON
    { content: { id: randomUUID(), status: "ABIERTA" } }, // el JSON es de otra cuenta
    { cause: "COBRO" }, // un cobro sin su operación
    { operationKey: randomUUID() }, // un «guardar» con operación
    { version: 0 },
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(version(A, c.id, extra), por("RESTRICCION"), String(i));
  }
  const op = randomUUID();
  await version(A, c.id, { cause: "COBRO", operationKey: op });
  await assert.rejects(version(A, c.id, { version: 2, cause: "COBRO", operationKey: op }), por("DUPLICADO"));
});

test("A no guarda versiones de una cuenta de B", async () => {
  const deB = await cuenta(B);
  await assert.rejects(version(A, deB.id), por("REFERENCIA_INVALIDA"));
});

/* ── Las ventas (B3-4) ──────────────────────────────────────────────────────── */

const venta = async (t: { tenant: string; sucursal: string; doc: string }, extra: Record<string, unknown> = {}) => {
  const shiftId = await turnoDe(t);
  const operationKey = randomUUID();
  return app.conTenant(t.tenant, (tx) =>
    tx.sale.create({
      data: {
        tenantId: t.tenant,
        branchId: t.sucursal,
        accountId: t.doc,
        operationKey,
        shiftId,
        businessDate: new Date("2026-09-27"),
        closedAt: new Date(),
        cashierName: "Marisol Prieto",
        orderNumber: 1,
        totalMinor: 116n,
        currency: "USD",
        content: { accountId: t.doc, cobroKey: operationKey, total: { minor: "116", currency: "USD" } },
        ...extra,
      } as never,
    }),
  );
};

test("una venta no se reescribe ni se borra, y su contenido es el de su fila", async () => {
  const v = await venta(A);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.sale.update({ where: { id: v.id }, data: { totalMinor: 1n } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.sale.delete({ where: { id: v.id } })), SOLO_AGREGAR);
  const malos: Record<string, unknown>[] = [
    { totalMinor: 117n }, // el total de la columna no es el del contenido
    { content: { accountId: A.doc2, cobroKey: randomUUID(), total: { minor: "116", currency: "USD" } } }, // otra cuenta
    { currency: "VES" },
    { cashierName: " " },
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(venta(A, extra), por("RESTRICCION"), String(i));
  }
  // Una venta por cobro.
  await assert.rejects(venta(A, { operationKey: v.operationKey, content: { accountId: A.doc, cobroKey: v.operationKey, total: { minor: "116", currency: "USD" } } }), por("DUPLICADO"));
});

test("una venta entra en un turno de su sucursal y cita una cuenta de su local", async () => {
  await assert.rejects(venta(A, { shiftId: await turnoDe(B) }), por("REFERENCIA_INVALIDA"));
  await assert.rejects(venta({ ...A, doc: B.doc }), por("REFERENCIA_INVALIDA"));
});

test("las impresiones y la anulación se añaden; la referencia de una devolución nunca va en claro", async () => {
  const v = await venta(A);
  const imprimir = (extra: Record<string, unknown> = {}) =>
    app.conTenant(A.tenant, (tx) =>
      tx.salePrint.create({ data: { tenantId: A.tenant, saleId: v.id, printedAt: new Date(), printedByName: "Marisol Prieto", copy: false, ...extra } as never }),
    );
  const p = await imprimir();
  await imprimir({ copy: true });
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.salePrint.update({ where: { id: p.id }, data: { copy: true } })), SOLO_AGREGAR);

  const anular = (extra: Record<string, unknown> = {}) =>
    app.conTenant(A.tenant, (tx) =>
      tx.saleVoid.create({
        data: {
          tenantId: A.tenant,
          saleId: v.id,
          operationKey: randomUUID(),
          voidedAt: new Date(),
          requestedByName: "Marisol Prieto",
          authorizedBy: randomUUID(),
          authorizedByName: "Luis Guerrero",
          authorizedByRole: "SUPERVISOR",
          reason: "ERROR_EN_COBRO",
          refunds: [{ paymentIndex: 0, via: "MISMO_MEDIO", amountMinor: "116", currency: "USD", referenceCipher: CIFRADO }],
          ...extra,
        } as never,
      }),
    );
  const malos: Record<string, unknown>[] = [
    { refunds: [{ paymentIndex: 0, reference: "004821" }] }, // la referencia en claro
    { reason: "OTRO" }, // «Otro» sin explicarlo
    { authorizedByRole: "CAJERO" },
    { reason: "PORQUE_SI" },
  ];
  for (const [i, extra] of malos.entries()) {
    await assert.rejects(anular(extra), por("RESTRICCION"), String(i));
  }
  const a = await anular();
  await assert.rejects(anular(), por("DUPLICADO")); // una anulación por venta
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.saleVoid.delete({ where: { id: a.id } })), SOLO_AGREGAR);
});

test("una cortesía es un cambio de la cuenta con su operación", async () => {
  const c = await cuenta(A);
  await version(A, c.id);
  await version(A, c.id, { version: 2, cause: "CORTESIA", operationKey: randomUUID() });
  await assert.rejects(version(A, c.id, { version: 3, cause: "CORTESIA" }), por("RESTRICCION"));
});

/* ── El arqueo y los cortes (B3-5) ──────────────────────────────────────────── */

const sellar = (t: { tenant: string }, turno: { id: string; openedBy: string; openedByName: string }) =>
  app.conTenant(t.tenant, (tx) =>
    tx.cashShift.update({ where: { id: turno.id }, data: { status: "CERRADO_Z", closedAt: new Date(), closedBy: turno.openedBy, closedByName: turno.openedByName } }),
  );
const conteo = (t: { tenant: string }, shiftId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.shiftCount.create({
      data: {
        tenantId: t.tenant,
        shiftId,
        countedAt: new Date(),
        countedByName: "Marisol Prieto",
        counts: [],
        counted: [],
        expected: [],
        differences: [],
        differenceUsdMinor: 0n,
        signer: "CAJERA",
        ...extra,
      } as never,
    }),
  );
const corte = (t: { tenant: string }, shiftId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.shiftCut.create({ data: { tenantId: t.tenant, shiftId, kind: "X", madeAt: new Date(), madeByName: "Marisol Prieto", content: {}, ...extra } as never }),
  );

test("un conteo no se reescribe; sin diferencia medible firma supervisión", async () => {
  const t = await abrirTurno(A);
  const c = await conteo(A, t.id);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.shiftCount.update({ where: { id: c.id }, data: { signer: "SUPERVISION" } })), SOLO_AGREGAR);
  for (const [i, extra] of [
    { differenceUsdMinor: null }, // sin medida, la cajera no firma
    { signer: "NADIE" },
    { rateId: randomUUID() }, // la tasa sin su valor
    { differenceUsdMinor: -1n },
  ].entries()) {
    await assert.rejects(conteo(A, t.id, extra), por("RESTRICCION"), String(i));
  }
  await conteo(A, t.id, { differenceUsdMinor: null, signer: "SUPERVISION" });
});

test("el corte X se repite; el Z es uno, con su arqueo, y supervisión firma con justificación", async () => {
  const t = await abrirTurno(A);
  const c = await conteo(A, t.id);
  await corte(A, t.id);
  await corte(A, t.id);
  const z = (extra: Record<string, unknown> = {}) =>
    corte(A, t.id, { kind: "Z", countId: c.id, closing: "RELEVO", signer: "CAJERA", operationKey: randomUUID(), ...extra });
  for (const [i, extra] of [
    { countId: null }, // un Z sin arqueo
    { closing: null }, // sin decir qué cierre (el IN no deja pasar el nulo)
    { signer: null },
    { closing: "CUALQUIERA" },
    { signer: "SUPERVISION" }, // supervisión sin nombre ni justificación
    { signer: "SUPERVISION", authorizedBy: randomUUID(), authorizedByName: "Luis Guerrero", justification: "no" },
  ].entries()) {
    await assert.rejects(z(extra), por("RESTRICCION"), String(i));
  }
  await assert.rejects(corte(A, t.id, { countId: c.id }), por("RESTRICCION")); // un X no lleva arqueo
  const hecho = await z();
  await assert.rejects(z(), por("DUPLICADO")); // un Z por turno
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.shiftCut.delete({ where: { id: hecho.id } })), SOLO_AGREGAR);
});

test("después del corte Z nada toca el turno: ni conteos, ni cortes (F4-06)", async () => {
  const t = await abrirTurno(A);
  const c = await conteo(A, t.id);
  const otro = await abrirTurno(A);
  // El arqueo de un Z es del mismo turno.
  await assert.rejects(
    corte(A, otro.id, { kind: "Z", countId: c.id, closing: "RELEVO", signer: "CAJERA", operationKey: randomUUID() }),
    por("RESTRICCION"),
  );
  await sellar(A, t);
  await assert.rejects(conteo(A, t.id), por("RESTRICCION"));
  await assert.rejects(corte(A, t.id), por("RESTRICCION"));
});

test("una venta de un turno con corte Z no se anula; una cuenta puede quedar incobrable", async () => {
  const t = await abrirTurno(A);
  const operationKey = randomUUID();
  const v = await app.conTenant(A.tenant, (tx) =>
    tx.sale.create({
      data: {
        tenantId: A.tenant, branchId: A.sucursal, accountId: A.doc, operationKey, shiftId: t.id, businessDate: new Date("2026-09-27"),
        closedAt: new Date(), cashierName: "Marisol Prieto", orderNumber: 1, totalMinor: 116n, currency: "USD",
        content: { accountId: A.doc, cobroKey: operationKey, total: { minor: "116", currency: "USD" } },
      } as never,
    }),
  );
  await sellar(A, t);
  await assert.rejects(
    app.conTenant(A.tenant, (tx) =>
      tx.saleVoid.create({
        data: {
          tenantId: A.tenant, saleId: v.id, operationKey: randomUUID(), voidedAt: new Date(), requestedByName: "Marisol Prieto",
          authorizedBy: randomUUID(), authorizedByName: "Luis Guerrero", authorizedByRole: "SUPERVISOR", reason: "ERROR_EN_COBRO", refunds: [],
        } as never,
      }),
    ),
    por("RESTRICCION"),
  );
  const c = await cuenta(A);
  await version(A, c.id);
  const content = { id: c.id, status: "INCOBRABLE" };
  await version(A, c.id, { version: 2, status: "INCOBRABLE", content, cause: "INCOBRABLE", operationKey: randomUUID() });
});

/* ── El parque (B4-1, B4-2) ───────────────────────────────────────────────────── */

const representante = (t: { tenant: string }, contactKey: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.guardian.create({
      data: { tenantId: t.tenant, fullName: "María Pérez", contactReference: "0412-1234567", contactKey, createdAt: new Date(), ...extra } as never,
    }),
  );
const nino = (t: { tenant: string }, guardianId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) => tx.kid.create({ data: { tenantId: t.tenant, guardianId, name: "Santiago", createdAt: new Date(), ...extra } as never }));
const estancia = (t: { tenant: string; sucursal: string }, accountId: string, guardianId: string, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) =>
    tx.parkSession.create({
      data: {
        tenantId: t.tenant, branchId: t.sucursal, accountId, guardianId, wristbandCode: `P-${lineaLibre++}`,
        packageId: "p60", packageName: "1 hora", mode: "PREPAGO", durationMinutes: 60, priceMinor: 500n, currency: "USD",
        terms: { graceMinutes: 5 }, tariffVersion: 1, startedAt: new Date(), openedByName: "Ana Rojas",
        checkInKey: randomUUID(), status: "ACTIVA", ...extra,
      } as never,
    }),
  );

test("el directorio se corrige pero no se borra, y un contacto es una familia por local", async () => {
  const g = await representante(A, "04121234567");
  await assert.rejects(representante(A, "04121234567"), por("DUPLICADO"));
  await representante(B, "04121234567"); // otro local, su propio directorio
  for (const extra of [{ contactKey: "0412-1234567" }, { fullName: " " }, { contactReference: "12" }]) {
    await assert.rejects(representante(A, "0414000000", extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  await app.conTenant(A.tenant, (tx) => tx.guardian.update({ where: { id: g.id }, data: { fullName: "María Pérez de Díaz" } }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.guardian.delete({ where: { id: g.id } })), SOLO_AGREGAR);
  const k = await nino(A, g.id);
  await app.conTenant(A.tenant, (tx) => tx.kid.update({ where: { id: k.id }, data: { nickname: "Santi" } }));
  const otro = await representante(A, "04241112233");
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.kid.update({ where: { id: k.id }, data: { guardianId: otro.id } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.kid.delete({ where: { id: k.id } })), SOLO_AGREGAR);
  await assert.rejects(nino(A, g.id, { name: "S" }), por("RESTRICCION"));
});

test("una pulsera, una visita (V-1): ni cerrada su estancia vuelve a entrar; en otro local, sí", async () => {
  const g = await representante(A, "04161230001");
  const c = await cuenta(A);
  const s = await estancia(A, c.id, g.id, { wristbandCode: "PULSERA-1" });
  await assert.rejects(estancia(A, c.id, g.id, { wristbandCode: "PULSERA-1" }), por("DUPLICADO"));
  await app.conTenant(A.tenant, (tx) =>
    tx.parkSession.update({ where: { id: s.id }, data: { status: "CERRADA", endedAt: new Date(Date.now() + 1000), closedByName: "Ana Rojas", checkOutKey: randomUUID(), closureKind: "SALIDA", pickedUpByGuardian: true } }),
  );
  await assert.rejects(estancia(A, c.id, g.id, { wristbandCode: "PULSERA-1" }), por("DUPLICADO"));
  // El mismo código impreso en el lote de otro local no choca.
  await estancia(B, (await cuenta(B)).id, (await representante(B, "04161230001")).id, { wristbandCode: "PULSERA-1" });
});

test("una estancia solo se nombra y se cierra: lo contratado y el cierre no se reescriben", async () => {
  const g = await representante(A, "04161230002");
  const c = await cuenta(A);
  const s = await estancia(A, c.id, g.id);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { priceMinor: 1n } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { startedAt: new Date(0) } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.delete({ where: { id: s.id } })), SOLO_AGREGAR);
  // El niño es de su familia, y se nombra una vez.
  const ajeno = await nino(A, (await representante(A, "04161230003")).id);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { kidId: ajeno.id } })), por("RESTRICCION"));
  const suyo = await nino(A, g.id);
  await app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { kidId: suyo.id } }));
  const otro = await nino(A, g.id, { name: "Valentina" });
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { kidId: otro.id } })), SOLO_AGREGAR);
  // Cerrar a medias no vale; cerrada, no se reabre ni cambia su cierre.
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { status: "CERRADA" } })), por("RESTRICCION"));
  const fin = { status: "CERRADA", endedAt: new Date(Date.now() + 1000), closedByName: "Ana Rojas", checkOutKey: randomUUID(), closureKind: "SALIDA", pickedUpByGuardian: true };
  await app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: fin }));
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { status: "ACTIVA", endedAt: null, closedByName: null, checkOutKey: null, closureKind: null, pickedUpByGuardian: null } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { pickedUpByGuardian: false, pickedUpByName: "Otra persona" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSession.update({ where: { id: s.id }, data: { endedAt: new Date(Date.now() + 5000) } })), SOLO_AGREGAR);
});

test("una estancia cobra en dólares un paquete de verdad, con su pulsera bien escrita", async () => {
  const g = await representante(A, "04161230004");
  const c = await cuenta(A);
  const malos: Record<string, unknown>[] = [
    { priceMinor: 0n }, { currency: "VES" }, { durationMinutes: 0 }, { mode: "GRATIS" }, { status: "PAUSADA" },
    { wristbandCode: "abc 1" }, { tariffVersion: 0 }, { terms: [] }, { openedByName: "" },
    { endedAt: new Date() }, // cerrada a medias
  ];
  for (const extra of malos) await assert.rejects(estancia(A, c.id, g.id, extra), por("RESTRICCION"), JSON.stringify(extra, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  await estancia(A, c.id, g.id, { durationMinutes: null, mode: "POSTPAGO" }); // tiempo abierto
});

test("A no abre una estancia en la cuenta ni con el representante de B", async () => {
  const gA = await representante(A, "04161230005");
  const gB = await representante(B, "04161230005");
  const cA = await cuenta(A);
  const cB = await cuenta(B);
  await assert.rejects(estancia(A, cB.id, gA.id), por("REFERENCIA_INVALIDA"));
  await assert.rejects(estancia(A, cA.id, gB.id), por("REFERENCIA_INVALIDA"));
});

test("la entrada y la salida cambian la cuenta con su operación", async () => {
  const c = await cuenta(A);
  await version(A, c.id, { cause: "ENTRADA", operationKey: randomUUID() });
  await version(A, c.id, { version: 2, cause: "SALIDA", operationKey: randomUUID() });
  await assert.rejects(version(A, c.id, { version: 3, cause: "SALIDA" }), por("RESTRICCION")); // sin su operación
});

const cerrar = (t: { tenant: string }, id: string, extra: Record<string, unknown>) =>
  app.conTenant(t.tenant, (tx) =>
    tx.parkSession.update({
      where: { id },
      data: { status: "CERRADA", endedAt: new Date(Date.now() + 1000), closedByName: "Ana Rojas", checkOutKey: randomUUID(), ...extra } as never,
    }),
  );

test("D9: una salida dice quién recogió al niño; un cierre administrativo dice por qué y nada más (B4-3)", async () => {
  const g = await representante(A, "04161230010");
  const c = await cuenta(A);
  const malos: Record<string, unknown>[] = [
    {}, // cerrada sin decir cómo
    { closureKind: "PERDIDA" },
    { closureKind: "SALIDA", pickedUpByGuardian: false }, // otra persona, sin nombre
    { closureKind: "SALIDA", pickedUpByGuardian: true, pickedUpByName: "Tía Rosa" }, // su representante no lleva otro nombre
    { closureKind: "ADMINISTRATIVA" }, // sin motivo
    { closureKind: "ADMINISTRATIVA", closureReason: "Se fue sin avisar", pickedUpByGuardian: true }, // nadie lo vio salir
    { closureKind: "SALIDA", pickedUpByGuardian: true, closureReason: "Motivo de más" },
  ];
  for (const extra of malos) {
    const s = await estancia(A, c.id, g.id);
    await assert.rejects(cerrar(A, s.id, extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  for (const extra of [
    { closureKind: "SALIDA", pickedUpByGuardian: true },
    { closureKind: "SALIDA", pickedUpByGuardian: false, pickedUpByName: "Rosa Díaz (tía)" },
    { closureKind: "ADMINISTRATIVA", closureReason: "Se fue sin registrar la salida" },
  ]) {
    await cerrar(A, (await estancia(A, c.id, g.id)).id, extra);
  }
  // Activa, no dice quién la recogió.
  await assert.rejects(estancia(A, c.id, g.id, { pickedUpByGuardian: true }), por("RESTRICCION"));
});

test("una recarga es un tramo más de una estancia activa de tiempo fijo, y no se reescribe (F5-11)", async () => {
  const g = await representante(A, "04161230011");
  const c = await cuenta(A);
  const recarga = (sessionId: string, extra: Record<string, unknown> = {}) =>
    app.conTenant(A.tenant, (tx) =>
      tx.parkSessionExtension.create({
        data: {
          tenantId: A.tenant, sessionId, minutes: 30, packageId: "p30", packageName: "30 minutos", priceMinor: 300n, currency: "USD",
          operationKey: randomUUID(), createdAt: new Date(), createdByName: "Ana Rojas", ...extra,
        } as never,
      }),
    );
  const s = await estancia(A, c.id, g.id);
  const r = await recarga(s.id);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSessionExtension.update({ where: { id: r.id }, data: { minutes: 90 } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.parkSessionExtension.delete({ where: { id: r.id } })), SOLO_AGREGAR);
  await assert.rejects(recarga(s.id, { operationKey: r.operationKey }), por("DUPLICADO"));
  for (const extra of [{ minutes: 0 }, { priceMinor: 0n }, { currency: "VES" }]) {
    await assert.rejects(recarga(s.id, extra), por("RESTRICCION"), Object.keys(extra)[0]);
  }
  const libre = await estancia(A, c.id, g.id, { durationMinutes: null, mode: "POSTPAGO" });
  await assert.rejects(recarga(libre.id), por("RESTRICCION")); // el tiempo abierto no se recarga
  await cerrar(A, s.id, { closureKind: "SALIDA", pickedUpByGuardian: true });
  await assert.rejects(recarga(s.id), por("RESTRICCION")); // ya salió
  const deB = await estancia(B, (await cuenta(B)).id, (await representante(B, "04161230011")).id);
  await assert.rejects(recarga(deB.id), por("REFERENCIA_INVALIDA"));
});

test("los ajustes de la sucursal son versiones de solo-agregar, con autor completo (B4-4)", async () => {
  const ajuste = (t: typeof A, version: number, extra: Record<string, unknown> = {}) =>
    app.conTenant(t.tenant, (tx) =>
      tx.branchSettingsVersion.create({
        data: { tenantId: t.tenant, branchId: t.sucursal, version, content: { formatoHora: "12h" }, publishedBy: randomUUID(), publishedByName: "Abigail Karam", ...extra } as never,
      }),
    );
  const v1 = await ajuste(A, 1);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.branchSettingsVersion.update({ where: { id: v1.id }, data: { content: { formatoHora: "24h" } } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.branchSettingsVersion.delete({ where: { id: v1.id } })), SOLO_AGREGAR);
  await assert.rejects(ajuste(A, 1), por("DUPLICADO"));
  for (const extra of [{ content: ["12h"] }, { content: "12h" }, { publishedByName: null }, { publishedBy: null }]) {
    await assert.rejects(ajuste(A, 2, extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  await assert.rejects(ajuste(A, 0), por("RESTRICCION"));
  // Una operación del sistema no tiene persona: ni id ni nombre.
  await ajuste(A, 2, { publishedBy: null, publishedByName: null });
  // La sucursal de otro tenant no se cita.
  await assert.rejects(
    app.conTenant(A.tenant, (tx) => tx.branchSettingsVersion.create({ data: { tenantId: A.tenant, branchId: B.sucursal, version: 1, content: {} } })),
    por("REFERENCIA_INVALIDA"),
  );
});

test("la existencia es la suma de movimientos inmutables, citados por su versión y nunca bajo cero (B9-2)", async () => {
  const p = await producto(A, "Refresco de lata");
  const c = await cuenta(A);
  const v1 = await version(A, c.id);
  const v2 = await version(A, c.id, { version: 2 });
  const v3 = await version(A, c.id, { version: 3 });
  const mover = (t: typeof A, quantity: number, extra: Record<string, unknown> = {}) =>
    app.conTenant(t.tenant, (tx) =>
      tx.stockMovement.create({
        data: { tenantId: t.tenant, branchId: t.sucursal, productId: p.id, quantity, kind: quantity < 0 ? "VENTA" : "DEVOLUCION", valueMinor: 0n, accountId: c.id, accountVersion: v1.version, at: new Date(), createdByName: "Marisol Prieto", ...extra } as never,
      }),
    );
  // Sin existencia no sale: la última línea, aunque la aplicación se equivoque.
  await assert.rejects(mover(A, -1), por("RESTRICCION"));
  const entra = await mover(A, 2);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockMovement.update({ where: { id: entra.id }, data: { quantity: 5 } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockMovement.delete({ where: { id: entra.id } })), SOLO_AGREGAR);
  // La misma versión no mueve el mismo producto dos veces (un reintento).
  await assert.rejects(mover(A, -1), por("DUPLICADO"));
  await mover(A, -2, { accountVersion: v2.version });
  await assert.rejects(mover(A, 1, { accountVersion: 9 }), por("REFERENCIA_INVALIDA")); // una versión que no existe
  for (const extra of [{ quantity: 0 }, { kind: "AJUSTE" }, { kind: "VENTA", quantity: 1 }, { accountId: null, accountVersion: null }, { createdByName: " " }]) {
    await assert.rejects(mover(A, 1, { accountVersion: v3.version, ...extra }), por("RESTRICCION"), JSON.stringify(extra));
  }
  // B no ve ni cita lo de A.
  assert.equal(await app.conTenant(B.tenant, (tx) => tx.stockMovement.count({ where: { productId: p.id } })), 0);
  await assert.rejects(mover(B, 1), por("REFERENCIA_INVALIDA"));
});

test("una entrada de mercancía es inmutable; sus líneas dicen bultos × unidades y su costo (B9-3)", async () => {
  const p = await producto(A, "Malta en caja");
  const entrada = (t: typeof A, extra: Record<string, unknown> = {}) =>
    app.conTenant(t.tenant, (tx) =>
      tx.stockEntry.create({ data: { tenantId: t.tenant, branchId: t.sucursal, kind: "COMPRA", operationKey: randomUUID(), receivedAt: new Date(), createdByName: "Luis Guerrero", ...extra } as never }),
    );
  const e = await entrada(A, { supplier: "Distribuidora Polar", invoice: "0001" });
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockEntry.update({ where: { id: e.id }, data: { supplier: "Otra" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockEntry.delete({ where: { id: e.id } })), SOLO_AGREGAR);
  for (const extra of [{ kind: "REGALO" }, { supplier: " " }, { invoice: "" }, { createdByName: "X" }]) {
    await assert.rejects(entrada(A, extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  await assert.rejects(entrada(A, { operationKey: e.operationKey }), por("DUPLICADO")); // la misma clave

  const linea = (extra: Record<string, unknown> = {}) =>
    app.conTenant(A.tenant, (tx) =>
      tx.stockMovement.create({
        data: { tenantId: A.tenant, branchId: A.sucursal, productId: p.id, quantity: 48, kind: "ENTRADA", valueMinor: 2400n, entryId: e.id, packs: 2, packSize: 24, at: new Date(), createdByName: "Luis Guerrero", ...extra } as never,
      }),
    );
  for (const extra of [
    { quantity: 47 }, // no es bultos × unidades
    { packs: null },
    { valueMinor: -1n },
    { valueMinor: 10_000_001n }, // más de $ 100.000,00
    { packSize: 1001, quantity: 2002 },
    { entryId: null },
  ]) {
    await assert.rejects(linea(extra), por("RESTRICCION"), JSON.stringify(extra, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  }
  await linea();
  await assert.rejects(linea(), por("DUPLICADO")); // una entrada recibe cada producto una vez
  // B no cita la entrada de A.
  await assert.rejects(
    app.conTenant(B.tenant, (tx) =>
      tx.stockMovement.create({ data: { tenantId: B.tenant, branchId: B.sucursal, productId: p.id, quantity: 1, kind: "ENTRADA", valueMinor: 0n, entryId: e.id, packs: 1, packSize: 1, at: new Date(), createdByName: "Luis Guerrero" } }),
    ),
    por("REFERENCIA_INVALIDA"),
  );
});

test("una salida o un conteo es inmutable, con su motivo de lista cerrada y quién lo autorizó (B9-4)", async () => {
  const p = await producto(A, "Galleta de prueba");
  const ajuste = (extra: Record<string, unknown> = {}) =>
    app.conTenant(A.tenant, (tx) =>
      tx.stockAdjustment.create({
        data: { tenantId: A.tenant, branchId: A.sucursal, kind: "SALIDA", reason: "MERMA", content: [{ productId: p.id, cantidad: 1 }], operationKey: randomUUID(), at: new Date(), createdByName: "Luis Guerrero", authorizedBy: randomUUID(), authorizedByName: "Abigail Karam", ...extra } as never,
      }),
    );
  const a = await ajuste();
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockAdjustment.update({ where: { id: a.id }, data: { reason: "REGALO" } })), SOLO_AGREGAR);
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.stockAdjustment.delete({ where: { id: a.id } })), SOLO_AGREGAR);
  for (const extra of [{ reason: null }, { reason: "VARIOS" }, { kind: "CONTEO" }, { kind: "AJUSTE", reason: null }, { content: [] }, { content: { x: 1 } }, { note: "x" }, { authorizedByName: " " }]) {
    await assert.rejects(ajuste(extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  await ajuste({ kind: "CONTEO", reason: null });

  const mov = (extra: Record<string, unknown>) =>
    app.conTenant(A.tenant, (tx) =>
      tx.stockMovement.create({ data: { tenantId: A.tenant, branchId: A.sucursal, productId: p.id, adjustmentId: a.id, at: new Date(), createdByName: "Luis Guerrero", ...extra } as never }),
    );
  // Un ajuste que mete: el valor va con su signo. Una salida solo saca.
  await assert.rejects(mov({ kind: "AJUSTE", quantity: 2, valueMinor: -10n }), por("RESTRICCION"));
  await assert.rejects(mov({ kind: "SALIDA", quantity: 2, valueMinor: 0n }), por("RESTRICCION"));
  await assert.rejects(mov({ kind: "AJUSTE", quantity: 2, valueMinor: 10n, adjustmentId: null }), por("RESTRICCION"));
  await mov({ kind: "AJUSTE", quantity: 2, valueMinor: 10n });
  await assert.rejects(mov({ kind: "AJUSTE", quantity: 1, valueMinor: 5n }), por("DUPLICADO")); // un producto por ajuste
});

test("el tipo, el SKU, el código de barras y la presentación de un producto (B9-6)", async () => {
  const p = await producto(A, "Refresco de prueba B96", { barcode: "4006381333931", presentation: "Lata 355 ml" });
  // El SKU no cambia; el código y la presentación, sí.
  await assert.rejects(app.conTenant(A.tenant, (tx) => tx.product.update({ where: { id: p.id }, data: { sku: "BEB-9999" } })), SOLO_AGREGAR);
  await app.conTenant(A.tenant, (tx) => tx.product.update({ where: { id: p.id }, data: { presentation: "Lata 330 ml" } }));
  // Un código, un producto (en el local); en otro local, otro.
  await assert.rejects(producto(A, "Otro refresco B96", { barcode: "4006381333931" }), por("DUPLICADO"));
  await producto(B, "Refresco de B B96", { barcode: "4006381333931" });
  // El SKU no se repite en el local.
  await assert.rejects(producto(A, "Otro más B96", { sku: p.sku }), por("DUPLICADO"));
  for (const extra of [
    { kind: "COMIDA" },
    { kind: "PREPARADO" }, // un preparado no lleva existencia
    { kind: "SERVICIO", tracksStock: false, barcode: "ABCD-1234" }, // ni código de barras
    { sku: "beb-1" },
    { barcode: "abc" },
    { presentation: " " },
  ]) {
    await assert.rejects(producto(A, `Malo B96 ${JSON.stringify(extra).length}`, extra), por("RESTRICCION"), JSON.stringify(extra));
  }
  await producto(A, "Café B96", { kind: "PREPARADO", tracksStock: false });
});
