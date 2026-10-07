"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CircleCheck, Clock, FileText, PackageX, Sparkles, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import type { PuestaAPuntoDto, ReservaEventoDto, ResumenDelDiaDto } from "@l2/contracts";
import { add, money, toMajor, zero } from "@l2/domain-money";
import { Container, MoneyDisplay, cn } from "@l2/ui";
import { EnVivo } from "./EnVivo.tsx";
import { PuestaAPunto } from "./PuestaAPunto.tsx";
import { TurnosDelDia } from "../cash/TurnosDelDia.tsx";
import { EntradasPorMedio, porMedioDelLibro } from "../cash/EntradasPorMedio.tsx";
import { ExcepcionesTurno } from "../cash/ExcepcionesTurno.tsx";
import { useTasaVigente } from "../cash/TasasProvider.tsx";
import { formatTasaVE } from "../cash/tasa-format.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { AvisoDeImpresion } from "../impresion/AvisoDeImpresion.tsx";
import { ChipEventosDeHoy } from "../eventos/AvisoEventosDeHoy.tsx";
import type { AvisoDeVersion } from "../sistema/sistema.servidor.ts";
import type { AvisoDeRespaldos } from "../sistema/respaldos.servidor.ts";
import { rutaSeccion } from "./navigation.ts";

/**
 * Inicio del back-office — F9-00, §9.10.4.
 *
 * QUÉ SE ARREGLÓ AQUÍ
 *
 * La versión anterior era un documento, no un panel: todo pesaba lo mismo, el
 * saludo ocupaba el sitio más visible de la pantalla sin decir nada, y cada
 * bloque venía con dos líneas de prosa explicando lo que ya se veía. Un panel
 * que hay que leer entero para saber si el día va bien no sirve de panel.
 *
 * Ahora hay tres alturas, y solo tres:
 *
 *  1. **El local ahora** (`EnVivo`): lo que pide acción y las cinco zonas, que
 *     se mueven solas con los eventos.
 *  2. **El día**: lo acumulado, grande y comparado.
 *  3. **El detalle**: de dónde vino el dinero y qué se salió de lo normal.
 *
 * DOS TABLEROS FUSIONADOS EN UNO — 2026-09-14
 *
 * Esta pantalla enseñaba «en sala», «mesas en servicio», «en cocina» y
 * «requiere atención» por su cuenta, con cifras de mesas y cocina **escritas a
 * mano en la ruta** (`mesasOcupadas={5}`), mientras `/panel/vivo` calculaba
 * esas mismas cosas de verdad. Dos tableros que dicen lo mismo con números
 * distintos son peores que ninguno: el de al lado se convirtió en el bloque de
 * arriba de este, y aquellas cifras inventadas se borraron.
 *
 * El reparto que queda es de **horizonte temporal**, no de tema: arriba lo que
 * se mueve ahora, abajo lo que ya pasó hoy. La comparación es siempre contra
 * **el mismo día de la semana pasada**, nunca contra ayer: comparar un sábado
 * con un viernes en un parque infantil no dice nada, y es el error más común de
 * los paneles de negocio.
 */

