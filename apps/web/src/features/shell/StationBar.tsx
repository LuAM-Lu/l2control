"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  Clock,
  LayoutDashboard,
  LogOut,
  Maximize,
  Minimize,
  TrendingUp,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { Initial, cn } from "@l2/ui";
import { useEffect, useState } from "react";
import { PUESTO_DE_ROL, cerrarSesion, useOperador } from "../identity/operador.ts";
import { useAjustes } from "../identity/accesos.ts";
import { actorDe, puedeAbrirRuta, puedeVerInicio } from "../identity/visibilidad.ts";
import { pedirPantallaCompleta, salirDePantallaCompleta } from "./pantallaCompleta.ts";
import { ChipSimulacion } from "../simulacion/PanelSimulacion.tsx";
import { useSimulacion } from "../simulacion/SimulacionProvider.tsx";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";

/**
 * Barra permanente de las estaciones — §8.5 y §9.10.2.
 *
 * DOS COSAS QUE SE ARREGLARON AQUÍ
 *
 * 1. **Ritmo.** Antes la derecha era una hilera de etiquetas de 10 px sobre
 *    valores de 13 px, cada bloque de una altura distinta. Eso se lee mal y se
 *    ve peor. Ahora todo lo de la derecha son píldoras de **la misma altura**
 *    con el mismo acolchado: la regularidad es lo que hace que una barra se
 *    vea acabada.
 *
 * 2. **Se puede tocar.** La barra mide 64 px y todo lo que se pulsa —volver,
 *    las pestañas, salir— mide 48: el objetivo de tablet de §8.4. Las pestañas
 *    medían 28 px, que es un tamaño de ratón puesto en una pantalla que se
 *    opera con el dedo y con prisa.
 *
 * 3. **Se adapta de verdad.** Por debajo de 640 px el conmutador baja a una
 *    fila propia y las pestañas se reparten el ancho a partes iguales, en vez
 *    de recortarse: una pestaña cortada equivale a una pestaña que no existe.
 *    El contexto se reduce a iconos antes que desaparecer, para que el
 *    operador no pierda de vista si hay turno y con qué tasa se cobra.
 *    Comprobado a 320, 375, 414, 768, 1024 y 1440: ninguna ruta desplaza en
 *    horizontal y todo lo pulsable mide 48 px.
 */

type Ruta = "/monitor" | "/entrada" | "/salida" | "/caja" | "/ventas" | "/turno" | "/mesas" | "/cocina";

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
      { href: "/ventas", corto: "Ventas", largo: "Ventas del turno" },
      { href: "/turno", corto: "Turno", largo: "Turno de caja" },
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    superficies: [
      { href: "/mesas", corto: "Mesas", largo: "Mesas y pedidos" },
      { href: "/cocina", corto: "Cocina", largo: "Cocina (KDS)" },
    ],
  },
];

export type ContextoEstacion = {
  turnoAbierto: string | null;
  tasa: string | null;
  tasaHora: string | null;
  /** Nivel de degradación de ADR-003. */
  conexion: "N0" | "N1" | "N2" | "N3";
};

