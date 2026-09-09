"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, TriangleAlert, Wifi } from "lucide-react";
import { Initial, cn } from "@l2/ui";

/**
 * Barra permanente de las estaciones — §8.5.
 *
 * Es lo ÚNICO que la cáscara de estación aporta, y a propósito: una estación
 * se opera a pantalla completa. Meterle una barra lateral le roba espacio y
 * le da aire de herramienta administrativa (§9.10.2).
 *
 * Lo que sí tiene que estar siempre a la vista, porque el operador no debe
 * buscarlo: **con qué tasa está cobrando, si el turno está abierto, si hay
 * conexión y quién es**. Antes cada pantalla lo repetía a su manera; ahora
 * vive aquí una sola vez.
 */

const SUPERFICIE: Record<string, string> = {
  "/acceso": "Acceso",
  "/monitor": "Monitor de parque",
  "/entrada": "Entrada al parque",
  "/salida": "Salida del parque",
  "/caja": "Caja",
  "/turno": "Turno de caja",
};

export type ContextoEstacion = {
  usuario: string;
  rol: string;
  turnoAbierto: string | null;
  tasa: string | null;
  tasaHora: string | null;
  /** Nivel de degradación de ADR-003. */
  conexion: "N0" | "N1" | "N2" | "N3";
};

export function StationBar({ contexto }: { contexto: ContextoEstacion }) {
  const pathname = usePathname();

  // La pantalla de acceso no lleva barra: todavía no se sabe quién entra, y
  // enseñar el turno o la tasa antes de autenticar no aporta nada.
  if (pathname === "/acceso") return null;

  const sinTasa = contexto.tasa === null;
  const sinTurno = contexto.turnoAbierto === null;
  const alerta = sinTasa || sinTurno || contexto.conexion !== "N0";

  return (
    <div
      className={cn(
        "sticky top-0 z-20 flex h-11 items-center gap-x-5 gap-y-1 border-b px-4 text-[12.5px]",
        alerta ? "border-state-warn/30 bg-state-warn-bg/40" : "border-line bg-surface/60",
        "backdrop-blur-sm",
      )}
    >
      <Link
        href="/"
        className="font-display shrink-0 text-[13px] font-bold text-ink no-underline"
      >
        L2
      </Link>

      <span className="shrink-0 text-ink-2">{SUPERFICIE[pathname] ?? ""}</span>

      <span className="ml-auto flex items-center gap-x-5 overflow-hidden">
        {/* Turno: sin él no se puede cobrar, así que se dice, no se calla. */}
        {sinTurno ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-state-crit">
            <TriangleAlert size={13} aria-hidden="true" />
            Turno sin abrir
          </span>
        ) : (
          <span className="hidden shrink-0 whitespace-nowrap text-ink-3 sm:inline">
            Turno <span className="tnum text-ink-2">{contexto.turnoAbierto}</span>
          </span>
        )}

        {/* ADR-005: con qué tasa se está cobrando, siempre visible. */}
        {sinTasa ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-state-crit">
            <TriangleAlert size={13} aria-hidden="true" />
            Sin tasa del día
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-ink-3">
            <span className="tnum text-ink-2">{contexto.tasa} Bs</span>
            <span className="tnum ml-1">· {contexto.tasaHora}</span>
          </span>
        )}

        <span
          className={cn(
            "hidden shrink-0 items-center gap-1.5 whitespace-nowrap sm:flex",
            contexto.conexion === "N0" ? "text-ink-3" : "text-state-warn",
          )}
        >
          <Wifi size={13} aria-hidden="true" />
          {contexto.conexion === "N0" ? "En línea" : "Sin internet"}
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <Initial name={contexto.usuario} tone="idle" className="size-6 rounded-md text-[11px]" />
          <span className="hidden whitespace-nowrap text-ink-2 md:inline">{contexto.usuario}</span>
          <Link
            href="/acceso"
            aria-label="Cambiar de usuario"
            title="Cambiar de usuario"
            className="grid size-7 place-content-center rounded text-ink-3 transition-colors hover:text-ink"
          >
            <LogOut size={14} aria-hidden="true" />
          </Link>
        </span>
      </span>
    </div>
  );
}
