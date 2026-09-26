/**
 * La prueba negativa de aislamiento — criterio de F1-05 y §10.1: «el tenant A no lee
 * filas del tenant B». Sin esta prueba, la RLS es decorativa (ADR-002).
 *
 * Corre contra l2control_test con `pnpm --filter @l2/database test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { abrirBase, type Base } from "./index.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const URL_MIGRADOR = process.env.L2_DB_TEST_MIGRATOR_URL!;

let app: Base;
let migrador: Base;
/** Conexión cruda como l2_app, para lo que `conTenant()` no deja hacer a propósito. */
let crudo: pg.Pool;

const A = { tenant: randomUUID(), sucursal: randomUUID() };
const B = { tenant: randomUUID(), sucursal: randomUUID() };

before(async () => {
  app = await abrirBase(URL_APP);
  migrador = await abrirBase(URL_MIGRADOR);
  crudo = new pg.Pool({ connectionString: URL_APP, max: 1 });
  // Hasta el migrador sufre la RLS forzada: cada tenant se crea dentro de su propio contexto.
  for (const t of [A, B]) {
    await migrador.conTenant(t.tenant, async (tx) => {
      await tx.tenant.create({ data: { id: t.tenant, name: `prueba ${t.tenant}` } });
      await tx.branch.create({ data: { id: t.sucursal, tenantId: t.tenant, name: "Principal" } });
    });
  }
});

after(async () => {
  for (const t of [A, B]) {
    await migrador.conTenant(t.tenant, async (tx) => {
      await tx.branch.deleteMany({ where: { tenantId: t.tenant } });
      await tx.tenant.deleteMany({ where: { id: t.tenant } });
    });
  }
  await Promise.all([app.cerrar(), migrador.cerrar(), crudo.end()]);
});

describe("el tenant A no ve ni toca nada del tenant B", () => {
  test("A lee solo sus sucursales", async () => {
    const vistas = await app.conTenant(A.tenant, (tx) => tx.branch.findMany());
    assert.deepEqual(vistas.map((s) => s.id), [A.sucursal]);
  });

  test("A no encuentra la sucursal de B aunque pida su id", async () => {
    const ajena = await app.conTenant(A.tenant, (tx) => tx.branch.findUnique({ where: { id: B.sucursal } }));
    assert.equal(ajena, null);
  });

  test("A no ve el registro del tenant B", async () => {
    const tenants = await app.conTenant(A.tenant, (tx) => tx.tenant.findMany());
    assert.deepEqual(tenants.map((t) => t.id), [A.tenant]);
  });

  test("A no puede escribir una fila a nombre de B", async () => {
    await assert.rejects(
      app.conTenant(A.tenant, (tx) => tx.branch.create({ data: { tenantId: B.tenant, name: "Intrusa" } })),
      /row-level security|violates|42501/i,
    );
  });

  test("A no puede modificar ni borrar filas de B", async () => {
    const cambiadas = await app.conTenant(A.tenant, (tx) =>
      tx.branch.updateMany({ where: { id: B.sucursal }, data: { name: "Hackeada" } }),
    );
    const borradas = await app.conTenant(A.tenant, (tx) => tx.branch.deleteMany({ where: { id: B.sucursal } }));
    assert.equal(cambiadas.count, 0);
    assert.equal(borradas.count, 0);
    const intacta = await app.conTenant(B.tenant, (tx) => tx.branch.findUnique({ where: { id: B.sucursal } }));
    assert.equal(intacta?.name, "Principal");
  });

  test("A no puede mudar su propia fila a B", async () => {
    await assert.rejects(
      app.conTenant(A.tenant, (tx) =>
        tx.branch.update({ where: { id: A.sucursal }, data: { tenantId: B.tenant } }),
      ),
      /row-level security|violates|42501/i,
    );
  });
});

describe("fail-closed", () => {
  test("sin tenant fijado no se ve ninguna fila", async () => {
    const { rows } = await crudo.query("SELECT count(*)::int AS n FROM branch");
    assert.equal(rows[0].n, 0);
  });

  test("sin tenant fijado no se puede escribir", async () => {
    await assert.rejects(
      crudo.query("INSERT INTO branch (id, tenant_id, name) VALUES ($1, $2, 'x')", [randomUUID(), A.tenant]),
      /row-level security/i,
    );
  });

  test("el tenant no se filtra a la siguiente transacción de la misma conexión", async () => {
    const c = await crudo.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.tenant_id', $1, true)", [A.tenant]);
      await c.query("COMMIT");
      const { rows } = await c.query("SELECT count(*)::int AS n FROM branch");
      assert.equal(rows[0].n, 0);
    } finally {
      c.release();
    }
  });

  test("un tenant que no es uuid se rechaza antes de tocar la base", async () => {
    await assert.rejects(app.conTenant("' OR 1=1 --", async () => "nunca"), /no es un tenant válido/);
  });

  test("abrirBase se niega a arrancar con un usuario que se salta la RLS", async () => {
    // El superusuario de desarrollo: misma base, usuario equivocado.
    const url = new URL(URL_APP);
    url.username = "postgres";
    url.password = process.env.POSTGRES_PASSWORD ?? "";
    await assert.rejects(abrirBase(url.toString()), /se salta la RLS/);
  });
});

describe("el catálogo de la base cumple ADR-002", () => {
  test("toda tabla con tenant_id tiene RLS habilitada, forzada y las cuatro políticas", async () => {
    const { rows } = await crudo.query(`
      SELECT c.relname AS tabla, c.relrowsecurity AS rls, c.relforcerowsecurity AS forzada,
             (SELECT count(*)::int FROM pg_policies p WHERE p.tablename = c.relname) AS politicas
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id')
              OR c.relname = 'tenant')`);
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.ok(r.rls && r.forzada, `${r.tabla}: RLS sin forzar`);
      assert.equal(r.politicas, 4, `${r.tabla}: ${r.politicas} políticas`);
    }
  });

  test("ninguna tabla de negocio queda fuera del aislamiento", async () => {
    const { rows } = await crudo.query(`
      SELECT c.relname AS tabla
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND c.relname NOT IN ('tenant', '_prisma_migrations')
         AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id')`);
    assert.deepEqual(rows, []);
  });

  test("ninguna columna guarda punto flotante (I-01, F3-02)", async () => {
    const { rows } = await crudo.query(`
      SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type IN ('real', 'double precision')`);
    assert.deepEqual(rows, []);
  });

  test("la aplicación no lee el historial de migraciones", async () => {
    await assert.rejects(crudo.query("SELECT 1 FROM _prisma_migrations"), /permission denied/);
  });
});
