/**
 * La aplicación: los casos de uso, agrupados por dominio (§9.1), sobre una sola conexión.
 *
 *   const app = await conectar(entorno.L2_DB_APP_URL);
 *   await app.tarifario.publicar(ctx, datos);
 *
 * Las apps solo llegan a la base por aquí (`pnpm arch` lo impone).
 */
import { abrirBase } from "@l2/database";
import { casosTarifario, type CasosTarifario } from "./park/tarifario.ts";
import { casosSucursal, type CasosSucursal } from "./sucursal/sucursal.ts";
import { casosAuditoria, type CasosAuditoria } from "./auditoria/consultas.ts";

export type { Contexto } from "./contexto.ts";
export type { CasosTarifario } from "./park/tarifario.ts";
export type { CasosSucursal } from "./sucursal/sucursal.ts";
export type { CasosAuditoria, FiltroAuditoria } from "./auditoria/consultas.ts";
export type { AccionAuditada } from "./auditoria/auditar.ts";

export interface Aplicacion {
  readonly tarifario: CasosTarifario;
  readonly sucursal: CasosSucursal;
  readonly auditoria: CasosAuditoria;
  cerrar(): Promise<void>;
}

/** Abre la base (y se niega si el usuario se salta la RLS) y devuelve los casos de uso. */
export async function conectar(urlBase: string | undefined): Promise<Aplicacion> {
  const base = await abrirBase(urlBase);
  return {
    tarifario: casosTarifario(base),
    sucursal: casosSucursal(base),
    auditoria: casosAuditoria(base),
    cerrar: () => base.cerrar(),
  };
}
