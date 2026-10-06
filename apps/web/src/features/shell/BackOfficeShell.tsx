"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ChevronDown, LogOut, Maximize2, Menu, X } from "lucide-react";
import type { Actor } from "@l2/domain-identity";
import { Initial, cn } from "@l2/ui";
import { INICIO, buscarModulo, buscarSeccion, modulosDeZona, rutaModulo, rutaSeccion, type Modulo } from "./navigation.ts";
import { PageTransition } from "./PageTransition.tsx";
import { cerrarSesion, useOperador } from "../identity/operador.ts";
import { GuardiaAcceso } from "../identity/GuardiaAcceso.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import {
  modulosVisibles,
  puedeAbrirPanel,
  puedeVerInicio,
  puedeVerSeccion,
} from "../identity/visibilidad.ts";
import { salirDePantallaCompleta } from "./pantallaCompleta.ts";

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

export function BackOfficeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [cajon, setCajon] = useState(false);

  // El panel conserva la barra de estado. Si venía de una estación, la quita.
  useEffect(() => {
    salirDePantallaCompleta();
  }, []);

  // El menú se recorta con el rol de quien entró (V2). Sin sesión, vacío: la
  // guardia del contenido pide identificarse.
  const operador = useOperador();

  /** Salir cierra la sesión en el servidor: Inicio marca el puesto vacío en vivo (F9-08, D7). */
  function salir() {
    void cerrarSesion();
  }
  const actor = useActorEnSesion();
  const visibles = actor ? modulosVisibles(actor) : [];
  const inicioVisible = actor ? puedeVerInicio(actor) : false;
  const usuario = operador?.nombre ?? "Sin identificar";
  const rol = operador?.rol ?? "Entra por el acceso";

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
    // Desde md la cáscara se FIJA a la ventana (`fixed inset-0`), no solo mide su alto: aunque el
    // documento se alargue o se desplace por código, la barra y el menú no se mueven. Desplaza
    // solo el contenido (PageTransition) y la lista del menú. En móvil, flujo normal con la
    // barra superior pegada arriba.
    <div className="flex min-h-dvh bg-base md:fixed md:inset-0 md:min-h-0 md:overflow-hidden">
      {/* ══════════ riel (md) y barra completa (xl) ══════════ */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/40",
          "w-[4.5rem] md:flex xl:w-64 md:h-full pt-[var(--seguro-arriba)] pl-[var(--seguro-izquierda)]",
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
        <div className="hidden px-3 pb-2 xl:block">
        </div>
        <PieUsuario usuario={usuario} rol={rol} onSalir={salir} compacto />
      </aside>

      {/* ══════════ columna de contenido ══════════ */}
      <div className="flex min-w-0 flex-1 flex-col md:h-full md:overflow-hidden">
        {/* Barra superior solo en móvil: el botón de menú va donde se busca,
            arriba a la izquierda, no flotando sobre el contenido. */}
        <header className="sticky top-0 z-30 flex h-[calc(3.5rem+var(--seguro-arriba))] items-center gap-3 border-b border-line bg-base/85 px-3 pt-[var(--seguro-arriba)] pl-[max(0.75rem,var(--seguro-izquierda))] pr-[max(0.75rem,var(--seguro-derecha))] backdrop-blur-md md:hidden">
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

        <main className="flex min-w-0 flex-1 flex-col md:h-full md:overflow-hidden">
          <PageTransition>
            <GuardiaAcceso
              destino={nombreEnPanel(pathname)}
              permitido={(a) => puedeAbrirPanel(a, pathname)}
            >
              {children}
            </GuardiaAcceso>
          </PageTransition>
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
            <PieUsuario usuario={usuario} rol={rol} onSalir={salir} />
          </aside>
        </div>
      )}
    </div>
  );
}

