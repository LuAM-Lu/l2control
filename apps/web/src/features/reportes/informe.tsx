"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, LoaderCircle, Printer } from "lucide-react";
import type { MoneyDto } from "@l2/contracts";
import { periodoPredefinido, type PeriodoPredefinido } from "@l2/domain-cash";
import { money, toMajor, type CurrencyCode } from "@l2/domain-money";
import { Button, CAMPO_DE_FILTRO, FiltroSegmentado, TAMANO_ICONO, cn, formatMoneyVE } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";

/**
 * Las piezas de un informe (Etapa 11, M-29): la tabla, que se ve igual en la pantalla y en el papel, y el documento A4
 * que el navegador imprime o guarda como PDF (sin Excel, decisión del usuario). Cada informe arma sus secciones una vez
 * y las dos vistas las pintan: lo que sale en el PDF es lo mismo que se ve.
 */

/** Un importe del informe como se lee en Venezuela: «$ 12.50», «Bs. 1.409,29». */
export const importe = (m: MoneyDto) => formatMoneyVE(toMajor(money(BigInt(m.minor), m.currency as CurrencyCode)), m.currency);

const DIA = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** Un día de negocio («2026-10-08») en palabras: «8 oct 2026». Es un día del local, no un instante: no cambia de zona. */
export const diaDelInforme = (dia: string) => DIA.format(Date.parse(`${dia}T00:00:00Z`));
/** El periodo en palabras: un día, o del primero al último. */
export const periodoEnPalabras = (p: { desde: string; hasta: string }) =>
  p.desde === p.hasta ? diaDelInforme(p.desde) : `Del ${diaDelInforme(p.desde)} al ${diaDelInforme(p.hasta)}`;

/** Una parte de un total en por ciento, con un decimal y sin coma flotante: «37,5 %». */
export function porciento(parte: bigint, total: bigint): string {
  if (total <= 0n) return "—";
  const porMil = (parte * 1000n + total / 2n) / total;
  return `${porMil / 10n},${porMil % 10n} %`;
}

export type Columna = Readonly<{ titulo: string; derecha?: boolean; clase?: string }>;

/** Un grupo de filas de una tabla impresa (B11-5): una categoría, con su franja arriba y su subtotal debajo. */
export type GrupoDeInforme = Readonly<{ titulo: string; filas: readonly (readonly ReactNode[])[]; pie?: readonly ReactNode[] | undefined }>;

/** Una sección de un informe: su tabla, su total y qué decir si no hay nada. */
export type SeccionDeInforme<T extends string = string> = Readonly<{
  id: T;
  titulo: string;
  columnas: readonly Columna[];
  filas: readonly (readonly ReactNode[])[];
  /** Las filas por grupo, cada uno con su franja y su subtotal, en la misma tabla (B11-5). Con grupos, `filas` va vacía. */
  grupos?: readonly GrupoDeInforme[];
  /** La fila del total, si la lleva. */
  pie?: readonly ReactNode[];
  vacio: string;
  /** Una nota debajo de la tabla (de dónde sale una cifra). */
  nota?: string;
}>;

/**
 * La tabla de una sección. En `papel`, tinta negra, bordes finos y 9 pt, compacta (B11-5: un renglón por fila, unos 40 por
 * hoja); el encabezado se repite en cada página. En la pantalla, la de las tablas del panel.
 */