/** Píldora informativa: no se toca, así que no necesita objetivo táctil. */
const PILDORA =
  "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-2.5 " +
  "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function StationBar({ contexto }: { contexto: ContextoEstacion }) {
  const pathname = usePathname();
  // Quién entró por el acceso (A2). Sin sesión se dice, en vez de mostrar a
  // otra persona: lo que se hace aquí quedaría a su nombre.
  const operador = useOperador();
  // Desde «Turno», cuántas cuentas esperan en «Cobrar»: que no se olviden.
  const porCobrar = useCuentas().cuentas.filter((c) => c.status === "POR_COBRAR").length;
  const sim = useSimulacion();

  const [esPantallaCompleta, setEsPantallaCompleta] = useState(false);

  useEffect(() => {
    const alCambiar = () => setEsPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    // Establecer estado inicial
    setEsPantallaCompleta(!!document.fullscreenElement);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  /** Salir libera el puesto: el panel en vivo lo marca vacío (F9-08, D7). */
  function salir() {
    if (operador) sim.emitir({ type: "sesion.cerrada", device: PUESTO_DE_ROL[operador.role] });
    cerrarSesion();
  }

  // Los ganchos, antes de cualquier salida: en el acceso no hay barra, pero el
  // orden de los ganchos no puede depender de la ruta.
  const ajustes = useAjustes();

  // La pantalla de acceso no lleva barra: todavía no se sabe quién entra, y
  // enseñar el turno o la tasa antes de autenticar no aporta nada.
  if (pathname === "/acceso") return null;

  // V2: solo las pestañas que el rol puede abrir, y «Panel» solo para quien
  // ve informes. Sin sesión no hay a dónde ir más que al acceso.
  const actor = operador ? actorDe(operador, ajustes) : null;
  const encontrado = PUESTOS.find((p) => p.superficies.some((s) => s.href === pathname));
  const pestanas = actor && encontrado ? encontrado.superficies.filter((s) => puedeAbrirRuta(actor, s.href)) : [];
  const puesto = encontrado && pestanas.length > 0 ? { ...encontrado, superficies: pestanas } : null;
  const verPanel = actor !== null && puedeVerInicio(actor);
  const sinTasa = contexto.tasa === null;
  const sinTurno = contexto.turnoAbierto === null;
  const offline = contexto.conexion !== "N0";
  const alerta = sinTasa || sinTurno || offline;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md pt-[var(--seguro-arriba)]",
        alerta ? "border-state-warn/25 bg-state-warn-bg/25" : "border-line bg-base/85",
      )}
      style={{ boxShadow: "var(--shadow-bar)" }}
    >
      {/* Envoltura: en móvil el conmutador baja a su propia fila (`w-full
          order-last`); a partir de lg todo cabe en una sola de 64 px.
          Entre 640 y 1023 px las pestañas y los chips no caben juntos (F-03). */}
      <div className="flex flex-wrap items-center gap-2 py-2 pl-[max(0.5rem,var(--seguro-izquierda))] pr-[max(0.5rem,var(--seguro-derecha))] lg:h-16 lg:flex-nowrap lg:gap-3 lg:py-0 lg:pl-[max(1rem,var(--seguro-izquierda))] lg:pr-[max(1rem,var(--seguro-derecha))]">
        {/* Volver: un solo destino, el panel. */}
        {verPanel && (
        <Link
          href="/panel"
          title="Volver al panel"
          className={cn(
            PILDORA,
            "h-12 shrink-0 px-3 text-ink-3 no-underline",
            "group hover:bg-surface-2 hover:text-ink",
          )}
        >
          <ChevronLeft
            size={17}
            aria-hidden="true"
            className="transition-transform duration-[var(--dur-rapida)] group-hover:-translate-x-0.5"
          />
          <LayoutDashboard size={15} aria-hidden="true" />
          <span className="hidden text-[13px] md:inline">Panel</span>
        </Link>
        )}

        {/* Conmutador del puesto: pestañas, no navegación hacia atrás.
            Se desplaza en horizontal antes que comprimirse. */}
        {puesto && (
          <nav
            aria-label={`Superficies de ${puesto.nombre}`}
            className="order-last w-full min-w-0 lg:order-none lg:w-auto"
          >
            <ul className="flex items-center gap-1 rounded-[var(--radius-control)] bg-surface/70 p-1">
              {puesto.superficies.map((s) => {
                const activa = s.href === pathname;
                return (
                  <li key={s.href} className="flex-1 lg:flex-none">
                    <Link
                      href={s.href}
                      aria-current={activa ? "page" : undefined}
                      title={s.largo}
                      className={cn(
                        "flex h-12 flex-1 items-center justify-center rounded-[0.4rem] px-4 text-sm",
                        "whitespace-nowrap no-underline lg:flex-none lg:justify-start",
                        "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        activa
                          ? "bg-brand text-on-brand font-semibold shadow-sm"
                          : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {s.corto}
                      {s.href === "/caja" && !activa && porCobrar > 0 && (
                        <span className="tnum ml-2 rounded-full bg-brand px-1.5 text-[11px] leading-5 font-bold text-on-brand">
                          {porCobrar}
                          <span className="sr-only"> por cobrar</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        {/* ── contexto: píldoras de la misma altura ─────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {sinTurno ? (
            <Pildora tono="crit" icono={<TriangleAlert size={14} />} texto="Turno sin abrir" />
          ) : (
            <Pildora
              tono="tenue"
              icono={<Clock size={14} />}
              texto={`Turno desde ${contexto.turnoAbierto!}`}
              ocultarTextoHasta="lg"
              titulo={`Turno abierto desde las ${contexto.turnoAbierto}`}
            />
          )}

          {/* ADR-005: con qué tasa se está cobrando, siempre visible. */}
          {sinTasa ? (
            <Pildora tono="crit" icono={<TriangleAlert size={14} />} texto="Sin tasa" />
          ) : (
            <Pildora
              tono="tenue"
              icono={<TrendingUp size={14} />}
              texto={`Bs. ${contexto.tasa}`}
              ocultarTextoHasta="sm"
              titulo={`Tasa BCV Bs. ${contexto.tasa}, capturada a las ${contexto.tasaHora}`}
            />
          )}

          {offline && (
            <Pildora tono="warn" icono={<WifiOff size={14} />} texto="Sin internet" />
          )}

          <ChipSimulacion />

          <span className="mx-0.5 hidden h-6 w-px bg-line lg:block" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              if (esPantallaCompleta) salirDePantallaCompleta();
              else pedirPantallaCompleta();
            }}
            aria-label={esPantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            title={esPantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
            className="l2-solo-instalada grid size-12 shrink-0 place-content-center rounded-[0.45rem] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {esPantallaCompleta ? (
              <Minimize size={18} aria-hidden="true" />
            ) : (
              <Maximize size={18} aria-hidden="true" />
            )}
          </button>

          <span className={cn(PILDORA, "h-12 gap-2 pr-1 pl-1 text-ink-2")}>
            <Initial
              name={operador?.nombre ?? "?"}
              tone={operador ? "idle" : "warn"}
              className="size-8 rounded-[0.45rem] text-[11.5px]"
            />
            <span className="hidden leading-tight xl:block">
              <span className={cn("block text-[12.5px] font-medium", operador ? "text-ink" : "text-state-warn")}>
                {operador?.nombre ?? "Sin identificar"}
              </span>
              <span className="block text-[11px] text-ink-3">{operador?.rol ?? "Entra por el acceso"}</span>
            </span>
            <Link
              href="/acceso"
              onClick={salir}
              aria-label={operador ? `Cambiar de usuario (sesión de ${operador.nombre})` : "Entrar por el acceso"}
              title="Cambiar de usuario"
              className="grid size-12 place-content-center rounded-[0.45rem] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <LogOut size={15} aria-hidden="true" />
            </Link>
          </span>
        </div>
      </div>
    </header>
  );
}

const TONO = {
  tenue: "bg-surface/70 text-ink-2",
  warn: "bg-state-warn-bg text-state-warn",
  crit: "bg-state-crit-bg text-state-crit",
} as const;

/**
 * Píldora de contexto.
 *
 * `ocultarTextoHasta` reduce a solo icono en pantallas estrechas **en lugar
 * de desaparecer**: un dato que se esfuma según el ancho es peor que uno
 * abreviado, porque el operador deja de saber si existe. El `title` mantiene
 * el valor completo accesible en todos los tamaños.
 */
function Pildora({
  tono,
  icono,
  texto,
  sufijo,
  ocultarTextoHasta,
  titulo,
}: {
  tono: keyof typeof TONO;
  icono: React.ReactNode;
  texto: string;
  sufijo?: string;
  ocultarTextoHasta?: "sm" | "lg";
  titulo?: string;
}) {
  return (
    <span
      title={titulo ?? texto}
      className={cn(PILDORA, "shrink-0 text-[13px] whitespace-nowrap", TONO[tono])}
    >
      <span aria-hidden="true" className="shrink-0">
        {icono}
      </span>
      <span
        className={cn(
          "tnum font-medium",
          ocultarTextoHasta === "sm" && "hidden sm:inline",
          ocultarTextoHasta === "lg" && "hidden lg:inline",
        )}
      >
        {texto}
        {sufijo && <span className="ml-1 text-[11px] opacity-70">{sufijo}</span>}
      </span>
    </span>
  );
}
