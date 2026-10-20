/**
 * El cierre del parque — B4-21 (M-40).
 *
 * La jornada de la monitora, como el corte de la caja y **sin montos**: del día de negocio de hoy, las cifras (niños,
 * familias, el máximo a la vez, la estancia promedio y los que siguen en la sala), cada familia con sus niños (pulsera,
 * entrada y salida, paquete, tiempo real, tiempo de más, quién lo recogió y su mesa), lo que pide atención, los
 * cumpleaños de hoy (reservados y entrados), las pulseras usadas y los pares de medias. Lo ve quien atiende el parque
 * (`parque.checkIn`) en cualquier momento; el PDF de cierre sale con la sala en cero (lo decide la pantalla). El teléfono
 * del representante va a medias: el completo está en Clientes.
 */
import { CierreDelParqueSchema, type AtencionDelCierreDto, type CierreDelParqueDto, type NinoDelCierreDto, type Rechazo, type Resultado } from "@l2/contracts";
import { businessDayAt, businessDayEnd } from "@l2/domain-cash";
import { picoDeAforo, telefonoLegible } from "@l2/domain-park";
import { addDays } from "@l2/domain-rates";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { existenciasDe } from "../inventario/existencias.ts";
import { reservasDe } from "../park/eventos.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";

const MIN = 60_000;

export interface CasosCierreDelParque {
  /** El cierre del parque del día de negocio de hoy (ver arriba). */
  cierreDelParque(ctx: Contexto, ahora?: number): Promise<Resultado<CierreDelParqueDto>>;
}

