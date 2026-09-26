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