export function TablaDeInforme({ seccion, papel = false }: { seccion: SeccionDeInforme; papel?: boolean }) {
  const { columnas, filas, grupos, pie, vacio, nota } = seccion;
  const th = papel ? "border-b border-current/60 px-1.5 py-0.5 text-left text-[8.5pt] font-bold whitespace-nowrap" : "px-3 py-2 text-left text-etiqueta font-semibold tracking-[0.06em] text-ink-2 uppercase";
  const td = papel ? "px-1.5 py-px align-top" : "px-3 py-2 align-top";
  if (filas.length === 0 && !grupos?.length) return <p className={papel ? "py-1 text-[9pt]" : "rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-cuerpo text-ink-3"}>{vacio}</p>;
  const fila = (f: readonly ReactNode[], i: number | string) => (
    <tr key={i} className={papel ? "border-b border-current/20" : undefined}>
      {f.map((celda, j) => (
        <td key={j} className={cn(td, columnas[j]?.derecha && "tnum text-right whitespace-nowrap", columnas[j]?.clase)}>
          {celda}
        </td>
      ))}
    </tr>
  );
  return (
    <>
      <div className={papel ? "" : "overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card"}>
        <table className={cn("w-full border-collapse", papel ? "text-[9pt] leading-tight" : "text-detalle")}>
          <thead className={papel ? "" : "bg-surface-2"}>
            <tr>
              {columnas.map((c, i) => (
                <th key={`${i}-${c.titulo}`} scope="col" className={cn(th, c.derecha && "text-right", c.clase)}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={papel ? "" : "divide-y divide-line"}>
            {filas.map((f, i) => fila(f, i))}
            {/* B11-5: cada grupo con su franja (no se separa de su primera fila) y su subtotal. */}
            {grupos?.map((g, k) => (
              <Fragment key={`g-${k}`}>
                <tr className="[break-after:avoid]">
                  <th
                    colSpan={columnas.length}
                    scope="colgroup"
                    className={
                      papel
                        ? "bg-current/10 px-1.5 py-0.5 text-left text-[8.5pt] font-bold tracking-[0.04em] uppercase"
                        : "bg-surface-2 px-3 py-1.5 text-left text-etiqueta font-semibold tracking-[0.06em] text-ink-2 uppercase"
                    }
                  >
                    {g.titulo}
                  </th>
                </tr>
                {g.filas.map((f, i) => fila(f, `${k}-${i}`))}
                {g.pie && (
                  <tr className={papel ? "border-b border-current/50 font-semibold" : "bg-surface-2/50 font-semibold text-ink"}>
                    {g.pie.map((celda, j) => (
                      <td key={j} className={cn(td, columnas[j]?.derecha && "tnum text-right whitespace-nowrap", columnas[j]?.clase)}>
                        {celda}
                      </td>
                    ))}
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          {pie && (
            <tfoot>
              <tr className={papel ? "border-t border-current/60 font-bold" : "border-t border-line-strong bg-surface-2 font-semibold text-ink"}>
                {pie.map((celda, j) => (
                  <td key={j} className={cn(td, columnas[j]?.derecha && "tnum text-right whitespace-nowrap", columnas[j]?.clase)}>
                    {celda}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {nota && <p className={papel ? "mt-0.5 text-[8pt]" : "mt-1.5 text-nota text-ink-3"}>{nota}</p>}
    </>
  );
}

/**
 * El documento A4 de un informe: blanco y negro en la pantalla y en el papel. Encabezado con el local, el informe, el
 * periodo y quién lo pidió y cuándo; el número de página lo pone la impresión. «Imprimir o guardar PDF» abre el
 * diálogo del navegador, donde se elige la impresora o «Guardar como PDF».
 */
export function DocumentoDeInforme({
  titulo,
  local,
  periodo,
  filtro,
  generadoEn,
  generadoPor,
  volver,
  children,
}: {
  titulo: string;
  local: string;
  periodo: string;
  /** Lo que acota el informe además del periodo («Solo los turnos de Marisol»). */
  filtro?: string | null;
  generadoEn: string;
  /** Quién lo pidió; una hoja en blanco para llenar a mano no lo lleva. */
  generadoPor?: string | undefined;
  volver: string;
  children: ReactNode;
}) {
  const reloj = useReloj();
  const instante = Date.parse(generadoEn);
  return (
    <div className="l2-informe-zona fixed inset-0 overflow-y-auto bg-base">
      <div className="l2-no-imprime mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-3 py-4">
        <p className="text-detalle text-ink-2">Así sale en el papel. En el diálogo de impresión, elige la impresora o «Guardar como PDF».</p>
        <div className="flex gap-2">
          <Link
            href={volver as Route}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
          >
            <ArrowLeft size={TAMANO_ICONO.admin} aria-hidden="true" />
            Volver
          </Link>
          <Button surface="admin" variant="primary" className="gap-1.5" onClick={() => window.print()}>
            <Printer size={TAMANO_ICONO.admin} aria-hidden="true" />
            Imprimir o guardar PDF
          </Button>
        </div>
      </div>
      <article className="l2-informe mx-auto mb-6 w-[210mm] max-w-full px-[10mm] py-[10mm] shadow-card">
        <header className="mb-3 border-b-2 border-current pb-2">
          <p className="text-[9pt] font-semibold tracking-[0.06em] uppercase">{local}</p>
          <h1 className="font-display text-[16pt] leading-tight font-bold">{titulo}</h1>
          <p className="text-[10pt]">
            {periodo}
            {filtro ? ` · ${filtro}` : ""}
          </p>
          <p className="mt-0.5 text-[8.5pt]">
            Generado el {reloj.diaConAnio(instante)} a las {reloj.hora(instante)}
            {generadoPor ? ` por ${generadoPor}` : ""}
          </p>
        </header>
        {children}
      </article>
    </div>
  );
}

/** Una sección del documento: su título y su tabla, sin partir el título de su tabla. */
export function SeccionImpresa({ seccion }: { seccion: SeccionDeInforme }) {
  return (
    <section className="mb-2.5">
      <h2 className="mb-0.5 text-[10.5pt] font-bold [break-after:avoid]">{seccion.titulo}</h2>
      <TablaDeInforme seccion={seccion} papel />
    </section>
  );
}

/**
 * En el papel (B11-5, M-35): las secciones de cada categoría juntas en una sola tabla, con la categoría como franja y su
 * subtotal debajo. Un solo encabezado de columnas, que se repite en cada página, en vez de uno por categoría. Las
 * secciones tienen las mismas columnas.
 */
export function enBandas(id: string, titulo: string, secciones: readonly SeccionDeInforme[], pie?: readonly ReactNode[]): SeccionDeInforme {
  return {
    id,
    titulo,
    columnas: secciones[0]?.columnas ?? [],
    filas: [],
    grupos: secciones.map((s) => ({ titulo: s.titulo, filas: s.filas, pie: s.pie })),
    ...(pie ? { pie } : {}),
    vacio: secciones[0]?.vacio ?? "",
  };
}

/**
 * El nombre de un producto en una fila (B11-5): en el papel, en un renglón, con su presentación o su SKU al lado en letra
 * menor; en la pantalla, debajo.
 */
export function NombreDeProducto({ nombre, detalle, papel = false }: { nombre: ReactNode; detalle?: string | null | undefined; papel?: boolean }) {
  if (papel) {
    return (
      <span>
        <span className="font-semibold">{nombre}</span>
        {detalle && <span className="text-[7.5pt]"> · {detalle}</span>}
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      <span className="font-semibold text-ink">{nombre}</span>
      {detalle && <span className="text-nota text-ink-3">{detalle}</span>}
    </span>
  );
}

type PeriodoDeUnToque = Readonly<{ id: PeriodoPredefinido; nombre: string }>;

const PERIODOS: readonly PeriodoDeUnToque[] = [
  { id: "HOY", nombre: "Hoy" },
  { id: "AYER", nombre: "Ayer" },
  { id: "SEMANA", nombre: "Esta semana" },
  { id: "MES", nombre: "Este mes" },
  { id: "MES_ANTERIOR", nombre: "Mes anterior" },
];

/** Los de un informe que se cuenta por quincena (el consumo del personal, B3-17). */
export const PERIODOS_POR_QUINCENA: readonly PeriodoDeUnToque[] = [
  { id: "QUINCENA", nombre: "Esta quincena" },
  { id: "QUINCENA_ANTERIOR", nombre: "Quincena anterior" },
  { id: "MES", nombre: "Este mes" },
  { id: "MES_ANTERIOR", nombre: "Mes anterior" },
];

/**
 * El periodo de un informe: los de un toque (hoy, ayer, esta semana, este mes y el anterior) y un rango a mano, con lo
 * que cada informe filtre además (`children`). Quien lo usa le pone `key` con el periodo pedido, para que el rango a mano
 * vuelva a lo pedido al navegar.
 */
export function FiltroDePeriodo({
  hoy,
  desde: pedidoDesde,
  hasta: pedidoHasta,
  cargando,
  onPeriodo,
  periodos = PERIODOS,
  children,
}: {
  hoy: string;
  desde: string;
  hasta: string;
  cargando: boolean;
  onPeriodo: (p: { desde: string; hasta: string }) => void;
  /** Los de un toque; sin decirlo, de hoy al mes anterior. */
  periodos?: readonly PeriodoDeUnToque[];
  children?: ReactNode;
}) {
  const [desde, setDesde] = useState(pedidoDesde);
  const [hasta, setHasta] = useState(pedidoHasta);
  const cambiado = desde !== pedidoDesde || hasta !== pedidoHasta;
  const valido = desde !== "" && hasta !== "" && desde <= hasta;
  const elegido =
    periodos.find((p) => {
      const r = periodoPredefinido(p.id, hoy);
      return r.desde === pedidoDesde && r.hasta === pedidoHasta;
    })?.id ?? "RANGO";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <FiltroSegmentado<PeriodoPredefinido | "RANGO">
        etiqueta="Periodo"
        opciones={periodos}
        valor={elegido}
        onCambiar={(id) => {
          if (id !== "RANGO") onPeriodo(periodoPredefinido(id, hoy));
        }}
      />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) onPeriodo({ desde, hasta });
        }}
      >
        <label className="flex items-center gap-1.5 text-detalle text-ink-2">
          Desde
          <input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className={cn(CAMPO_DE_FILTRO, "tnum")} />
        </label>
        <label className="flex items-center gap-1.5 text-detalle text-ink-2">
          Hasta
          <input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className={cn(CAMPO_DE_FILTRO, "tnum")} />
        </label>
        <Button type="submit" surface="admin" variant="neutral" disabled={!cambiado || !valido || cargando}>
          Ver
        </Button>
      </form>
      {children}
      {cargando && (
        <span role="status" className="flex items-center gap-1.5 text-detalle text-ink-3">
          <LoaderCircle size={TAMANO_ICONO.texto} className="animate-spin" aria-hidden="true" />
          Leyendo…
        </span>
      )}
    </div>
  );
}