/** El teléfono a medias («0414-•••-0142»): se reconoce sin enseñarlo entero. */
export function telefonoAMedias(telefono: string): string {
  const legible = telefonoLegible(telefono) ?? telefono;
  const d = legible.replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-•••-${d.slice(-4)}` : "•••";
}

export function casosCierreDelParque(base: Base): CasosCierreDelParque {
  return {
    async cierreDelParque(ctx, ahora = Date.now()) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<CierreDelParqueDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "parque.checkIn");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const dia = businessDayAt(ahora, ajustes.zonaHoraria, ajustes.finDelDiaMin);
        const inicio = new Date(businessDayEnd(addDays(dia, -1), ajustes.zonaHoraria, ajustes.finDelDiaMin));

        const estancias = await tx.parkSession.findMany({
          where: { branchId: ctx.branchId, startedAt: { gte: inicio } },
          include: { kid: { select: { name: true, nickname: true } }, guardian: { select: { fullName: true, contactReference: true } }, pauses: true, extensions: { orderBy: { createdAt: "asc" } } },
          orderBy: [{ startedAt: "asc" }, { id: "asc" }],
        });
        // Las que quedaron de otro día sin salida: a revisar (la dirección las cierra), no son de hoy.
        const deOtroDia = { branchId: ctx.branchId, status: "ACTIVA", startedAt: { lt: inicio } } as const;
        const olvidadas = await tx.parkSession.count({ where: deOtroDia });
        const primera = olvidadas > 0 ? await tx.parkSession.findFirst({ where: deOtroDia, include: { kid: { select: { name: true, nickname: true } } }, orderBy: { startedAt: "asc" } }) : null;

        const pausaMs = (e: (typeof estancias)[number]) => {
          const pausa = e.pauses.find((x) => x.kind === "PAUSA");
          if (!pausa) return 0;
          const reanuda = e.pauses.find((x) => x.kind === "REANUDA");
          const tope = pausa.at.getTime() + (pausa.maxMinutes ?? 0) * MIN;
          const hasta = Math.min(reanuda?.at.getTime() ?? tope, tope, e.endedAt?.getTime() ?? ahora);
          return Math.max(0, hasta - pausa.at.getTime());
        };
        const anulada = (e: { closureKind: string | null }) => e.closureKind === "ANULADA";
        const usado = (e: (typeof estancias)[number]) => Math.max(0, Math.round(((e.endedAt?.getTime() ?? ahora) - e.startedAt.getTime() - pausaMs(e)) / MIN));
        const nombre = (e: { kid: { name: string; nickname: string | null } | null }) => e.kid?.name ?? e.kid?.nickname ?? "Sin nombre";
        const validas = estancias.filter((e) => !anulada(e));

        // La mesa de cada niño: las cuentas de mesa de hoy con su pulsera (en su última versión, cerrada o no).
        const mesas = await tx.$queryRaw<{ content: unknown }[]>`
          SELECT ultima.content FROM (
            SELECT DISTINCT ON (v.account_id) v.account_id, v.content
            FROM account_version v JOIN account a ON a.tenant_id = v.tenant_id AND a.id = v.account_id
            WHERE a.branch_id = ${ctx.branchId}::uuid AND a.kind = 'MESA' AND a.opened_at >= ${inicio}
            ORDER BY v.account_id, v.version DESC
          ) ultima`;
        const mesaDe = new Map<string, string>();
        for (const m of mesas) {
          const c = m.content as { tableLabel?: string; sessionIds?: string[] };
          for (const id of c.sessionIds ?? []) mesaDe.set(id, c.tableLabel ? `Mesa ${c.tableLabel}` : "Una mesa");
        }

        // Cada familia, en el orden en que llegó, con sus niños.
        const familias = new Map<string, { representante: string; telefono: string; ninos: NinoDelCierreDto[] }>();
        for (const e of estancias) {
          const f = familias.get(e.guardianId) ?? { representante: e.guardian.fullName, telefono: telefonoAMedias(e.guardian.contactReference), ninos: [] };
          const contratado = e.durationMinutes === null ? null : e.durationMinutes + e.extensions.reduce((n, x) => n + x.minutes, 0);
          const minutos = usado(e);
          const deMas = contratado !== null && e.status === "CERRADA" && !anulada(e) && minutos > contratado ? minutos - contratado : null;
          f.ninos.push({
            nombre: nombre(e),
            pulsera: e.wristbandCode,
            entrada: e.startedAt.toISOString(),
            salida: e.endedAt?.toISOString() ?? null,
            paquete: e.extensions.at(-1)?.packageName ?? e.packageName,
            minutos,
            deMas,
            recogio:
              e.status === "CERRADA" && e.closureKind === "SALIDA"
                ? e.pickedUpByGuardian === false
                  ? { nombre: e.pickedUpByName ?? "Otra persona", otro: true }
                  : { nombre: e.guardian.fullName, otro: false }
                : null,
            mesa: mesaDe.get(e.id) ?? null,
            anulada: anulada(e),
          });
          familias.set(e.guardianId, f);
        }

        // Lo que pide atención.
        const atencion: AtencionDelCierreDto[] = [];
        for (const e of estancias) {
          const n = nombre(e);
          if (e.pickedUpByGuardian === false) {
            atencion.push({ tipo: "OTRA_PERSONA", en: (e.endedAt ?? e.startedAt).toISOString(), nino: n, detalle: `Lo recogió ${e.pickedUpByName ?? "otra persona"}, no su representante` });
          }
          if (e.wristbandCode.startsWith("SP-")) atencion.push({ tipo: "SIN_PULSERA", en: e.startedAt.toISOString(), nino: n, detalle: `Entró sin pulsera: su código es ${e.wristbandCode}` });
          if (anulada(e)) {
            atencion.push({
              tipo: "ANULADA",
              en: (e.endedAt ?? e.startedAt).toISOString(),
              nino: n,
              detalle: `Entrada anulada${e.closedByName ? ` por ${e.closedByName}` : ""}${e.closureReason ? `: ${e.closureReason}` : ""}`.slice(0, 160),
            });
          }
          for (const x of e.extensions) atencion.push({ tipo: "MAS_TIEMPO", en: x.createdAt.toISOString(), nino: n, detalle: `Subió a ${x.packageName} (${x.createdByName})` });
        }
        // Las de otro día, en un renglón: la dirección las cierra en «estancias a revisar»; no cuentan en la sala de hoy.
        if (primera) {
          const n = olvidadas;
          atencion.push({
            tipo: "OLVIDADA",
            en: primera.startedAt.toISOString(),
            nino: n === 1 ? nombre(primera) : `${n} estancias de otro día`,
            detalle: `Sin salida desde el ${primera.startedAt.toISOString().slice(0, 10).split("-").reverse().join("/")}: a revisar`,
          });
        }
        atencion.sort((a, b) => a.en.localeCompare(b.en));

        // Los cumpleaños de hoy: los invitados reservados y los que entraron con él.
        const cumpleanos = (await reservasDe(tx, { branchId: ctx.branchId, eventDate: new Date(dia) }))
          .filter((x) => x.estado !== "CANCELADA")
          .map((x) => ({ cumpleanero: x.cumpleanero, reservados: x.invitados, entraron: validas.filter((e) => e.eventReservationId === x.id).length }));

        // Las pulseras usadas (también la de una entrada anulada: se gastó) y los pares de medias.
        const codigos = [...new Set(estancias.map((e) => e.wristbandCode).filter((c) => !c.startsWith("SP-")))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
        const versiones = await tx.accountVersion.findMany({
          where: { accountId: { in: [...new Set(estancias.map((e) => e.accountId))] } },
          orderBy: [{ accountId: "asc" }, { version: "desc" }],
          distinct: ["accountId"],
          select: { content: true },
        });
        const deHoy = new Set(estancias.map((e) => e.id));
        const pares = versiones.reduce(
          (n, v) => n + ((v.content as { lines?: { id: string; anulacion?: unknown }[] }).lines ?? []).filter((l) => l.id.startsWith("med-") && deHoy.has(l.id.slice(4)) && !l.anulacion).length,
          0,
        );
        let quedan: number | null = null;
        if (ajustes.productoMedias && (await tx.product.findUnique({ where: { id: ajustes.productoMedias }, select: { tracksStock: true } }))?.tracksStock) {
          quedan = (await existenciasDe(tx, ctx.branchId, [ajustes.productoMedias])).get(ajustes.productoMedias)?.quantity ?? 0;
        }

        const pico = picoDeAforo(validas.map((e) => ({ desde: e.startedAt.getTime(), hasta: e.endedAt?.getTime() ?? ahora })));
        const salieron = validas.filter((e) => e.status === "CERRADA" && e.closureKind === "SALIDA" && e.endedAt);
        return CierreDelParqueSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          dia,
          resumen: {
            ninos: validas.length,
            familias: new Set(validas.map((e) => e.guardianId)).size,
            pico: pico ? { ninos: pico.ninos, en: new Date(pico.en).toISOString() } : null,
            minutosPromedio: salieron.length === 0 ? null : Math.round(salieron.reduce((s, e) => s + usado(e), 0) / salieron.length),
            enSala: estancias.filter((e) => e.status === "ACTIVA").length,
          },
          familias: [...familias.values()],
          atencion,
          cumpleanos,
          pulseras: { usadas: codigos.length, desde: codigos[0] ?? null, hasta: codigos.at(-1) ?? null },
          medias: { pares, quedan },
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
