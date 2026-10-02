/**
 * El tarifario del parque en el servidor — B0-5, F5-04.
 *
 * Publicar añade una versión; nunca reescribe la anterior (regla 5, la tabla lo impone).
 * El vigente es la versión más alta de la sucursal.
 */
import {
  PaginaDeVersionesTarifarioSchema,
  problemasDe,
  TarifarioSchema,
  VersionesTarifarioQuerySchema,
  type PaginaDeVersionesTarifarioDto,
  type PricePackageDto,
  type Resultado,
  type TarifarioDto,
  type TarifarioPublicadoDto,
} from "@l2/contracts";
import { importeVE } from "@l2/domain-printing";
import { errorDeBase, type Base, type ParkTariffVersion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso } from "../identidad/actor.ts";

export interface CasosTarifario {
  /** El tarifario vigente de la sucursal, o `null` si nunca se publicó ninguno. */
  leer(ctx: Contexto): Promise<TarifarioPublicadoDto | null>;
  /**
   * Publica `entrada` como versión nueva. El servidor SIEMPRE revalida con el contrato,
   * aunque la pantalla ya lo hiciera (ADR-017): lo que llega del navegador no es de fiar.
   */
  publicar(ctx: Contexto, entrada: unknown): Promise<Resultado<TarifarioPublicadoDto>>;
  /**
   * El historial de versiones por páginas (T-7, `VersionesTarifarioQuerySchema`): de la más nueva a la
   * más vieja, con quién la publicó y qué cambió respecto de la anterior. Lo lee cualquiera, como `leer`.
   */
  versiones(ctx: Contexto, entrada: unknown): Promise<Resultado<PaginaDeVersionesTarifarioDto>>;
}

export function casosTarifario(base: Base): CasosTarifario {
  return {
    async leer(ctx) {
      const fila = await base.conTenant(ctx.tenantId, (tx) =>
        tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId }, orderBy: { version: "desc" } }),
      );
      return fila ? publicado(fila) : null;
    },

    async versiones(ctx, entrada) {
      const v = VersionesTarifarioQuerySchema.safeParse(entrada ?? {});
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "La consulta no es válida.", problemas: problemasDe(v.error) };
      const { filas, nombres } = await base.conTenant(ctx.tenantId, async (tx) => {
        const filas = await tx.parkTariffVersion.findMany({ where: { branchId: ctx.branchId }, orderBy: { version: "asc" } });
        const ids = [...new Set(filas.flatMap((f) => (f.publishedBy ? [f.publishedBy] : [])))];
        const personas = ids.length > 0 ? await tx.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
        return { filas, nombres: new Map(personas.map((p) => [p.id, p.fullName])) };
      });
      // Cada versión se compara con la anterior: lo que cambió se dice en palabras.
      const leidas = filas.map((f) => ({ fila: f, t: TarifarioSchema.safeParse(f.content) }));
      const versiones = leidas
        .map(({ fila, t }, i) => {
          const antes = i > 0 ? leidas[i - 1]!.t : null;
          return {
            version: fila.version,
            publicadoEn: fila.publishedAt.toISOString(),
            publicadoPor: fila.publishedBy ? (nombres.get(fila.publishedBy) ?? "Persona desconocida") : "Consola del servidor",
            aLaVenta: t.success ? t.data.packages.filter((p) => p.active).length : 0,
            cambios: !t.success
              ? ["Esta versión no cumple el contrato actual"]
              : !antes
                ? [`Primera publicación: ${t.data.packages.filter((p) => p.active).length} paquetes a la venta`]
                : antes.success
                  ? cambiosDeTarifario(antes.data, t.data)
                  : ["Sustituye a una versión que no cumplía el contrato"],
          };
        })
        .reverse();
      const paginas = Math.max(1, Math.ceil(versiones.length / v.data.porPagina));
      const pagina = Math.min(v.data.pagina, paginas);
      return {
        ok: true,
        valor: PaginaDeVersionesTarifarioSchema.parse({
          versiones: versiones.slice((pagina - 1) * v.data.porPagina, pagina * v.data.porPagina),
          total: versiones.length,
          pagina,
        }),
      };
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
          // Cambiar precios es de administración (§7.3, catalogo.modificar), con elevación (F2-04).
          const rechazo = await exigirPermiso(tx, ctx, "catalogo.modificar");
          if (rechazo) return rechazo;
          const vigente = await tx.parkTariffVersion.findFirst({
            where: { branchId: ctx.branchId },
            orderBy: { version: "desc" },
            select: { version: true },
          });
          const nueva = await tx.parkTariffVersion.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              version: (vigente?.version ?? 0) + 1,
              content: validado.data,
              publishedBy: ctx.quien?.userId ?? null,
            },
          });
          // §7.4: todo cambio de tarifa se audita, con lo que había y lo que queda.
          const anterior = vigente
            ? await tx.parkTariffVersion.findFirst({ where: { branchId: ctx.branchId, version: vigente.version } })
            : null;
          await auditar(tx, ctx, {
            action: "tarifario.publicar",
            entityType: "park_tariff_version",
            entityId: nueva.id,
            before: anterior ? { version: anterior.version, tarifario: anterior.content } : null,
            after: { version: nueva.version, tarifario: nueva.content },
          });
          return nueva;
        });
        if ("ok" in fila) {
          // Pedir la elevación no es un intento indebido; un permiso que falta, sí.
          if (fila.motivo === "NO_PERMITIDO") {
            await auditarRechazo(base, ctx, { action: "tarifario.publicar", reason: fila.mensaje });
          }
          return fila;
        }
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

