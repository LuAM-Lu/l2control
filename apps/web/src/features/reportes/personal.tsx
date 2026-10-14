import type { ReactNode } from "react";
import { CircleCheckBig, CircleX, Undo2 } from "lucide-react";
import type { MoneyDto, ValeDto, ValesDelPersonalDto } from "@l2/contracts";
import { TAMANO_ICONO, cn } from "@l2/ui";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { importe, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones de los vales del personal (B3-17, M-37): lo de cada persona en el periodo (la quincena) y cada vale, con
 * lo consumido, su total y si se anuló o se devolvió algo; y los adelantos de efectivo (B3-21), cada uno con su
 * comprobante. Las pintan Caja → Personal (con «Reimprimir vale»), Reportes → Personal y su PDF. Sin tope ni
 * «descontado»: el descuento del sueldo se hace fuera del sistema.
 */

export type SeccionDelPersonal = "personas" | "vales" | "adelantos";

/** Cómo se llama cada sección en el selector. */
export const NOMBRE_DE_SECCION: Readonly<Record<SeccionDelPersonal, string>> = { personas: "Por persona", vales: "Los vales", adelantos: "Adelantos" };

/** La dirección del informe: su periodo. */
export function direccionDelPersonal(base: string, p: { desde: string; hasta: string }): string {
  return `${base}?${new URLSearchParams({ desde: p.desde, hasta: p.hasta }).toString()}`;
}

export const ordenDelVale = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Lo consumido en palabras, agrupado por concepto: «2 × Tequeños, 1 × Refresco». */
export function loConsumido(v: ValeDto): string {
  const n = new Map<string, number>();
  for (const l of v.lineas) {
    const c = l.cortesia ? `${l.concepto} (cortesía)` : l.concepto;
    n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].map(([c, k]) => `${k} × ${c}`).join(", ");
}

/** Cómo quedó un vale: anulado (no cuenta), con algo devuelto, o vale entero. Color, icono y texto (§8.2). */
export function EstadoDelVale({ v, papel = false }: { v: ValeDto; papel?: boolean }) {
  const e = v.anulado
    ? { Icono: CircleX, texto: "Anulado: no cuenta", color: "text-state-crit" }
    : BigInt(v.devuelto.minor) > 0n
      ? { Icono: Undo2, texto: `Devuelto ${importe(v.devuelto)}`, color: "text-state-warn" }
      : { Icono: CircleCheckBig, texto: "Vale", color: "text-state-ok" };
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && e.color)}>
      <e.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
      {e.texto}
    </span>
  );
}

const vales = (n: number) => `${n} ${n === 1 ? "vale" : "vales"}`;
const adelantos = (n: number) => `${n} ${n === 1 ? "adelanto" : "adelantos"}`;
const sumaUsd = (ms: readonly MoneyDto[]): MoneyDto => ({ minor: String(ms.reduce((n, m) => n + BigInt(m.minor), 0n)), currency: "USD" });

/**
 * Las tres secciones: por persona, cada vale y cada adelanto. `accion`, lo que cada vale ofrece en la pantalla
 * («Reimprimir vale»); en el papel, nada.
 */
