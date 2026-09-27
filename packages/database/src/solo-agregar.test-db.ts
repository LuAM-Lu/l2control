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
