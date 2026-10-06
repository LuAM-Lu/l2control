"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Cake, Hourglass } from "lucide-react";
import type { ReservaEventoDto } from "@l2/contracts";
import { cn } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { ESTADO, horario } from "./formato.ts";

/**
 * «Hoy hay un cumpleaños» (B10-1): en la cabecera de Inicio y en la apertura del turno, para que quien
 * abre el local lo sepa antes de empezar. No es un estado (ni bien ni mal): va en el color de la marca,
 * con su icono y su texto, y lleva a la agenda. Sin cumpleaños hoy no se pinta nada.
 */
const AGENDA = "/panel/parque/eventos" as Route;

/** El chip de la cabecera de Inicio. */
export function ChipEventosDeHoy({ reservas, className }: { reservas: readonly ReservaEventoDto[]; className?: string }) {
  const { formatoHora } = useSucursal().ajustes;
  if (reservas.length === 0) return null;
  const primero = reservas[0]!;
  return (
    <Link
      href={AGENDA}
      className={cn(
        "group inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border border-brand/40 bg-brand/20 px-3 py-1.5 text-xs font-medium text-ink shadow-sm transition-colors duration-[var(--dur-rapida)] hover:bg-brand/20 focus-visible:outline-2 focus-visible:outline-brand lg:text-[13px]",
        className,
      )}
    >
      <Cake size={14} className="text-brand" aria-hidden="true" />
      <span className="tnum">
        {reservas.length === 1
          ? `Hoy: cumpleaños de ${primero.cumpleanero} · ${horario(primero.inicio, primero.fin, formatoHora).split(" – ")[0]}`
          : `Hoy: ${reservas.length} cumpleaños · el primero a las ${horario(primero.inicio, primero.fin, formatoHora).split(" – ")[0]}`}
      </span>
      <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/** La tarjeta de la apertura del turno: cada cumpleaños de hoy con su horario, invitados y anticipo. */
export function TarjetaEventosDeHoy({ reservas }: { reservas: readonly ReservaEventoDto[] }) {
  const { formatoHora } = useSucursal().ajustes;
  if (reservas.length === 0) return null;
  return (
    <section aria-label="Cumpleaños de hoy" className="rounded-[var(--radius-card)] border border-brand/40 bg-brand/8 p-4">
      <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-ink">
        <Cake size={15} className="text-brand" aria-hidden="true" />
        {reservas.length === 1 ? "Hoy hay un cumpleaños" : `Hoy hay ${reservas.length} cumpleaños`}
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
        {reservas.map((r) => (
          <li key={r.id} className="text-ink-2">
            <span className="tnum font-semibold text-ink">{horario(r.inicio, r.fin, formatoHora)}</span> · {r.cumpleanero} · {r.paquete.name} ·{" "}
            <span className="tnum">{r.invitados}</span> invitados
            {r.estado === "ANTICIPO_POR_COBRAR" && (
              <span className="ml-1 inline-flex items-center gap-1 font-semibold text-state-warn">
                <Hourglass size={12} aria-hidden="true" />
                {ESTADO[r.estado].texto.toLowerCase()}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link href={AGENDA} className="mt-2 inline-block text-[12px] font-semibold text-brand underline-offset-2 hover:underline">
        Ver la agenda
      </Link>
    </section>
  );
}
