"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { can, type Actor } from "@l2/domain-identity";
import { Initial, cn } from "@l2/ui";
import { INICIO, MODULOS, rutaModulo, rutaSeccion, type Modulo } from "./navigation.ts";
import { PageTransition } from "./PageTransition.tsx";

/**
 * Cáscara del back-office — §9.10.2 y §9.10.3.
 *
 * TRES TAMAÑOS, TRES FORMAS DE LA MISMA NAVEGACIÓN
 *
 *  · **≥1280 px** — barra lateral de 256 px con nombres y secciones
 *    desplegables. Hay sitio: se usa.
 *  · **768–1279 px** — riel de 72 px, solo iconos. Es el ancho de la tablet
 *    del local, y ahí cada píxel del contenido cuenta. Tocar un icono lleva a
 *    la página del módulo, que lista sus secciones. **Nada de menús flotantes
 *    al pasar el cursor**: en una pantalla táctil no hay cursor que pasar.
 *  · **<768 px** — barra superior con el botón de menú y cajón deslizable.
 *
 * Lo que se corrigió: antes, entre 768 y 1279 px **no había navegación
 * ninguna** —ni barra ni riel—, solo un botón redondo flotando abajo a la
 * izquierda, encima del indicador de Next. Justo el ancho de la tablet que
 * compró el cliente.
 */

