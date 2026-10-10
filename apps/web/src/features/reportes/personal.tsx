import type { ReactNode } from "react";
import { CircleCheckBig, CircleX, Undo2 } from "lucide-react";
import type { ValeDto, ValesDelPersonalDto } from "@l2/contracts";
import { TAMANO_ICONO, cn } from "@l2/ui";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { importe, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones de los vales del personal (B3-17, M-37): lo de cada persona en el periodo (la quincena) y cada vale, con
 * lo consumido, su total y si se anuló o se devolvió algo. Las pintan Caja → Personal (con «Reimprimir vale»), Reportes →
 * Personal y su PDF. Sin tope ni «descontado»: el descuento del sueldo se hace fuera del sistema.
 */

export type SeccionDelPersonal = "personas" | "vales";

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

/**
 * Las dos secciones: por persona y cada vale. `accion`, lo que cada vale ofrece en la pantalla («Reimprimir vale»); en el
 * papel, nada.
 */
export function seccionesDelPersonal(
  i: ValesDelPersonalDto,
  reloj: Reloj,
  papel = false,
  accion?: (v: ValeDto) => ReactNode,
): SeccionDeInforme<SeccionDelPersonal>[] {
  const conAccion = accion !== undefined && !papel;
  const cuantos = i.porPersona.reduce((n, p) => n + p.vales, 0);
  return [
    {
      id: "personas",
      titulo: "Por persona",
      columnas: [{ titulo: "Persona" }, { titulo: "Vales", derecha: true }, { titulo: "Consumió", derecha: true }],
      filas: i.porPersona.map((p) => [<span key="n" className="font-semibold">{p.persona.nombre}</span>, <span key="v" className="tnum">{p.vales}</span>, <span key="t" className="tnum font-semibold">{importe(p.neto)}</span>]),
      pie: ["Total", <span key="v" className="tnum">{cuantos}</span>, <span key="t" className="tnum">{importe(i.total)}</span>],
      vacio: "Nadie del equipo consumió en este periodo.",
      nota: "Lo que consumió cada persona, sin lo anulado y sin lo devuelto. El descuento del sueldo se hace fuera del sistema.",
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
  ];
}
