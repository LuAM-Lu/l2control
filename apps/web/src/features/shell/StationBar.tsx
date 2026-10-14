"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Baby,
  ChevronDown,
  ChevronLeft,
  Clock,
  FileText,
  HandCoins,
  HandPlatter,
  LayoutDashboard,
  LogOut,
  Maximize,
  Minimize,
  MoreHorizontal,
  Receipt,
  Timer,
  TrendingUp,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { Initial, Sheet, cn } from "@l2/ui";
import { can } from "@l2/domain-identity";
import { useEffect, useRef, useState } from "react";
import {
  cerrarSesion,
  useOperador,
} from "../identity/operador.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import {
  puedeAbrirRuta,
  puedeVerInicio,
} from "../identity/visibilidad.ts";
import {
  pedirPantallaCompleta,
  salirDePantallaCompleta,
} from "./pantallaCompleta.ts";
import { useTiempoReal } from "../operacion/TiempoRealProvider.tsx";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useTasaVigente } from "../cash/TasasProvider.tsx";
import { formatTasaVE } from "../cash/tasa-format.ts";
import { formatClock } from "../park/time-format.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { AvisoDeImpresion } from "../impresion/AvisoDeImpresion.tsx";
import { EstadoDeImpresoras } from "../impresion/EstadoDeImpresoras.tsx";
import { BotonAyuda } from "../ayuda/AyudaProvider.tsx";
import { MiCuenta } from "../identity/MiCuenta.tsx";
import { BotonSonidoDeAvisos } from "../park/BotonSonidoDeAvisos.tsx";

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
 *
 * 4. **Navegación cruzada.** Un botón al final de las pestañas permite abrir
 *    otros puestos a los que el rol tiene acceso (N-06).
 *
 * 5. **Por pantalla (T-21, M-38).** Un puesto de una sola pantalla (el mesero, la
 *    monitora) dice su nombre en la barra en vez de una pestaña gigante. La caja,
 *    desde 1440 px, sus cinco pestañas con su número (Alt+1 a Alt+5); por debajo
 *    (la laptop de 1366 y la tablet), Cobrar y Turno fijas y «Más ▾» con las
 *    demás. Los avisos, cortos por debajo de 1440: el de impresión, su número;
 *    el turno, el reloj.
 */

/** Las pestañas que se ven siempre; las demás, desde 1440 px o en «Más» (T-21). */
const FIJAS = 2;

type Ruta =
  | "/monitor"
  | "/caja"
  | "/turno"
  | "/papel"
  | "/deudas"
  | "/personal"
  | "/mesas";

type Puesto = {
  id: string;
  nombre: string;
  /** Cada pestaña con su icono (B4-12): se reconoce sin leer, también en el teléfono. */
  superficies: { href: Ruta; corto: string; largo: string; icono: LucideIcon }[];
};

const PUESTOS: Puesto[] = [
  {
    id: "parque",
    nombre: "Parque",
    superficies: [
      // B4-12 (M-34): la sala, la entrada y la salida son una pantalla, con un solo lector.
      { href: "/monitor", corto: "Parque", largo: "Parque: sala, entrada y salida", icono: Baby },
    ],
  },
  {
    id: "caja",
    nombre: "Caja",
    superficies: [
      { href: "/caja", corto: "Cobrar", largo: "Caja", icono: Receipt },
      { href: "/turno", corto: "Turno", largo: "Turno de caja", icono: Timer },
      // Lo anotado en papel cuando cayeron los dos enlaces (B3-7, V-12).
      { href: "/papel", corto: "Papel", largo: "Carga desde papel", icono: FileText },
      // Lo que dejaron sin pagar los clientes (B3-11) y lo del personal (B3-17, B3-26), en una pestaña.
      { href: "/deudas", corto: "Deudas", largo: "Deudas de clientes y del personal", icono: HandCoins },
    ],
  },
  {
    id: "restaurante",
    nombre: "Restaurante",
    superficies: [
      { href: "/mesas", corto: "Mesas", largo: "Mesas y pedidos", icono: HandPlatter },
    ],
  },
];