export function BackOfficeShell({
  actor,
  usuario,
  rol,
  children,
}: {
  actor: Actor;
  usuario: string;
  rol: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [cajon, setCajon] = useState(false);

  const visibles = MODULOS.filter((m) => can(actor, m.accion) !== "DENEGADO");
  const inicioVisible = can(actor, INICIO.accion) !== "DENEGADO";

  // El cajón se cierra al navegar. Sin esto se queda abierto tapando la
  // pantalla a la que acabas de ir.
  useEffect(() => setCajon(false), [pathname]);

  // Y con Escape, como cualquier capa modal (§8.7).
  useEffect(() => {
    if (!cajon) return;
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setCajon(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [cajon]);

  return (
    <div className="flex min-h-dvh bg-base">
      {/* ══════════ riel (md) y barra completa (xl) ══════════ */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/40",
          "w-[4.5rem] md:flex xl:w-64",
          "transition-[width] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
        )}
      >
        <Marca compacta />
        <NavModulos
          actor={actor}
          modulos={visibles}
          inicioVisible={inicioVisible}
          pathname={pathname}
          modo="lateral"
        />
        <PieUsuario usuario={usuario} rol={rol} compacto />
      </aside>

      {/* ══════════ columna de contenido ══════════ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior solo en móvil: el botón de menú va donde se busca,
            arriba a la izquierda, no flotando sobre el contenido. */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-base/85 px-3 backdrop-blur-md md:hidden">
          <button
            type="button"
            onClick={() => setCajon(true)}
            aria-label="Abrir menú"
            aria-expanded={cajon}
            className="grid size-11 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="font-display truncate font-bold text-ink">Abby Kingdom</span>
        </header>

        <main className="flex min-w-0 flex-1 flex-col">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      {/* ══════════ cajón (<md) ══════════ */}
      {cajon && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setCajon(false)}
            className="absolute inset-0 cursor-default bg-black/60"
          />
          <aside className="l2-entra absolute inset-y-0 left-0 flex w-[17rem] flex-col border-r border-line bg-base">
            <div className="flex items-center justify-between pr-2">
              <Marca />
              <button
                type="button"
                onClick={() => setCajon(false)}
                aria-label="Cerrar menú"
                className="grid size-11 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <NavModulos
              actor={actor}
              modulos={visibles}
              inicioVisible={inicioVisible}
              pathname={pathname}
              modo="cajon"
            />
            <PieUsuario usuario={usuario} rol={rol} />
          </aside>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── piezas ── */

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <Link
      href="/panel"
      className="flex items-center gap-3 px-4 py-4 no-underline xl:px-5"
      title="Abby Kingdom · Inicio"
    >
      <span className="font-display grid size-9 shrink-0 place-content-center rounded-[0.6rem] bg-brand text-[15px] font-bold text-on-brand">
        L2
      </span>
      <span className={cn("min-w-0", compacta && "hidden xl:block")}>
        <span className="font-display block truncate leading-tight font-bold text-ink">
          Abby Kingdom
        </span>
        <span className="block truncate text-[11.5px] text-ink-3">Sucursal única</span>
      </span>
    </Link>
  );
}

function NavModulos({
  actor,
  modulos,
  inicioVisible,
  pathname,
  modo,
}: {
  actor: Actor;
  modulos: readonly Modulo[];
  inicioVisible: boolean;
  pathname: string;
  modo: "lateral" | "cajon";
}) {
  // En el riel no hay sitio para desplegar: el módulo entero es un icono y su
  // página lista las secciones. Solo la barra ancha y el cajón despliegan.
  const [abierto, setAbierto] = useState<string | null>(null);
  const riel = modo === "lateral";

  return (
    <nav
      aria-label="Módulos"
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-4", modo === "cajon" && "px-3")}
    >
      <ul className="flex flex-col gap-0.5">
        {inicioVisible && (
          <li>
            <Fila
              href={INICIO.href}
              icono={<INICIO.icon size={18} aria-hidden="true" />}
              nombre={INICIO.nombre}
              activo={pathname === INICIO.href}
              riel={riel}
            />
          </li>
        )}

        {modulos.map((m) => {
          const enModulo = pathname.startsWith(rutaModulo(m.id));
          const secciones = m.secciones.filter(
            (s) => !s.accion || can(actor, s.accion) !== "DENEGADO",
          );
          const seccionActiva = secciones.some((s) => s.href === pathname);
          const desplegado = abierto === m.id || enModulo;

          return (
            <li key={m.id}>
              {/* La fila del módulo SIEMPRE navega a su página. Un encabezado
                  que solo despliega obliga a dos toques para llegar a algo. */}
              <Fila
                href={rutaModulo(m.id)}
                icono={<m.icon size={18} aria-hidden="true" />}
                nombre={m.nombre}
                activo={pathname === rutaModulo(m.id)}
                resaltado={enModulo || seccionActiva}
                riel={riel}
                alFinal={
                  <button
                    type="button"
                    aria-label={`${desplegado ? "Plegar" : "Desplegar"} ${m.nombre}`}
                    aria-expanded={desplegado}
                    onClick={(e) => {
                      e.preventDefault();
                      setAbierto(desplegado ? "" : m.id);
                    }}
                    className={cn(
                      "grid size-7 shrink-0 cursor-pointer place-content-center rounded text-ink-3",
                      "transition-colors hover:bg-surface-2 hover:text-ink",
                      riel && "hidden xl:grid",
                    )}
                  >
                    <ChevronDown
                      size={14}
                      className={cn(
                        "transition-transform duration-[var(--dur-rapida)]",
                        desplegado && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                }
              />

              {desplegado && secciones.length > 0 && (
                <ul
                  className={cn(
                    "mt-0.5 mb-1 ml-[1.6rem] flex flex-col gap-0.5 border-l border-line pl-2.5",
                    riel && "hidden xl:flex",
                  )}
                >
                  {secciones.map((s) => {
                    const href = s.href ?? rutaSeccion(m.id, s.id);
                    const activo = pathname === href;
                    return (
                      <li key={s.id}>
                        <Link
                          href={href}
                          aria-current={activo ? "page" : undefined}
                          className={cn(
                            "flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-2.5 text-[13px] no-underline",
                            "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                            activo
                              ? "bg-brand/10 font-medium text-brand"
                              : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <span className="truncate">{s.nombre}</span>
                          {s.href === null && (
                            <span className="ml-auto shrink-0 text-[10px] tracking-wide text-ink-3 uppercase">
                              pendiente
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Fila de navegación.
 *
 * En el riel el nombre se oculta pero **sigue en el DOM** para el lector de
 * pantalla, y el `title` lo devuelve al pasar el cursor en escritorio. Un
 * icono sin nombre accesible es un botón mudo.
 */
function Fila({
  href,
  icono,
  nombre,
  activo,
  resaltado = false,
  riel,
  alFinal,
}: {
  href: Route;
  icono: React.ReactNode;
  nombre: string;
  activo: boolean;
  resaltado?: boolean;
  riel: boolean;
  alFinal?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={href}
        title={nombre}
        aria-current={activo ? "page" : undefined}
        className={cn(
          "flex min-h-11 flex-1 items-center gap-3 rounded-[var(--radius-control)] px-3 text-[13.5px] no-underline",
          "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          riel && "justify-center xl:justify-start",
          activo
            ? "bg-brand/12 font-semibold text-brand"
            : resaltado
              ? "font-semibold text-ink"
              : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )}
      >
        <span className="shrink-0">{icono}</span>
        <span className={cn("truncate", riel && "hidden xl:inline")}>{nombre}</span>
      </Link>
      {alFinal}
    </div>
  );
}

function PieUsuario({
  usuario,
  rol,
  compacto = false,
}: {
  usuario: string;
  rol: string;
  compacto?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-t border-line px-3 py-3",
        compacto && "justify-center xl:justify-start xl:px-4",
      )}
    >
      <Initial name={usuario} tone="idle" className="size-8 shrink-0 text-sm" />
      <div className={cn("min-w-0 flex-1", compacto && "hidden xl:block")}>
        <p className="truncate text-[13px] font-medium text-ink">{usuario}</p>
        <p className="truncate text-[11.5px] text-ink-3">{rol}</p>
      </div>
      <Link
        href="/acceso"
        aria-label="Salir"
        title="Salir"
        className={cn(
          "grid size-9 shrink-0 place-content-center rounded-[var(--radius-control)] text-ink-3",
          "transition-colors hover:bg-surface-2 hover:text-ink",
          compacto && "hidden xl:grid",
        )}
      >
        <LogOut size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
