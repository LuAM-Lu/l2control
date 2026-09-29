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
import pg from "pg";
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
  Guardian,
  Kid,
  ParkSession,
  ParkSessionExtension,
  OutboxEvent,
  ParkTariffVersion,
  Product,
  ProductPrice,
  Prisma,
  Sale,
  SalePrint,
  SaleVoid,
  ShiftCount,
  ShiftCut,
  Tenant,
} from "./generated/client.ts";
export { errorDeBase, type ErrorDeBase, type MotivoDeBase } from "./errores.ts";

export interface Base {
  /** Ejecuta `trabajo` en una transacción que solo ve y solo escribe filas de `tenantId`. */
  conTenant<T>(tenantId: string, trabajo: (tx: Transaccion) => Promise<T>): Promise<T>;
  /**
   * Escucha los avisos de la base en `canal` (`LISTEN`, B5-1) con una conexión propia, fuera de
   * toda transacción: un aviso llega al confirmarse la transacción que lo dio. No lleva datos ni
   * pasa por la RLS; quien lo recibe lee lo que toque con `conTenant`. `alCaer` avisa si la
   * conexión se pierde (entonces hay que volver a escuchar). Devuelve cómo dejar de escuchar.
   */
  escuchar(canal: string, alAviso: (carga: string) => void, alCaer?: (error: Error) => void): Promise<() => Promise<void>>;
  cerrar(): Promise<void>;
}

/** Un canal de `LISTEN` es un identificador: nunca texto libre concatenado en SQL. */
const CANAL = /^[a-z_][a-z0-9_]{0,62}$/;

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
    async escuchar(canal, alAviso, alCaer) {
      if (!CANAL.test(canal)) throw new Error(`escuchar: «${canal}» no es un canal válido.`);
      const oyente = new pg.Client({ connectionString: url });
      let cerrado = false;
      oyente.on("notification", (n) => {
        if (n.channel === canal) alAviso(n.payload ?? "");
      });
      oyente.on("error", (e) => {
        if (!cerrado) alCaer?.(e);
      });
      oyente.on("end", () => {
        if (!cerrado) alCaer?.(new Error("escuchar: la conexión con la base se cerró."));
      });
      await oyente.connect();
      await oyente.query(`LISTEN ${canal}`);
      return async () => {
        cerrado = true;
        await oyente.end().catch(() => undefined);
      };
    },
    cerrar: () => cliente.$disconnect(),
  };
}