export function seccionesDelPersonal(
  i: ValesDelPersonalDto,
  reloj: Reloj,
  papel = false,
  accion?: (v: ValeDto) => ReactNode,
  /** Lo que cada persona ofrece en la pantalla (B3-26: «Descontado en la quincena»); en el papel, nada. */
  accionPersona?: (p: ValesDelPersonalDto["porPersona"][number]) => ReactNode,
): SeccionDeInforme<SeccionDelPersonal>[] {
  const conAccion = accion !== undefined && !papel;
  // La quincena de cada persona (B3-26): descontada (cuándo y quién) o pendiente.
  const quincena = (p: ValesDelPersonalDto["porPersona"][number]) =>
    p.descontado && BigInt(p.descontado.despues.minor) === 0n ? (
      <span key="q" className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && "text-state-ok")}>
        <CircleCheckBig size={TAMANO_ICONO.texto} aria-hidden="true" />
        Descontado {reloj.dia(Date.parse(p.descontado.en))} · {p.descontado.por}
      </span>
    ) : p.descontado ? (
      // Descontada antes, con algo registrado después: eso sigue pendiente.
      <span key="q" className="flex flex-col gap-1">
        <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && "text-state-warn")}>
          <Undo2 size={TAMANO_ICONO.texto} aria-hidden="true" />
          Descontado {reloj.dia(Date.parse(p.descontado.en))} · faltan {importe(p.descontado.despues)}
        </span>
        {!papel && accionPersona?.(p)}
      </span>
    ) : BigInt(p.neto.minor) + BigInt(p.adelantado.minor) > 0n ? (
      papel || !accionPersona ? (
        <span key="q" className="whitespace-nowrap">Pendiente</span>
      ) : (
        <span key="q">{accionPersona(p)}</span>
      )
    ) : (
      <span key="q" />
    );
  const cuantos = i.porPersona.reduce((n, p) => n + p.vales, 0);
  return [
    {
      id: "personas",
      titulo: "Por persona",
      columnas: [
        { titulo: "Persona" },
        { titulo: "Vales", derecha: true },
        { titulo: "Consumió", derecha: true },
        { titulo: "Adelantos", derecha: true },
        { titulo: "Quincena" },
      ],
      filas: i.porPersona.map((p) => [
        <span key="n" className="font-semibold">{p.persona.nombre}</span>,
        <span key="v" className="tnum">{p.vales}</span>,
        <span key="t" className="tnum font-semibold">{importe(p.neto)}</span>,
        <span key="a" className={cn("tnum", BigInt(p.adelantado.minor) > 0n && "font-semibold")}>{importe(p.adelantado)}</span>,
        quincena(p),
      ]),
      pie: [
        "Total",
        <span key="v" className="tnum">{cuantos}</span>,
        <span key="t" className="tnum">{importe(i.total)}</span>,
        <span key="a" className="tnum">{importe(sumaUsd(i.porPersona.map((p) => p.adelantado)))}</span>,
        "",
      ],
      vacio: "Nadie del equipo consumió ni recibió adelantos en este periodo.",
      nota: "Lo que consumió cada persona, sin lo anulado y sin lo devuelto, y lo que recibió en efectivo por adelantado (en dólares). El descuento del sueldo se hace fuera del sistema, en su quincena: administración lo marca «Descontado» y deja de estar pendiente.",
    },
    {
      id: "vales",
      titulo: `Los vales (${vales(i.vales.length)})`,
      columnas: [
        { titulo: "Cuándo" },
        { titulo: "Orden" },
        { titulo: "Persona" },
        { titulo: "Lo consumido" },
        { titulo: "Total", derecha: true },
        { titulo: "Estado" },
        ...(conAccion ? [{ titulo: "" }] : []),
      ],
      filas: i.vales.map((v) => [
        <span key="c" className="tnum whitespace-nowrap">{reloj.diaYHora(Date.parse(v.en))}</span>,
        <span key="o" className="tnum">{ordenDelVale(v.orderNumber)}</span>,
        <span key="p" className="font-semibold">{v.persona.nombre}</span>,
        <span key="l">
          {loConsumido(v)}
          <span className={cn("block text-nota", !papel && "text-ink-3")}>Cobró {v.cajera}</span>
        </span>,
        <span key="t" className={cn("tnum font-semibold", v.anulado && "line-through")}>{importe(v.total)}</span>,
        <EstadoDelVale key="e" v={v} papel={papel} />,
        ...(conAccion ? [<span key="a">{accion(v)}</span>] : []),
      ]),
      vacio: "Sin vales en este periodo.",
    },
    {
      id: "adelantos",
      titulo: `Adelantos (${adelantos(i.adelantos.length)})`,
      columnas: [{ titulo: "Cuándo" }, { titulo: "Comprobante" }, { titulo: "Persona" }, { titulo: "Para qué" }, { titulo: "Monto", derecha: true }],
      filas: i.adelantos.map((a) => [
        <span key="c" className="tnum whitespace-nowrap">{reloj.diaYHora(Date.parse(a.en))}</span>,
        <span key="o" className="tnum">{ordenDelVale(a.numero)}</span>,
        <span key="p" className="font-semibold">{a.persona?.nombre ?? ""}</span>,
        <span key="n">
          {a.nota}
          <span className={cn("block text-nota", !papel && "text-ink-3")}>
            Entregó {a.por}
            {a.autorizo ? ` · autorizó ${a.autorizo}` : ""}
          </span>
        </span>,
        <span key="m" className="tnum font-semibold">
          {importe(a.monto)}
          {a.monto.currency !== "USD" && <span className={cn("block text-nota font-normal", !papel && "text-ink-3")}>{importe(a.enDolares)}</span>}
        </span>,
      ]),
      vacio: "Sin adelantos en este periodo.",
    },
  ];
}