export function InicioScreen({
  resumen,
  ninosHoy,
  ninosSemanaPasada,
  fecha,
  diaSemana,
  turnos,
  enServicio,
  inventario = null,
  eventosHoy = [],
  puestaAPunto = null,
  version = null,
  respaldos = null,
}: {
  /** El día según el libro (B3-5); `null` sin permiso de ver la sucursal o sin servidor. */
  resumen: ResumenDelDiaDto | null;
  ninosHoy: number;
  /** `null` = sin histórico con el que comparar: no se pinta variación. */
  ninosSemanaPasada: number | null;
  fecha: string;
  diaSemana: string;
  /** Los turnos abiertos de la sucursal, del servidor (B3-1). Vacío = ninguno. */
  turnos: readonly { abiertoEn: string; abiertoPor: string; punto: string }[];
  /** Cuándo una comanda tarda y cuándo está atrasada. */
  /** Si el turno está abierto: fuera de servicio, un puesto vacío no es noticia. */
  enServicio: boolean;
  /** Lo que hay que reponer (B9-5); `null` si nada a la venta lleva existencia. */
  inventario?: Readonly<{ agotados: number; bajoMinimo: number }> | null;
  /** Los cumpleaños de hoy que siguen en pie (B10-1): «Hoy hay un evento». */
  eventosHoy?: readonly ReservaEventoDto[];
  /** Lo que falta para el primer día (JORNADA §2); `null` para quien no gestiona personas. */
  puestaAPunto?: PuestaAPuntoDto | null;
  /** Una versión nueva del sistema (T-8b); `null` si no hay, en staging o para quien no decide. */
  version?: AvisoDeVersion | null;
  /** Los respaldos (B7-4), solo si algo no va bien; `null` si van al día o para quien no decide. */
  respaldos?: AvisoDeRespaldos | null;
}) {
  const [tabDetalle, setTabDetalle] = useState<"caja" | "excepciones">("caja");
  // La tasa vigente, de la misma fuente que la caja y la barra de las estaciones (B2-1c): llega
  // sola cuando el BCV publica, sin recargar la página.
  const { tasa: vigente } = useTasaVigente("USD/VES");
  const tasa = vigente ? formatTasaVE(vigente.value) : null;
  const diaMinuscula = diaSemana.toLowerCase();
  const { ajustes } = useSucursal();
  const primero = turnos[0] ?? null;
  const turnoDesde = primero ? formatClock(Date.parse(primero.abiertoEn), ajustes.formatoHora, ajustes.zonaHoraria) : null;

  const variacion = (hoy: number, antes: number | null) =>
    antes === null || antes === 0 ? null : Math.round(((hoy - antes) / antes) * 100);

  const excepciones = resumen?.excepciones ?? [];
  const porMedio = resumen ? porMedioDelLibro(resumen.porMedio) : [];
  // Las diferencias de arqueo de los turnos cerrados hoy, en dólares con la tasa de cada turno.
  const cerrados = resumen?.turnos.filter((t) => t.turno.estado === "CERRADO_Z") ?? [];
  const diferencia = cerrados.reduce((acc, t) => (t.diferenciaEnDolares ? add(acc, money(BigInt(t.diferenciaEnDolares.minor), "USD")) : acc), zero("USD"));
  const firmoSupervision = cerrados.filter((t) => t.firma === "SUPERVISION").length;
  const vendidas = resumen ? resumen.ventas.cantidad - resumen.ventas.anuladas : 0;

  return (
    <Container ancho="operacion" className="max-w-[1600px] py-3 xl:py-3.5 pb-6">
      {/* ─────────────── cabecera delgada: contexto, no protagonismo ────── */}
      <header className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl leading-none font-bold tracking-tight text-ink">
            Hoy
          </h1>
          <p className="mt-0.5 text-xs lg:text-[12.5px] text-ink-3">
            {diaSemana} {fecha}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Componente Tasa Oficial BCV */}
          <div className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface/80 px-3 py-1.5 text-xs text-ink-2 shadow-sm">
            <div className="flex items-center gap-1.5">
              {/* El punto dice lo mismo que el chip: verde solo con tasa vigente (§8.2). */}
              <span className={cn("size-2 rounded-full", tasa ? "bg-state-ok l2-pulse" : "bg-state-crit")} aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3">BCV</span>
            </div>
            <div className="flex items-baseline gap-1 border-l border-line pl-2.5">
              {/* La misma tasa que la barra de las estaciones: una cifra escrita
                  a mano aquí contradecía la que se usa para cobrar. */}
              <span className="tnum font-mono text-sm font-bold text-ink">{tasa ?? "—"}</span>
              <span className="text-[10.5px] text-ink-3">Bs. / $</span>
            </div>
            {tasa ? (
              <span className="hidden sm:inline-block rounded-full bg-state-ok-bg/60 border border-state-ok/30 px-2 py-0.2 text-[10.5px] font-medium text-state-ok">
                Confirmada
              </span>
            ) : (
              <span className="rounded-full border border-state-crit/30 bg-state-crit-bg px-2 py-0.2 text-[10.5px] font-medium text-state-crit">
                Sin tasa
              </span>
            )}
          </div>

          {/* B10-1: los cumpleaños de hoy, antes que nada de lo demás: cambian cómo se prepara el día. */}
          <ChipEventosDeHoy reservas={eventosHoy} />
          {/* B3-7: lo cargado desde papel que nadie ha revisado frena el Z y el cierre: se dice aquí. */}
          {resumen && resumen.papelPorRevisar > 0 && <AvisoDePapel porRevisar={resumen.papelPorRevisar} />}
          {/* B9-5: lo que hay que reponer, con color + icono + texto; lleva al inventario. */}
          {inventario && <AvisoInventario {...inventario} />}
          {/* Lo que no salió en papel (ADR-015, ADR-022: las comandas fallidas, en Inicio). */}
          <AvisoDeImpresion className="h-auto min-h-8 py-1.5 text-xs lg:text-[13px]" />
          {version && <AvisoVersion {...version} />}
          {respaldos && <AvisoRespaldos {...respaldos} />}

          {/* Enlace al Turno */}
          <Link
            href={"/turno" as Route}
            className="group inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface/80 px-3 py-1.5 text-xs lg:text-[13px] text-ink-2 transition-all duration-[var(--dur-rapida)] hover:border-line-strong hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand shadow-sm"
          >
            <span>
              {primero && turnos.length > 1 ? (
                <>
                  <span className="tnum font-medium text-ink">{turnos.length}</span> turnos abiertos · desde{" "}
                  <span className="tnum font-medium text-ink">{turnoDesde}</span>
                </>
              ) : primero ? (
                <>
                  Turno desde <span className="tnum font-medium text-ink">{turnoDesde}</span> · {primero.abiertoPor}
                </>
              ) : (
                "Sin turno abierto"
              )}
            </span>
            <ArrowRight
              size={13}
              className="text-ink-3 transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5 group-hover:text-brand"
              aria-hidden="true"
            />
          </Link>
        </div>
      </header>

      {/* T-4: tras la instalación, lo que falta para abrir; se tacha sola y con todo hecho no sale. */}
      {puestaAPunto && <PuestaAPunto puesta={puestaAPunto} />}

      {/* ──────────────────────────── 1 · el local ahora ─────────────────── */}
      <EnVivo
        enServicio={enServicio}
      />

      {/* ───────────────────────────── 2 · el día ────────────────────────── */}
      <section aria-label="El día" className="mb-3 xl:mb-4">
        <h2 className="mb-1.5 text-[10px] font-bold tracking-[0.1em] text-ink-3 uppercase">
          El día · lo acumulado
        </h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
          <Cifra
            etiqueta="Vendido"
            valor={
              resumen === null ? (
                <span className="text-sm font-medium text-ink-3">Sin datos</span>
              ) : (
                <MoneyDisplay value={toMajor(money(BigInt(resumen.ventas.total.minor), "USD"))} currency="USD" size="lg" />
              )
            }
            pie={
              resumen === null
                ? "Sin acceso al libro del día"
                : `${vendidas} ${vendidas === 1 ? "venta" : "ventas"}${resumen.ventas.anuladas > 0 ? ` · ${resumen.ventas.anuladas} anuladas` : ""}${resumen.ventas.desdePapel > 0 ? ` · ${resumen.ventas.desdePapel} desde papel` : ""}`
            }
          />
          <Cifra
            etiqueta="Niños atendidos"
            valor={<Numero>{ninosHoy}</Numero>}
            variacion={variacion(ninosHoy, ninosSemanaPasada)}
            pie={
              ninosSemanaPasada === null
                ? "Sin histórico con qué comparar"
                : `${ninosSemanaPasada} el ${diaMinuscula} pasado`
            }
          />
          <Cifra
            etiqueta="Diferencias de arqueo"
            valor={
              cerrados.length === 0 ? (
                <span className="text-sm font-medium text-ink-3">Sin cortes Z</span>
              ) : (
                <MoneyDisplay value={toMajor(diferencia)} currency="USD" size="lg" />
              )
            }
            pie={
              cerrados.length === 0
                ? "Salen al cerrar cada turno"
                : `${cerrados.length} ${cerrados.length === 1 ? "turno cerrado" : "turnos cerrados"}${firmoSupervision > 0 ? ` · ${firmoSupervision} con firma de supervisión` : ""}`
            }
          />
        </div>
      </section>

      {/* ─────────────────────────── 3 · el detalle ──────────────────────── */}
      <section aria-label="Detalle operativo y financiero">
        {/* Selector segmentado en Tablet y Mobile (<1280px) para evitar scroll vertical excesivo */}
        <div className="mb-4 flex items-center rounded-[var(--radius-control)] border border-line bg-surface p-1 xl:hidden">
          <button
            type="button"
            onClick={() => setTabDetalle("caja")}
            className={cn(
              "flex-1 rounded-[calc(var(--radius-control)-2px)] py-2 text-center text-xs font-semibold tracking-wide transition-colors duration-[var(--dur-rapida)]",
              tabDetalle === "caja"
                ? "bg-surface-2 text-ink shadow-sm"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            Flujo de caja
          </button>
          <button
            type="button"
            onClick={() => setTabDetalle("excepciones")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] py-2 text-center text-xs font-semibold tracking-wide transition-colors duration-[var(--dur-rapida)]",
              tabDetalle === "excepciones"
                ? "bg-surface-2 text-ink shadow-sm"
                : "text-ink-3 hover:text-ink-2",
            )}
          >
            <span>Excepciones del día</span>
            {excepciones.length > 0 && (
              <span className="tnum rounded-full bg-surface-2/80 px-2 py-0.5 text-[11px] font-medium text-ink-2">
                {excepciones.length}
              </span>
            )}
          </button>
        </div>

        {/* En Desktop (xl:): 3 columnas paralelas perfectamente balanceadas. En Tablet/Mobile: selector segmentado */}
        <div className="xl:grid xl:grid-cols-3 xl:gap-4 2xl:gap-5">
          <div className={cn(tabDetalle !== "caja" && "hidden xl:block")}>
            <TurnosDelDia turnos={resumen?.turnos ?? []} hoy={resumen?.dia ?? null} className="h-full" />
          </div>
          <div className={cn(tabDetalle !== "caja" && "mt-4 xl:mt-0 hidden xl:block")}>
            <EntradasPorMedio porMedio={porMedio} titulo="Cobrado hoy" className="h-full" />
          </div>
          <div className={cn(tabDetalle !== "excepciones" && "mt-4 xl:mt-0 hidden xl:block")}>
            <ExcepcionesTurno excepciones={excepciones} titulo="Excepciones del día" className="h-full xl:max-h-[420px]" />
          </div>
        </div>
      </section>

      <p className="mt-6 border-t border-line pt-3 text-[11px] text-ink-3">
        Las cifras del día salen del libro de pagos y de las estancias del servidor, con el mismo dominio
        que usa el arqueo. Lo que no existe se dice («Sin datos»), no se inventa.
      </p>
    </Container>
  );
}