const usd = (minor: string) => importeVE(BigInt(minor), "USD");
const duracion = (d: PricePackageDto["duration"]) => (d.kind === "openEnded" ? "tiempo libre" : d.minutes % 60 === 0 ? `${d.minutes / 60} h` : `${d.minutes} min`);

/** Lo que cambió de un tarifario a otro, en palabras de quien lo revisa: paquetes y reglas. */
export function cambiosDeTarifario(antes: TarifarioDto, despues: TarifarioDto): string[] {
  const cambios: string[] = [];
  const previos = new Map(antes.packages.map((p) => [p.id, p]));
  for (const p of despues.packages) {
    const a = previos.get(p.id);
    if (!a) {
      cambios.push(`Nuevo paquete «${p.name}» (${duracion(p.duration)}) a ${usd(p.price.minor)}`);
      continue;
    }
    if (a.active && !p.active) cambios.push(`«${p.name}» se retiró de la venta`);
    if (!a.active && p.active) cambios.push(`«${p.name}» vuelve a la venta`);
    if (a.name !== p.name) cambios.push(`«${a.name}» ahora se llama «${p.name}»`);
    if (a.price.minor !== p.price.minor) cambios.push(`«${p.name}»: ${usd(a.price.minor)} → ${usd(p.price.minor)}`);
    if (JSON.stringify(a.duration) !== JSON.stringify(p.duration)) cambios.push(`«${p.name}»: ${duracion(a.duration)} → ${duracion(p.duration)}`);
    if (a.mode !== p.mode) cambios.push(`«${p.name}» se paga ${p.mode === "PREPAGO" ? "al entrar" : "al salir"}`);
  }
  const r0 = antes.policy;
  const r1 = despues.policy;
  if (r0.graceMinutes !== r1.graceMinutes) cambios.push(`Gracia: ${r0.graceMinutes} → ${r1.graceMinutes} min`);
  if (r0.penaltyBlockMinutes !== r1.penaltyBlockMinutes) cambios.push(`Bloque de excedente: ${r0.penaltyBlockMinutes} → ${r1.penaltyBlockMinutes} min`);
  if (r0.penaltyPricePerBlock.minor !== r1.penaltyPricePerBlock.minor) {
    cambios.push(`Precio por bloque: ${usd(r0.penaltyPricePerBlock.minor)} → ${usd(r1.penaltyPricePerBlock.minor)}`);
  }
  if (r0.warnBeforeMinutes !== r1.warnBeforeMinutes) cambios.push(`Aviso de «por vencer»: ${r0.warnBeforeMinutes} → ${r1.warnBeforeMinutes} min`);
  if (r0.capacityLimit !== r1.capacityLimit) cambios.push(`Aforo: ${r0.capacityLimit} → ${r1.capacityLimit} niños`);
  return cambios.length > 0 ? cambios : ["Sin cambios de precios ni reglas"];
}

