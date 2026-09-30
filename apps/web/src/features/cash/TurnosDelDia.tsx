"use client";

import Link from "next/link";
import type { Route } from "next";
import { CircleCheckBig, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ResumenDelDiaDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { money, toMajor } from "@l2/domain-money";
import { MoneyDisplay, cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";

/**
 * Los turnos del día en Inicio — JORNADA §5, C6, B3-5.
 *
 * Cada turno con su equipo, su cajera y cómo va: abierto, o cerrado con su diferencia de arqueo y
 * quién firmó el Z. Supervisión cierra desde aquí el de otro equipo (la cajera se fue o el equipo
 * falló), con el mismo arqueo.
 */
export function TurnosDelDia({
  turnos,
  hoy,
  className,
}: {
  /** Los del día de negocio y, delante, los que siguen abiertos de un día anterior. */
  turnos: ResumenDelDiaDto["turnos"];
  /** El día de negocio de hoy: un turno de otro día se dice con su fecha. */
  hoy: string | null;
  className?: string;
}) {
  const actor = useActorEnSesion();
  const cierraAjenos = actor ? can(actor, "turno.corteZ") === "PERMITIDO" : false;
  const { ajustes } = useSucursal();
  return (
    <section className={cn("flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card xl:p-4.5", className)}>
      <h2 className="font-display mb-0.5 flex items-baseline gap-2 text-base font-bold text-ink">
        Turnos del día
        <span className="tnum text-[13px] font-medium text-ink-3">{turnos.length}</span>
      </h2>
      <p className="mb-3 text-xs text-ink-3">Cada caja, quién la abrió y cómo cerró.</p>
      {turnos.length === 0 ? (
        <p className="text-[13px] text-ink-3">Ningún turno abierto hoy.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/60">
          {turnos.map(({ turno: t, diferenciaEnDolares, firma }) => {
            const cerrado = t.estado === "CERRADO_Z";
            const dif = diferenciaEnDolares ? money(BigInt(diferenciaEnDolares.minor), "USD") : null;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[13px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{t.punto}</span>
                  <span className="tnum block text-[12px] text-ink-3">
                    {t.abiertoPor.name} · {formatClock(Date.parse(t.abiertoEn), ajustes.formatoHora, ajustes.zonaHoraria)}
                    {t.businessDate !== hoy ? ` del ${t.businessDate.split("-").reverse().join("/")}` : ""}
                    {t.cerradoEn ? ` a ${formatClock(Date.parse(t.cerradoEn), ajustes.formatoHora, ajustes.zonaHoraria)}` : ""}
                  </span>
                </span>
                {cerrado ? (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className={cn("inline-flex items-center gap-1 text-[12px] font-semibold", dif && dif.amount > 0n ? "text-state-warn" : "text-state-ok")}>
                      {dif && dif.amount > 0n ? <TriangleAlert size={13} aria-hidden="true" /> : <CircleCheckBig size={13} aria-hidden="true" />}
                      {dif === null ? "Sin medir" : dif.amount === 0n ? "Cuadró" : <MoneyDisplay value={toMajor(dif)} currency="USD" size="sm" />}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                      {firma === "SUPERVISION" ? <ShieldCheck size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                      {firma === "SUPERVISION" ? "Z con supervisión" : "Z de la cajera"}
                    </span>
                  </span>
                ) : cierraAjenos ? (
                  <Link
                    href={`/turno?turno=${t.id}` as Route}
                    className="inline-flex min-h-8 items-center rounded-[var(--radius-control)] border border-line px-3 text-[12.5px] font-semibold text-ink hover:border-line-strong"
                  >
                    Abierto · cerrar
                  </Link>
                ) : (
                  <span className="text-[12px] font-semibold text-state-ok">Abierto</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
