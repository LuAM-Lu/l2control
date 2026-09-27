/**
 * La base de datos de L2 Control — B0-2 (F1-05, ADR-002, ADR-007).
 *
 * Este paquete expone UNA sola forma de leer o escribir: `conTenant(tenantId, trabajo)`.
 * Abre una transacción, fija `app.tenant_id` con alcance LOCAL (muere con la
 * transacción, no se filtra a la siguiente petición que reuse la conexión) y le da
 * `trabajo` el cliente de esa transacción. Por eso olvidarse del tenant es imposible:
 * no hay otro cliente que pedir. Y si alguien lo lograra, la RLS forzada de la base
 * devuelve cero filas y rechaza la escritura (fail-closed, regla 4).
 *
 * Solo lo importa `packages/application` (§9.2 regla 2).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "./generated/client.ts";

export type Transaccion = Prisma.TransactionClient;
export type {
  AuditEntry,
  Branch,
  ExchangeRate,
  ExchangeRateConfirmation,
  TaxRate,
  Payment,
  CashShift,
  BankHoliday,
  ParkTariffVersion,
  Prisma,
  Tenant,
} from "./generated/client.ts";
export { errorDeBase, type ErrorDeBase, type MotivoDeBase } from "./errores.ts";

export interface Base {
  /** Ejecuta `trabajo` en una transacción que solo ve y solo escribe filas de `tenantId`. */
  conTenant<T>(tenantId: string, trabajo: (tx: Transaccion) => Promise<T>): Promise<T>;
  cerrar(): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Abre la base con `url` y comprueba, antes de devolver nada, que ese usuario NO puede
 * saltarse la RLS. Un superusuario o un rol con BYPASSRLS la ignoran aunque esté
 * forzada: conectarse así por un error de configuración apagaría el aislamiento en
 * silencio. Se niega a arrancar.
 */
export async function abrirBase(url: string | undefined): Promise<Base> {
  if (!url) throw new Error("abrirBase: falta la URL de la base de datos.");

  const cliente = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const papel = await cliente.$queryRaw<{ usuario: string; rolsuper: boolean; rolbypassrls: boolean }[]>`
    SELECT current_user AS usuario, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  const yo = papel[0];
  if (!yo || yo.rolsuper || yo.rolbypassrls) {
    await cliente.$disconnect();
    throw new Error(
      `abrirBase: el usuario «${yo?.usuario ?? "?"}» se salta la RLS (superusuario o BYPASSRLS). ` +
        "La aplicación se conecta como l2_app.",
    );
  }

  return {
    async conTenant(tenantId, trabajo) {
      if (!UUID.test(tenantId)) throw new Error(`conTenant: «${tenantId}» no es un tenant válido.`);
      return cliente.$transaction(async (tx) => {
        // Parámetro, nunca texto concatenado. `true` = solo para esta transacción.
        await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return trabajo(tx);
      });
    },
    cerrar: () => cliente.$disconnect(),
  };
}
