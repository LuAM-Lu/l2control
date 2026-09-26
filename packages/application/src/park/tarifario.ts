/**
 * El tarifario del parque en el servidor — B0-5, F5-04.
 *
 * Publicar añade una versión; nunca reescribe la anterior (regla 5, la tabla lo impone).
 * El vigente es la versión más alta de la sucursal.
 */
import {
  problemasDe,
  TarifarioSchema,
  type Resultado,
  type TarifarioPublicadoDto,
} from "@l2/contracts";
import { errorDeBase, type Base, type ParkTariffVersion } from "@l2/database";
import type { Contexto } from "../contexto.ts";

export interface CasosTarifario {
  /** El tarifario vigente de la sucursal, o `null` si nunca se publicó ninguno. */
  leer(ctx: Contexto): Promise<TarifarioPublicadoDto | null>;
  /**
   * Publica `entrada` como versión nueva. El servidor SIEMPRE revalida con el contrato,
   * aunque la pantalla ya lo hiciera (ADR-017): lo que llega del navegador no es de fiar.
   */
  publicar(ctx: Contexto, entrada: unknown): Promise<Resultado<TarifarioPublicadoDto>>;
}

export function casosTarifario(base: Base): CasosTarifario {
  return {
    async leer(ctx) {
      const fila = await base.conTenant(ctx.tenantId, (tx) =>
        tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, orderBy: { version: "desc" } }),
      );
      return fila ? publicado(fila) : null;
    },

    async publicar(ctx, entrada) {
      const validado = TarifarioSchema.safeParse(entrada);
      if (!validado.success) {
        return {
          ok: false,
          motivo: "INVALIDO",
          mensaje: "El tarifario no se publicó: hay datos que corregir.",
          problemas: problemasDe(validado.error),
        };
      }

      try {
        const fila = await base.conTenant(ctx.tenantId, async (tx) => {
          const vigente = await tx.parkTariffVersion.findFirst({
            where: { branchId: ctx.branchId },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          return tx.parkTariffVersion.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              version: (vigente?.version ?? 0) + 1,
              content: validado.data,
            },
          });
        });
        return { ok: true, valor: publicado(fila) };
      } catch (e) {
        switch (errorDeBase(e)?.motivo) {
          // Dos publicaciones a la vez calcularon la misma versión: gana la primera.
          case "DUPLICADO":
            return {
              ok: false,
              motivo: "CONFLICTO",
              mensaje: "Alguien publicó otro tarifario al mismo tiempo. Vuelve a cargar y revisa antes de publicar.",
            };
          case "REFERENCIA_INVALIDA":
            return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "La sucursal no existe en este local." };
          default:
            throw e;
        }
      }
    },
  };
}

/**
 * La fila, revalidada. Si lo guardado ya no cumple el contrato (porque el contrato cambió
 * después), se niega en vez de vender con un tarifario que el sistema no entiende.
 */
function publicado(fila: ParkTariffVersion): TarifarioPublicadoDto {
  const tarifario = TarifarioSchema.safeParse(fila.content);
  if (!tarifario.success) {
    throw new Error(
      `El tarifario v${fila.version} guardado no cumple el contrato actual; hay que publicar uno nuevo.`,
    );
  }
  return { version: fila.version, publishedAt: fila.publishedAt.toISOString(), tarifario: tarifario.data };
}
