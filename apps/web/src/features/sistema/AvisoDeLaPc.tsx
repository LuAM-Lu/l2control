"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import type { AvisoDeRespaldosDelTurnoDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { rutaPestana } from "../shell/navigation.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * La PC del local que no baja los respaldos (B5-7, M-40), en la apertura y el cierre del turno. Solo la ven
 * administración y supervisión (el servidor no se la da a nadie más), con «Cómo se arregla». Se quita sola cuando la PC
 * baja el de anoche y su huella cuadra. `plegado`: «Cómo se arregla» se abre al tocarlo (en el cierre, que tiene sus pasos).
 */
export function AvisoDeLaPc({ aviso, plegado = false, className }: { aviso: AvisoDeRespaldosDelTurnoDto | null; plegado?: boolean; className?: string }) {
  const actor = useActorEnSesion();
  const { ajustes } = useSucursal();
  if (!aviso) return null;
  // Respaldos es de administración; supervisión se lo dice.
  const decide = actor ? can(actor, "sistema.actualizar") !== "DENEGADO" : false;
  const dia = aviso.ultimaVez
    ? new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", timeZone: ajustes.zonaHoraria }).format(Date.parse(aviso.ultimaVez))
    : null;
  const titulo = !aviso.pc
    ? "Ninguna PC del local baja los respaldos"
    : dia
      ? `La PC «${aviso.pc.nombre}» no baja los respaldos desde el ${dia}`
      : `La PC «${aviso.pc.nombre}» todavía no ha bajado ningún respaldo`;
  // La carpeta de la PC dice con qué usuario de Windows se preparó (C:\Users\<usuario>\…).
  const usuario = aviso.pc?.carpeta?.match(/\\Users\\([^\\]+)/i)?.[1] ?? null;
  const pasos: readonly ReactNode[] = aviso.pc
    ? [
        <>
          Enciende la PC <b className="text-ink">«{aviso.pc.nombre}»</b> y entra con el usuario de Windows que la preparó
          {usuario ? <> (el de la carpeta «{usuario}»)</> : aviso.pc.carpeta ? <> (guarda en «{aviso.pc.carpeta}»)</> : null}.
        </>,
        <>
          Abre el menú Inicio, escribe <b className="text-ink">Programador de tareas</b> y busca <b className="text-ink">«L2 Control - Respaldos»</b>.
          Tócala con el botón derecho y elige <b className="text-ink">Ejecutar</b>.
        </>,
        <>Si dice que falló, vuelve a prepararla desde Ajustes → Sistema → Respaldos → «Cambiar de PC» (te da la orden para pegar).</>,
        <>El aviso se quita solo cuando la PC baja el respaldo de anoche y su huella cuadra.</>,
      ]
    : [
        <>En Ajustes → Sistema → Respaldos, «Preparar una PC del local»: te da una orden y una credencial.</>,
        <>
          En esa PC, abre <b className="text-ink">PowerShell</b> y pega la orden: deja la tarea «L2 Control - Respaldos», que los baja sola cada día.
        </>,
        <>El aviso se quita solo cuando la PC baja el respaldo de anoche y su huella cuadra.</>,
      ];
  const lista = (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-detalle text-ink-2">
      {pasos.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ol>
  );
  return (
    <section role="status" className={cn("flex flex-col gap-2 rounded-[var(--radius-card)] border border-state-warn/40 bg-state-warn-bg p-4", className)}>
      <h2 className="flex items-start gap-1.5 font-display text-sm font-bold text-state-warn">
        <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        {titulo}
      </h2>
      <p className="text-detalle text-ink-2">
        El servidor sí los hace cada noche. Si se perdiera el servidor, {dia ? `la última copia en el local sería la del ${dia}` : "no habría ninguna copia en el local"}.
      </p>
      {plegado ? (
        <details className="group">
          <summary className="cursor-pointer text-detalle font-semibold text-ink underline-offset-2 hover:underline">Cómo se arregla</summary>
          <div className="mt-2">{lista}</div>
        </details>
      ) : (
        <>
          <span className="text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">Cómo se arregla</span>
          {lista}
        </>
      )}
      {decide ? (
        <Link
          href={rutaPestana("ajustes", "sistema", "respaldos")}
          className="group inline-flex min-h-11 items-center gap-1.5 self-start rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
        >
          Ir a Respaldos
          <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-detalle text-ink-3">Si no puedes en esa PC, avísale a administración: Respaldos es suyo.</p>
      )}
    </section>
  );
}