export type ContextoEstacion = {
  /** El turno del equipo, del servidor (B3-1); `null` si no hay ninguno abierto. */
  turno: { abiertoEn: string; punto: string } | null;
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
  const porCobrar = useCuentas().cuentas.filter(
    (c) => c.status === "POR_COBRAR",
  ).length;
  const canal = useTiempoReal();
  const { tasa: tasaVigente } = useTasaVigente("USD/VES");
  // El formato de hora es el que fijó la sucursal (F5-08b): 12 h o 24 h en
  // TODAS las superficies, también en esta píldora.
  const { ajustes: sucursal } = useSucursal();

  const [esPantallaCompleta, setEsPantallaCompleta] = useState(false);
  const [otrosAbierto, setOtrosAbierto] = useState(false);

  useEffect(() => {
    const alCambiar = () => setEsPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", alCambiar);
    // Establecer estado inicial
    setEsPantallaCompleta(!!document.fullscreenElement);
    return () => document.removeEventListener("fullscreenchange", alCambiar);
  }, []);

  /** Salir cierra la sesión en el servidor: Inicio marca el puesto vacío en vivo (F9-08, D7). */
  function salir() {
    void cerrarSesion();
  }

  // Los ganchos, antes de cualquier salida: en el acceso no hay barra, pero el
  // orden de los ganchos no puede depender de la ruta.
  const actorDeSesion = useActorEnSesion();
  const router = useRouter();
  /** Adónde lleva Alt+N (T-21): la pestaña N del puesto abierto. */
  const destinos = useRef<readonly Ruta[]>([]);
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
      const n = /^Digit([1-9])$/.exec(e.code)?.[1];
      // Con una capa abierta, las teclas son de ella.
      if (!n || document.querySelector("dialog[open]")) return;
      const destino = destinos.current[Number(n) - 1];
      if (!destino) return;
      e.preventDefault();
      router.push(destino);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [router]);
  /** «Más ▾» (T-21): las pestañas que no caben por debajo de 1440 px. */
  const [masAbierto, setMasAbierto] = useState(false);
  const mas = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!masAbierto) return;
    const fuera = (e: PointerEvent) => {
      if (!mas.current?.contains(e.target as Node)) setMasAbierto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMasAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [masAbierto]);
  useEffect(() => setMasAbierto(false), [pathname]);

  // V2: solo las pestañas que el rol puede abrir, y «Panel» solo para quien
  // ve informes. Sin sesión no hay a dónde ir más que al acceso.
  const actor = operador ? actorDeSesion : null;
  const encontrado = PUESTOS.find((p) =>
    p.superficies.some((s) => s.href === pathname),
  );
  const pestanas =
    actor && encontrado
      ? encontrado.superficies.filter((s) => puedeAbrirRuta(actor, s.href))
      : [];
  const puesto =
    encontrado && pestanas.length > 0
      ? { ...encontrado, superficies: pestanas }
      : null;

  const otros = actor
    ? PUESTOS.filter((p) => p.id !== (encontrado ? encontrado.id : ""))
        .map((p) => ({
          ...p,
          superficies: p.superficies.filter((s) =>
            puedeAbrirRuta(actor, s.href),
          ),
        }))
        .filter((p) => p.superficies.length > 0)
    : [];
  useEffect(() => {
    destinos.current = (puesto?.superficies ?? []).map((s) => s.href);
  });

  // La pantalla de acceso no lleva barra: todavía no se sabe quién entra, y
  // enseñar el turno o la tasa antes de autenticar no aporta nada.
  if (pathname === "/acceso") return null;

  const verPanel = actor !== null && puedeVerInicio(actor);
  const sinTasa = tasaVigente === null;
  const sinTurno = contexto.turno === null;
  // El turno es de la caja: solo lo avisa a quien lo abre. A la monitora un «Turno sin abrir» que
  // nunca se va le enseñaría a ignorar los avisos (JORNADA §4).
  const abreTurno = actor !== null && can(actor, "turno.abrir") !== "DENEGADO";
  const turnoDesde = contexto.turno ? formatClock(Date.parse(contexto.turno.abiertoEn), sucursal.formatoHora, sucursal.zonaHoraria) : null;
  // El canal en vivo (B5-1). «Conectando» al abrir la página no es una alerta; perderlo, sí.
  const offline = canal.estado === "sin-conexion";
  const alerta = sinTasa || (abreTurno && sinTurno) || offline;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md pt-[var(--seguro-arriba)]",
        alerta
          ? "border-state-warn/25 bg-state-warn-bg/25"
          : "border-line bg-base/85",
      )}
      style={{ boxShadow: "var(--shadow-bar)" }}
    >
      {/* Envoltura: en móvil o en vertical estrecha el conmutador baja a su propia fila (`w-full
          order-last`); en pantalla apaisada (F-15) todo cabe en una sola de 64 px.
          Entre 640 y 1023 px las pestañas y los chips no caben juntos (F-03). */}
      <div className="flex flex-wrap items-center gap-2 py-2 pl-[max(0.5rem,var(--seguro-izquierda))] pr-[max(0.5rem,var(--seguro-derecha))] apaisado:h-16 apaisado:flex-nowrap apaisado:gap-3 apaisado:py-0 apaisado:pl-[max(1rem,var(--seguro-izquierda))] apaisado:pr-[max(1rem,var(--seguro-derecha))]">
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

        {/* T-21: un puesto de una sola pantalla (el mesero, la monitora) dice su nombre en la barra, sin una pestaña
            gigante. El de varias (la caja), sus pestañas: las cinco desde 1440 px; por debajo, Cobrar y Turno y «Más». */}
        {puesto && puesto.superficies.length === 1 ? (
          <div className="flex min-w-0 items-center gap-1">
            <NombreDelPuesto nombre={puesto.nombre} superficie={puesto.superficies[0]!} />
            {otros.length > 0 && <button
                type="button"
                aria-label="Otros puestos"
                title="Otros puestos"
                aria-haspopup="dialog"
                aria-expanded={otrosAbierto}
                onClick={() => setOtrosAbierto(true)}
                className="grid size-12 shrink-0 place-content-center rounded-[0.4rem] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <ArrowLeftRight size={18} aria-hidden="true" />
              </button>}
          </div>
        ) : (
          (puesto || otros.length > 0) && (
            <nav aria-label={puesto ? `Superficies de ${puesto.nombre}` : "Otros puestos"} className="order-last w-full min-w-0 apaisado:order-none apaisado:w-auto">
              <ul className="flex items-center gap-1 rounded-[var(--radius-control)] bg-surface/70 p-1">
                {puesto &&
                  puesto.superficies.map((s, i) => (
                    <li key={s.href} className={cn("flex-1 apaisado:flex-none", i >= FIJAS && "hidden min-[1440px]:block")}>
                      <PestanaDelPuesto superficie={s} numero={i + 1} activa={s.href === pathname} porCobrar={s.href === "/caja" ? porCobrar : 0} />
                    </li>
                  ))}
                {puesto && puesto.superficies.length > FIJAS && (
                  <li ref={mas} className={cn("relative flex-1 apaisado:flex-none", "min-[1440px]:hidden")}>
                    {(() => {
                      const activa = puesto?.superficies.slice(FIJAS).find((x) => x.href === pathname);
                      const Icono = activa?.icono ?? MoreHorizontal;
                      return (
                        <button
                          type="button"
                          aria-haspopup="menu"
                          aria-expanded={masAbierto}
                          onClick={() => setMasAbierto((v) => !v)}
                          className={cn(
                            "flex h-12 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[0.4rem] px-3 text-sm whitespace-nowrap apaisado:justify-start",
                            "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                            activa ? "bg-brand font-semibold text-on-brand shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <Icono className="size-(--icono-texto) shrink-0" aria-hidden="true" />
                          {activa ? activa.corto : "Más"}
                          <ChevronDown className="size-(--icono-etiqueta) shrink-0 opacity-70" aria-hidden="true" />
                        </button>
                      );
                    })()}
                    {masAbierto && (
                      <div role="menu" aria-label="Más superficies de la caja" className="absolute top-full right-0 z-40 mt-1.5 flex w-64 flex-col gap-0.5 rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-lift">
                        {puesto.superficies.slice(FIJAS).map((s, j) => {
                          const Icono = s.icono;
                          const n = FIJAS + j + 1;
                          return (
                            <Link
                              key={s.href}
                              href={s.href}
                              role="menuitem"
                              aria-current={s.href === pathname ? "page" : undefined}
                              aria-keyshortcuts={`Alt+${n}`}
                              onClick={() => setMasAbierto(false)}
                              className={cn(
                                "flex min-h-12 items-center gap-2.5 rounded-[0.4rem] px-3 text-sm no-underline focus-visible:outline-2 focus-visible:outline-brand",
                                s.href === pathname ? "bg-brand/15 font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                              )}
                            >
                              <Icono className="size-(--icono-texto) shrink-0" aria-hidden="true" />
                              <span className="min-w-0 flex-1">{s.corto}</span>
                              <Tecla>Alt {n}</Tecla>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </li>
                )}
                {otros.length > 0 && (
                  <li className="flex-none">
                  <button
                    type="button"
                    aria-label="Otros puestos"
                    title="Otros puestos"
                    aria-haspopup="dialog"
                    aria-expanded={otrosAbierto}
                    onClick={() => setOtrosAbierto(true)}
                    className="grid size-12 shrink-0 place-content-center rounded-[0.4rem] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <ArrowLeftRight size={18} aria-hidden="true" />
                  </button>
                  </li>
                )}
              </ul>
            </nav>
          )
        )}

        {/* ── contexto: píldoras de la misma altura ─────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* B5-6: cómo está la impresora de esta estación (sin papel, no responde, por el respaldo), con sonido. */}
          <EstadoDeImpresoras para={pathname.startsWith("/mesas") ? "salon" : "caja"} />
          {/* ADR-015: lo que no salió en papel se ve aquí, con su lista y «Reintentar». */}
          <AvisoDeImpresion />
          {!abreTurno && sinTurno ? null : sinTurno ? (
            <Pildora
              tono="crit"
              icono={<TriangleAlert size={14} />}
              texto="Turno sin abrir"
            />
          ) : (
            <Pildora
              tono="tenue"
              icono={<Clock size={14} />}
              texto={`Turno desde ${turnoDesde}`}
              ocultarTextoHasta="escritorio"
              titulo={`Turno de ${contexto.turno!.punto} abierto desde las ${turnoDesde}`}
            />
          )}

          {/* ADR-005: con qué tasa se está cobrando, siempre visible. */}
          {sinTasa ? (
            <Pildora
              tono="crit"
              icono={<TriangleAlert size={14} />}
              texto="Sin tasa"
            />
          ) : (
            <Pildora
              tono="tenue"
              icono={<TrendingUp size={14} />}
              texto={`Bs. ${formatTasaVE(tasaVigente.value)}`}
              ocultarTextoHasta="sm"
              titulo={`Tasa ${tasaVigente.source} Bs. ${formatTasaVE(tasaVigente.value)}, capturada a las ${formatClock(Date.parse(tasaVigente.capturedAt), sucursal.formatoHora, sucursal.zonaHoraria)}`}
            />
          )}

          {offline && (
            <Pildora
              tono="warn"
              icono={<WifiOff size={14} />}
              texto="Sin conexión en vivo"
              titulo="Sin canal con el servidor: lo que hagan los demás equipos se ve cada 30 s hasta que vuelva"
            />
          )}


          <span
            className="mx-0.5 hidden h-6 w-px bg-line apaisado:block"
            aria-hidden="true"
          />

          <button
            type="button"
            onClick={() => {
              if (esPantallaCompleta) salirDePantallaCompleta();
              else pedirPantallaCompleta();
            }}
            aria-label={
              esPantallaCompleta
                ? "Salir de pantalla completa"
                : "Pantalla completa"
            }
            title={
              esPantallaCompleta
                ? "Salir de pantalla completa"
                : "Pantalla completa"
            }
            className="l2-solo-instalada grid size-12 shrink-0 place-content-center rounded-[0.45rem] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {esPantallaCompleta ? (
              <Minimize size={18} aria-hidden="true" />
            ) : (
              <Maximize size={18} aria-hidden="true" />
            )}
          </button>

          {/* B4-15: el sonido de los avisos de pulseras, en el parque y la caja. */}
          {["/monitor", "/caja"].some((r) => pathname === r || pathname.startsWith(`${r}/`)) && <BotonSonidoDeAvisos />}

          {/* La ayuda de esta pantalla (T-12): también con F1. */}
          <BotonAyuda className={cn(PILDORA, "size-12 px-0")} />
          <span className={cn(PILDORA, "h-12 gap-2 pr-1 pl-1 text-ink-2")}>
            {operador ? (
              // Tocar el propio nombre abre «Mi cuenta» (T-14): cambiar el PIN.
              <MiCuenta nombre={operador.nombre} rol={operador.rol} className="flex h-10 items-center gap-2 px-1">
                <Initial name={operador.nombre} tone="idle" className="size-8 rounded-[0.45rem] text-[11.5px]" />
                <span className="hidden leading-tight min-[1600px]:block">
                  <span className="block text-[12.5px] font-medium text-ink">{operador.nombre}</span>
                  <span className="block text-[11px] text-ink-3">{operador.rol}</span>
                </span>
              </MiCuenta>
            ) : (
              <>
                <Initial name="?" tone="warn" className="size-8 rounded-[0.45rem] text-[11.5px]" />
                <span className="hidden leading-tight min-[1600px]:block">
                  <span className="block text-[12.5px] font-medium text-state-warn">Sin identificar</span>
                  <span className="block text-[11px] text-ink-3">Entra por el acceso</span>
                </span>
              </>
            )}
            <Link
              href="/acceso"
              onClick={salir}
              aria-label={
                operador
                  ? `Cambiar de usuario (sesión de ${operador.nombre})`
                  : "Entrar por el acceso"
              }
              title="Cambiar de usuario"
              className="grid size-12 place-content-center rounded-[0.45rem] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <LogOut size={15} aria-hidden="true" />
            </Link>
          </span>
        </div>
      </div>
      <Sheet
        abierto={otrosAbierto}
        onCerrar={() => setOtrosAbierto(false)}
        titulo="Ir a otro puesto"
        descripcion="Las superficies que tu rol puede abrir."
      >
        <div className="flex flex-col gap-6 py-4">
          {otros.map((p) => (
            <div key={p.id} className="flex flex-col gap-2">
              <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                {p.nombre}
              </h3>
              <div className="flex flex-col gap-1.5">
                {p.superficies.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    onClick={() => setOtrosAbierto(false)}
                    className="flex min-h-12 items-center rounded-[var(--radius-control)] border border-line bg-base/40 px-3 text-[13px] font-medium no-underline transition-colors hover:border-brand/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="text-ink">{s.largo}</span>
                    <span className="ml-auto text-[13px] font-normal text-ink-3">
                      {s.corto}
                    </span>
                    {s.href === "/caja" && porCobrar > 0 && (
                      <span className="tnum ml-2 rounded-full bg-brand px-1.5 text-[11px] leading-5 font-bold text-on-brand">
                        {porCobrar}
                        <span className="sr-only"> por cobrar</span>
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Sheet>
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
  ocultarTextoHasta?: "sm" | "lg" | "escritorio";
  titulo?: string;
}) {
  return (
    <span
      title={titulo ?? texto}
      className={cn(
        PILDORA,
        "shrink-0 text-[13px] whitespace-nowrap",
        TONO[tono],
      )}
    >
      <span aria-hidden="true" className="shrink-0">
        {icono}
      </span>
      <span
        className={cn(
          "tnum font-medium",
          ocultarTextoHasta === "sm" && "hidden sm:inline",
          ocultarTextoHasta === "lg" && "hidden lg:inline",
          ocultarTextoHasta === "escritorio" && "hidden min-[1440px]:inline",
        )}
      >
        {texto}
        {sufijo && (
          <span className="ml-1 text-[11px] opacity-70">{sufijo}</span>
        )}
      </span>
    </span>
  );
}

/** El nombre del puesto de una sola pantalla (T-21): el mesero y la monitora no ven una pestaña gigante. */
function NombreDelPuesto({ nombre, superficie }: { nombre: string; superficie: Puesto["superficies"][number] }) {
  const Icono = superficie.icono;
  return (
    <span title={superficie.largo} className="inline-flex h-12 min-w-0 items-center gap-2 px-2 font-display text-seccion font-bold text-ink">
      <Icono className="size-(--icono-texto) shrink-0 text-brand" aria-hidden="true" />
      <span className="truncate">{nombre}</span>
    </span>
  );
}

/** Una pestaña de la caja: su icono, su nombre, lo que espera y, desde 1440 px, su número (Alt+N, T-21). */
function PestanaDelPuesto({
  superficie: s,
  numero,
  activa,
  porCobrar,
}: {
  superficie: Puesto["superficies"][number];
  numero: number;
  activa: boolean;
  porCobrar: number;
}) {
  const Icono = s.icono;
  return (
    <Link
      href={s.href}
      aria-current={activa ? "page" : undefined}
      aria-keyshortcuts={`Alt+${numero}`}
      title={`${s.largo} · Alt+${numero}`}
      className={cn(
        "flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[0.4rem] px-3 text-sm",
        "whitespace-nowrap no-underline apaisado:flex-none apaisado:justify-start",
        "transition-all duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        activa ? "bg-brand text-on-brand font-semibold shadow-sm" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icono className="size-(--icono-texto) shrink-0" aria-hidden="true" />
      {s.corto}
      {!activa && porCobrar > 0 && (
        <span className="tnum ml-1 rounded-full bg-brand px-1.5 text-[11px] leading-5 font-bold text-on-brand">
          {porCobrar}
          <span className="sr-only"> por cobrar</span>
        </span>
      )}
      <span className="hidden min-[1440px]:inline">
        <Tecla claro={activa}>{numero}</Tecla>
      </span>
    </Link>
  );
}

/** Una tecla, como en la ayuda de atajos. */
function Tecla({ children, claro = false }: { children: React.ReactNode; claro?: boolean }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "tnum ml-1 rounded border border-b-2 px-1 font-mono text-[10.5px] leading-4 font-semibold",
        claro ? "border-on-brand/40 text-on-brand/85" : "border-line-strong text-ink-3",
      )}
    >
      {children}
    </kbd>
  );
}