/* ──────────────────────────────────────────────────────────── piezas ── */

/**
 * Las cargas desde papel que esperan revisión (B3-7, V-12): hasta que supervisión las revisa, el turno no se sella
 * ni la jornada se cierra. Color + icono + texto; lleva a la carga, donde se revisan.
 */
function AvisoDePapel({ porRevisar }: { porRevisar: number }) {
  return (
    <Link
      href={"/papel" as Route}
      className="group inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-1.5 text-xs lg:text-[13px] font-medium text-state-warn shadow-sm transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-brand"
    >
      <FileText size={14} aria-hidden="true" />
      <span className="tnum">
        {porRevisar} {porRevisar === 1 ? "carga desde papel por revisar" : "cargas desde papel por revisar"}
      </span>
      <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/** Agotados y bajo mínimo del inventario (B9-5). Sin nada que reponer, lo dice en verde. */
function AvisoInventario({ agotados, bajoMinimo }: { agotados: number; bajoMinimo: number }) {
  const tono = agotados > 0 ? "crit" : bajoMinimo > 0 ? "warn" : "ok";
  const Icono = tono === "crit" ? PackageX : tono === "warn" ? TriangleAlert : CircleCheck;
  const partes = [agotados > 0 ? `${agotados} ${agotados === 1 ? "agotado" : "agotados"}` : null, bajoMinimo > 0 ? `${bajoMinimo} bajo mínimo` : null].filter(Boolean);
  return (
    <Link
      href={"/panel/inventario/productos" as Route}
      className={cn(
        "group inline-flex min-h-8 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 text-xs lg:text-[13px] font-medium shadow-sm transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-brand",
        tono === "crit" && "border-state-crit/40 bg-state-crit-bg text-state-crit",
        tono === "warn" && "border-state-warn/40 bg-state-warn-bg text-state-warn",
        tono === "ok" && "border-line bg-surface/80 text-ink-2 hover:bg-surface-2",
      )}
    >
      <Icono size={14} aria-hidden="true" />
      <span className="tnum">{partes.length > 0 ? `Inventario: ${partes.join(" · ")}` : "Inventario al día"}</span>
      <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function Numero({ children }: { children: React.ReactNode }) {
  return (
    <span className="tnum font-display text-lg sm:text-xl 2xl:text-2xl leading-none font-bold tracking-tight text-ink">
      {children}
    </span>
  );
}

/**
 * Celda de cifra. Las cuatro comparten fondo y separador de un píxel, así que
 * se leen como una sola pieza y no como cuatro tarjetas sueltas: el ojo
 * compara mejor lo que está alineado en una rejilla que lo que flota.
 */
function Cifra({
  etiqueta,
  valor,
  variacion,
  pie,
  barra,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  variacion?: number | null;
  pie: string;
  barra?: number;
}) {
  const sube = variacion !== null && variacion !== undefined && variacion > 0;
  const baja = variacion !== null && variacion !== undefined && variacion < 0;

  return (
    <div className="flex flex-col justify-between gap-0.5 bg-surface px-3 py-1.5 sm:px-3.5 sm:py-2 2xl:px-4 2xl:py-2.5">
      <span className="text-[9.5px] sm:text-[10px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
        {etiqueta}
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {valor}
        {variacion !== null && variacion !== undefined && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-medium",
              sube ? "text-state-ok" : baja ? "text-state-crit" : "text-ink-3",
            )}
          >
            {sube ? (
              <TrendingUp size={12} aria-hidden="true" />
            ) : baja ? (
              <TrendingDown size={12} aria-hidden="true" />
            ) : null}
            <span className="tnum">
              {sube ? "+" : ""}
              {variacion} %
            </span>
          </span>
        )}
      </div>

      {barra !== undefined && (
        <span
          aria-hidden="true"
          className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-base"
        >
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-[var(--dur-normal)] ease-[var(--ease-salida)]",
              barra >= 90 ? "bg-state-crit" : barra >= 70 ? "bg-state-warn" : "bg-state-ok",
            )}
            style={{ width: `${Math.min(barra, 100)}%` }}
          />
        </span>
      )}

      <span className="text-[10px] sm:text-[10.5px] text-ink-2/80 truncate leading-none mt-0.5">{pie}</span>
    </div>
  );
}

