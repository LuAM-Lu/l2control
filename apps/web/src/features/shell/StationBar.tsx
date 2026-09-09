"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, LayoutDashboard, LogOut, TriangleAlert, Wifi } from "lucide-react";
import { Initial, cn } from "@l2/ui";

/**
 * Barra permanente de las estaciones — §8.5 y §9.10.2.
 *
 * Resuelve tres cosas que antes estaban rotas o repetidas:
 *
 *  1. **Volver tiene un solo destino.** Antes cada pantalla tenía su flecha y
 *     unas iban a `/` y otras a `/monitor`. Desde una estación se vuelve al
 *     panel, que es de donde se llegó.
 *  2. **Un conmutador, no un botón de volver.** El monitor de parque salta
 *     entre sala, entrada y salida decenas de veces al día: eso no es
 *     navegación hacia atrás, es cambiar de pestaña dentro del mismo puesto.
 *  3. **El contexto, una sola vez.** Turno, tasa, conexión y usuario vivían
 *     repetidos en cada pantalla, cada una a su manera.
 */

type Ruta = "/monitor" | "/entrada" | "/salida" | "/caja" | "/turno";

type Puesto = {
  id: string;
  nombre: string;
  superficies: { href: Ruta; corto: string; largo: string }[];
};

const PUESTOS: Puesto[] = [
  {
    id: "parque",
    nombre: "Parque",
    superficies: [
      { href: "/monitor", corto: "Sala", largo: "Monitor de parque" },
      { href: "/entrada", corto: "Entrada", largo: "Entrada al parque" },
      { href: "/salida", corto: "Salida", largo: "Salida del parque" },
    ],
  },
  {
    id: "caja",
    nombre: "Caja",
    superficies: [
      { href: "/caja", corto: "Cobrar", largo: "Caja" },
      { href: "/turno", corto: "Turno", largo: "Turno de caja" },
    ],
  },
];

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

  const puesto = PUESTOS.find((p) => p.superficies.some((s) => s.href === pathname));

  const sinTasa = contexto.tasa === null;
  const sinTurno = contexto.turnoAbierto === null;
  const alerta = sinTasa || sinTurno || contexto.conexion !== "N0";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b backdrop-blur-md",
        alerta ? "border-state-warn/25 bg-state-warn-bg/25" : "border-line bg-base/85",
      )}
    >
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        {/* Volver: un solo destino, el panel. */}
        <Link
          href="/inicio"
          className={cn(
            "group flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] pr-3 pl-2",
            "text-[13px] text-ink-3 no-underline transition-colors hover:bg-surface-2 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          )}
        >
          <ChevronLeft
            size={17}
            aria-hidden="true"
            className="transition-transform group-hover:-translate-x-0.5"
          />
          <LayoutDashboard size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Panel</span>
        </Link>

        <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />

        {/* Conmutador del puesto: pestañas, no navegación hacia atrás. */}
        {puesto && (
          <nav aria-label={`Superficies de ${puesto.nombre}`} className="min-w-0 shrink">
            <ul className="flex items-center gap-1 rounded-[var(--radius-control)] bg-surface/70 p-1">
              {puesto.superficies.map((s) => {
                const activa = s.href === pathname;
                return (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      aria-current={activa ? "page" : undefined}
                      title={s.largo}
                      className={cn(
                        "flex h-8 items-center rounded-[0.4rem] px-3 text-[13px] no-underline transition-all duration-150",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        activa
                          ? "bg-brand text-on-brand font-semibold shadow-sm"
                          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {s.corto}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {/* ── contexto, siempre a la derecha ─────────────────────────────── */}
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {sinTurno ? (
            <Aviso texto="Turno sin abrir" />
          ) : (
            <Dato etiqueta="Turno" valor={contexto.turnoAbierto!} oculto="sm" />
          )}

          {/* ADR-005: con qué tasa se está cobrando, siempre visible. */}
          {sinTasa ? (
            <Aviso texto="Sin tasa del día" />
          ) : (
            <Dato
              etiqueta={`Tasa · ${contexto.tasaHora}`}
              valor={`${contexto.tasa} Bs`}
              oculto="none"
            />
          )}

          <span
            title={contexto.conexion === "N0" ? "En línea" : "Sin internet"}
            className={cn(
              "hidden size-8 place-content-center rounded-[var(--radius-control)] md:grid",
              contexto.conexion === "N0"
                ? "text-ink-3"
                : "bg-state-warn-bg text-state-warn",
            )}
          >
            <Wifi size={15} aria-hidden="true" />
          </span>

          <span className="h-6 w-px shrink-0 bg-line" aria-hidden="true" />

          <div className="flex shrink-0 items-center gap-2">
            <Initial
              name={contexto.usuario}
              tone="idle"
              className="size-8 rounded-[0.5rem] text-[12px]"
            />
            <span className="hidden leading-tight lg:block">
              <span className="block text-[12.5px] font-medium text-ink">{contexto.usuario}</span>
              <span className="block text-[11px] text-ink-3">{contexto.rol}</span>
            </span>
            <Link
              href="/acceso"
              aria-label="Cambiar de usuario"
              title="Cambiar de usuario"
              className={cn(
                "grid size-8 place-content-center rounded-[var(--radius-control)] text-ink-3",
                "transition-colors hover:bg-surface-2 hover:text-ink",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              )}
            >
              <LogOut size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

function Dato({
  etiqueta,
  valor,
  oculto,
}: {
  etiqueta: string;
  valor: string;
  oculto: "sm" | "none";
}) {
  return (
    <span
      className={cn(
        "shrink-0 leading-tight whitespace-nowrap",
        oculto === "sm" ? "hidden sm:block" : "block",
      )}
    >
      <span className="block text-[10px] tracking-[0.06em] text-ink-3 uppercase">{etiqueta}</span>
      <span className="tnum block text-[13px] font-medium text-ink-2">{valor}</span>
    </span>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-state-crit-bg px-2.5 py-1.5 text-[12.5px] whitespace-nowrap text-state-crit">
      <TriangleAlert size={13} aria-hidden="true" />
      {texto}
    </span>
  );
}
