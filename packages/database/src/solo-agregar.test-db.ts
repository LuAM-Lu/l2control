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
const A = { tenant: randomUUID(), sucursal: randomUUID() };
const B = { tenant: randomUUID(), sucursal: randomUUID() };
const contenido = { packages: [], policy: {} };

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

const DOC = randomUUID();
let lineaLibre = 0;
/** Un asiento de `t` en efectivo en dólares; `extra` cambia lo que haga falta. */
const asiento = (t: { tenant: string; sucursal: string }, extra: Record<string, unknown> = {}) => ({
  tenantId: t.tenant,
  branchId: t.sucursal,
  documentId: DOC,
  operationKey: randomUUID(),
  line: lineaLibre++ % 20,
  kind: "COBRO",
  method: "EFECTIVO_USD",
  currency: "USD",
  amountMinor: 580n,
  igtfMinor: 17n,
  recordedByName: "Marisol Prieto",
  ...extra,
});
const crearAsiento = (t: { tenant: string; sucursal: string }, extra: Record<string, unknown> = {}) =>
  app.conTenant(t.tenant, (tx) => tx.payment.create({ data: asiento(t, extra) }));

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
    { method: "ZELLE", currency: "VES", rateId: tasaA.id, rateValue: "855.6625" }, // moneda que no es la del medio
    { method: "PAGO_MOVIL", currency: "VES", amountMinor: 427831n, igtfMinor: 0n }, // bolívares sin tasa
    { rateId: tasaA.id, rateValue: "855.6625" }, // dólares con tasa
    { method: "PAGO_MOVIL", currency: "VES", rateId: tasaA.id, rateValue: null, igtfMinor: 0n }, // tasa sin su valor
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
  for (const extra of [{ amountMinor: -500n }, { method: "ZELLE" }, { documentId: randomUUID() }, { igtfMinor: 0n }]) {
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
    crearAsiento(A, { method: "PAGO_MOVIL", currency: "VES", amountMinor: 427831n, igtfMinor: 0n, rateId: tasaB.id, rateValue: "855.6625" }),
    por("REFERENCIA_INVALIDA"),
  );
  const deB = await crearAsiento(B);
  await assert.rejects(crearAsiento(A, { reversesId: deB.id, reason: "ERROR_EN_COBRO", amountMinor: -580n, igtfMinor: -17n }), por("REFERENCIA_INVALIDA"));
});