/**
 * Una versión nueva del sistema (T-8b): un chip más del encabezado, que lleva a decidir cuándo ponerla.
 * Solo una urgente (una corrección de seguridad o de dinero) se pinta como aviso.
 */
function AvisoVersion({ version, urgente, pedida }: AvisoDeVersion) {
  const Icono = pedida ? Clock : urgente ? TriangleAlert : Sparkles;
  return (
    <Link
      href={rutaSeccion("ajustes", "sistema")}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-xs shadow-sm transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-brand lg:text-[13px]",
        urgente && !pedida
          ? "border-state-warn/40 bg-state-warn-bg text-state-warn hover:border-state-warn"
          : "border-line bg-surface/80 text-ink-2 hover:border-line-strong hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icono size={13} className={cn("shrink-0", !urgente || pedida ? "text-brand" : undefined)} aria-hidden="true" />
      <span>
        {pedida ? (
          <>
            <span className="tnum font-medium text-ink">v{version}</span> {pedida === "AHORA" ? "poniéndose" : "al cierre"}
          </>
        ) : (
          <>
            {urgente ? "Versión urgente" : "Versión nueva"} <span className="tnum font-medium">v{version}</span>
          </>
        )}
      </span>
    </Link>
  );
}

/**
 * Los respaldos (B7-4): un chip del encabezado solo cuando algo no va bien. Que el de anoche no se hiciera es
 * crítico; que la PC del local no los baje, un aviso.
 */
const TEXTO_RESPALDOS: Readonly<Record<AvisoDeRespaldos["nivel"], string>> = {
  FALLIDO: "El respaldo falló",
  ATRASADO: "Respaldo atrasado",
  SIN_BAJAR: "Respaldo sin bajar",
  SIN_RESPALDOS: "Sin respaldos",
};

function AvisoRespaldos({ nivel, aviso }: AvisoDeRespaldos) {
  const critico = nivel === "FALLIDO" || nivel === "ATRASADO";
  return (
    <Link
      href={rutaSeccion("ajustes", "respaldos")}
      title={aviso}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-brand lg:text-[13px]",
        critico ? "border-state-crit/40 bg-state-crit-bg text-state-crit hover:border-state-crit" : "border-state-warn/40 bg-state-warn-bg text-state-warn hover:border-state-warn",
      )}
    >
      <TriangleAlert size={13} className="shrink-0" aria-hidden="true" />
      {TEXTO_RESPALDOS[nivel]}
    </Link>
  );
}