/** Cómo se llama lo que se intentó abrir en el panel, para la guardia. */
function nombreEnPanel(ruta: string): string {
  const [, , moduloId, seccionId] = ruta.split("/");
  const m = moduloId ? buscarModulo(moduloId) : undefined;
  if (!m) return "el panel";
  const s = seccionId ? buscarSeccion(m, seccionId) : undefined;
  return s ? `«${s.nombre}»` : `el módulo ${m.nombre}`;
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
  actor: Actor | null;
  modulos: readonly Modulo[];
  inicioVisible: boolean;
  pathname: string;
  modo: "lateral" | "cajon";
}) {
  // En el riel no hay sitio para desplegar: el módulo entero es un icono y su
  // página lista las secciones. Solo la barra ancha y el cajón despliegan.
  // Lo que la persona abrió o plegó a mano, por módulo. Sin elegir nada, se despliega el módulo en el
  // que está. Antes, estando dentro de un módulo (p. ej. en una pantalla de Ajustes) no se podía
  // plegar: «estar dentro» lo volvía a abrir en el acto. Al navegar se vuelve a lo automático.
  const [eleccion, setEleccion] = useState<Readonly<Record<string, boolean>>>({});
  useEffect(() => setEleccion({}), [pathname]);
  const riel = modo === "lateral";

  const operar = modulosDeZona(modulos, "operar");
  const ajustes = modulosDeZona(modulos, "ajustes");

  const estaDesplegado = (m: Modulo) => eleccion[m.id] ?? pathname.startsWith(rutaModulo(m.id));
  // Ajustes es la lista más larga: desplegado, ocupa el sitio que queda y solo sus secciones desplazan. La fila
  // «Ajustes», los módulos de operación, la marca y la persona se quedan a la vista.
  const ajustesDesplegado = ajustes.some(estaDesplegado);

  /** `propioScroll`: desplegado, el módulo llena el alto que queda y desplaza solo sus secciones (Ajustes). */
  const pintarModulo = (m: Modulo, propioScroll = false) => {
    const enModulo = pathname.startsWith(rutaModulo(m.id));
    const secciones = m.secciones.filter((s) => actor !== null && puedeVerSeccion(actor, m, s));
    const seccionActiva = secciones.some((s) => s.href === pathname);
    const desplegado = estaDesplegado(m);
    const llena = propioScroll && desplegado && secciones.length > 0;
    return (
            <li key={m.id} className={cn(llena && "flex min-h-0 flex-1 flex-col")}>
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
                      setEleccion((prev) => ({ ...prev, [m.id]: !desplegado }));
                    }}
                    className={cn(
                      "grid size-8 shrink-0 cursor-pointer place-content-center rounded text-ink-3",
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
                    llena && "min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:thin]",
                  )}
                >
                  {secciones.map((s, i) => {
                    const href = s.href ?? rutaSeccion(m.id, s.id);
                    const activo = pathname === href;
                    // Ajustes es largo: sus secciones van por grupos (Dinero, Equipo…).
                    const grupoNuevo = s.grupo && s.grupo !== secciones[i - 1]?.grupo;
                    return (
                      <li key={s.id}>
                        {grupoNuevo && (
                          <p className="px-2.5 pt-2 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                            {s.grupo}
                          </p>
                        )}
                        <Link
                          href={href}
                          aria-current={activo ? "page" : undefined}
                          title={s.abre === "estacion" ? "se abre a pantalla completa" : undefined}
                          className={cn(
                            "flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-2.5 text-[13px] no-underline",
                            "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                            activo
                              ? "bg-brand/10 font-medium text-brand"
                              : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <span className="truncate">{s.nombre}</span>
                          {s.abre === "estacion" && (
                            <>
                              <span className="sr-only">se abre a pantalla completa</span>
                              <Maximize2 size={11} aria-hidden="true" className="ml-auto shrink-0" />
                            </>
                          )}
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
  };

  return (
    <nav
      aria-label="Módulos"
      className={cn("flex min-h-0 flex-1 flex-col px-2 pb-4", modo === "cajon" && "px-3")}
    >
      {/* Lo que se opera, arriba y a la vista: con Ajustes plegado usa todo el alto; con Ajustes desplegado cede
          el sitio y solo desplaza por su cuenta si pasa del 45 %. */}
      <ul
        className={cn(
          "flex flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-width:thin]",
          ajustesDesplegado ? (riel ? "min-h-0 shrink xl:max-h-[45%] xl:shrink-0" : "max-h-[45%] shrink-0") : "min-h-0 shrink",
        )}
      >
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

        {operar.map((m) => pintarModulo(m))}
      </ul>
      {/* Lo que se configura, abajo y aparte: el menú es para operar (M-13). Desplegado, Ajustes sube y llena el
          alto que queda, con su propio desplazamiento. */}
      {ajustes.length > 0 && (
        <ul className={cn("flex flex-col gap-0.5 border-t border-line pt-2", !ajustesDesplegado ? "mt-auto" : riel ? "mt-auto xl:mt-2 xl:min-h-0 xl:flex-1" : "mt-2 min-h-0 flex-1")}>
          {ajustes.map((m) => pintarModulo(m, true))}
        </ul>
      )}
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
            ? "bg-brand/20 font-semibold text-brand"
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
  onSalir,
  compacto = false,
}: {
  usuario: string;
  rol: string;
  /** Salir cierra la sesión y libera el puesto (F9-08, D7). */
  onSalir: () => void;
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
        onClick={onSalir}
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
