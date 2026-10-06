/**
 * La comprobación de salud del servidor web (T-8a, ADR-028).
 *
 * El despliegue la pregunta tras poner una versión nueva: si la base no responde con el usuario de la
 * aplicación y dentro de la transacción del local, la versión no sirve y vuelve sola a la anterior.
 * No lee ni dice nada del negocio: solo si la consulta llega y vuelve.
 */
import type { Base } from "@l2/database";

export interface CasosSalud {
  /** `true` si la base responde dentro de la transacción de `tenantId` (con su RLS). */
  comprobar(tenantId: string): Promise<boolean>;
}

export function casosSalud(base: Base): CasosSalud {
  return {
    async comprobar(tenantId) {
      try {
        const filas = await base.conTenant(tenantId, (tx) => tx.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`);
        return filas[0]?.ok === 1;
      } catch {
        // Fail-closed: lo que no responde no está sano. El porqué lo cuenta el registro de la base.
        return false;
      }
    },
  };
}
