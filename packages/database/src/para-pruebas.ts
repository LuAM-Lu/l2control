/**
 * Utilidades SOLO para las pruebas de integración (`*.test-db.ts`). No las importa el código
 * de la aplicación.
 */
import pg from "pg";

/**
 * Borra lo que una prueba creó para unos tenants, incluidas las tablas de solo-agregar.
 *
 * Lo hace el superusuario con `session_replication_role = replica`, que apaga disparadores y
 * FK durante la sesión: es la única forma de deshacer una fila append-only, y por eso se
 * niega a correr fuera de una base cuyo nombre termine en `_test`.
 */
export async function borrarTenantsDePrueba(urlApp: string, tenants: string[]): Promise<void> {
  const url = new URL(urlApp);
  if (!url.pathname.endsWith("_test")) {
    throw new Error(`borrarTenantsDePrueba solo corre en una base de pruebas, no en «${url.pathname}».`);
  }
  url.username = "postgres";
  url.password = process.env.POSTGRES_PASSWORD ?? "";

  const cliente = new pg.Client({ connectionString: url.toString() });
  await cliente.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SET LOCAL session_replication_role = replica");
    const { rows } = await cliente.query<{ tabla: string }>(`
      SELECT c.relname AS tabla
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id')`);
    for (const { tabla } of rows) {
      await cliente.query(`DELETE FROM "${tabla}" WHERE tenant_id = ANY($1::uuid[])`, [tenants]);
    }
    await cliente.query("DELETE FROM tenant WHERE id = ANY($1::uuid[])", [tenants]);
    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    await cliente.end();
  }
}
