"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CircleCheck, CircleDashed, ListChecks, TriangleAlert } from "lucide-react";
import type { PuestaAPuntoDto, PuntoDePuestaAPuntoDto } from "@l2/contracts";
import { Sheet, cn } from "@l2/ui";
import { rutaSeccion } from "./navigation.ts";

/**
 * La Puesta a punto en Inicio (JORNADA §2 P6, T-4). Tras la instalación el local existe pero está
 * vacío: esta lista dice qué falta para el primer día y **se tacha sola** cuando el dato existe.
 * Nadie marca nada: lo que está hecho lo cuenta el servidor. Cada punto sin hacer dice qué no
 * funcionará todavía y lleva a su sección; los que no bloquean nada son recomendables.
 *
 * En Inicio ocupa una línea (cuánto falta y qué bloquea) y el detalle se abre en una hoja: el
 * tablero del día no se desplaza por ella. Con todo hecho, deja de salir.
 */

const PUNTO: Record<PuntoDePuestaAPuntoDto["id"], { titulo: string; ruta: Route }> = {
  personas: { titulo: "Personas del equipo, con su rol y su PIN", ruta: rutaSeccion("ajustes", "usuarios") },
  equipos: { titulo: "Equipos de cada puesto aprobados", ruta: rutaSeccion("ajustes", "dispositivos") },
  tarifas: { titulo: "Tarifas del parque publicadas", ruta: rutaSeccion("ajustes", "tarifas") },
  impuestos: { titulo: "Impuestos vigentes", ruta: rutaSeccion("ajustes", "impuestos") },
  tasa: { titulo: "Tasa del BCV", ruta: rutaSeccion("ajustes", "tasas") },
  medios: { titulo: "Medios de pago", ruta: rutaSeccion("ajustes", "medios") },
  catalogo: { titulo: "Catálogo de mostrador", ruta: rutaSeccion("inventario", "productos") },
  impresoras: { titulo: "Impresoras", ruta: rutaSeccion("ajustes", "impresoras") },
  feriados: { titulo: "Feriados bancarios del año", ruta: rutaSeccion("ajustes", "feriados") },
  carta_y_plano: { titulo: "Carta y plano del restaurante", ruta: rutaSeccion("ajustes", "plano") },
  existencias: { titulo: "Existencias iniciales del inventario", ruta: rutaSeccion("inventario", "entradas") },
  descuentos: { titulo: "Descuentos y familias VIP", ruta: rutaSeccion("ajustes", "descuentos") },
  segunda_administracion: { titulo: "Segunda administración con su llave", ruta: rutaSeccion("ajustes", "usuarios") },
};

export function PuestaAPunto({ puesta }: { puesta: PuestaAPuntoDto }) {
  const [abierta, setAbierta] = useState(false);
  const { puntos, pendientesQueBloquean } = puesta;
  const hechos = puntos.filter((p) => p.hecho).length;
  if (hechos === puntos.length) return null;

  const bloquea = pendientesQueBloquean > 0;
  const recomendables = puntos.length - hechos - pendientesQueBloquean;
  // Lo que falta, delante; y de lo que falta, primero lo que bloquea.
  const orden = [...puntos].sort((a, b) => Number(a.hecho) - Number(b.hecho) || Number(a.bloquea === null) - Number(b.bloquea === null));

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={cn(
          "group mb-2.5 flex min-h-8 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-control)] border px-3 py-2 text-left text-xs shadow-sm lg:text-[13px]",
          "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-brand",
          bloquea ? "border-state-warn/40 bg-state-warn-bg text-state-warn" : "border-line bg-surface/80 text-ink-2 hover:bg-surface-2",
        )}
      >
        {bloquea ? <TriangleAlert size={15} className="shrink-0" aria-hidden="true" /> : <ListChecks size={15} className="shrink-0" aria-hidden="true" />}
        <span className="font-display text-[13.5px] font-bold text-ink">Puesta a punto</span>
        <span className="tnum font-medium">
          {bloquea
            ? `${pendientesQueBloquean === 1 ? "Falta 1 punto" : `Faltan ${pendientesQueBloquean} puntos`} sin ${pendientesQueBloquean === 1 ? "el" : "los"} que algún puesto no puede trabajar`
            : `Nada bloquea al local. ${recomendables === 1 ? "Queda 1 punto recomendable" : `Quedan ${recomendables} puntos recomendables`}`}
        </span>
        <span className="tnum ml-auto flex items-center gap-2 text-ink-2">
          {hechos} de {puntos.length} hechos
          <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((hechos / puntos.length) * 100)}%` }} />
          </span>
          <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </button>

      <Sheet
        abierto={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Puesta a punto"
        descripcion="Lo que falta para abrir el primer día. Se tacha solo cuando el dato existe: aquí no se marca nada a mano."
      >
        <ul className="flex flex-col gap-2">
          {orden.map((p) => (
            <Punto key={p.id} punto={p} onIr={() => setAbierta(false)} />
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function Punto({ punto, onIr }: { punto: PuntoDePuestaAPuntoDto; onIr: () => void }) {
  const { titulo, ruta } = PUNTO[punto.id];
  const bloquea = !punto.hecho && punto.bloquea !== null;
  const Icono = punto.hecho ? CircleCheck : bloquea ? TriangleAlert : CircleDashed;
  return (
    <li>
      <Link
        href={ruta}
        onClick={onIr}
        className={cn(
          "group flex min-h-8 items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5",
          "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          bloquea ? "border-state-warn/40 bg-state-warn-bg/60" : "border-line bg-surface hover:border-line-strong",
        )}
      >
        <Icono
          size={17}
          aria-hidden="true"
          className={cn("mt-0.5 shrink-0", punto.hecho ? "text-state-ok" : bloquea ? "text-state-warn" : "text-ink-3")}
        />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13.5px] font-semibold", punto.hecho ? "text-ink-2 line-through decoration-ink-3" : "text-ink")}>{titulo}</span>
          <span className="tnum block text-[12.5px] text-ink-2">{punto.detalle}</span>
          <span className={cn("mt-0.5 block text-[12px] font-medium", punto.hecho ? "text-state-ok" : bloquea ? "text-state-warn" : "text-ink-3")}>
            {punto.hecho ? "Hecho" : bloquea ? `Sin esto no funciona: ${minuscula(punto.bloquea ?? "")}` : "Recomendable: no detiene nada"}
          </span>
        </span>
        <ArrowRight size={14} aria-hidden="true" className="mt-1 shrink-0 text-ink-3 transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/** «La entrada al parque» → «la entrada al parque», para seguir a los dos puntos. */
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
