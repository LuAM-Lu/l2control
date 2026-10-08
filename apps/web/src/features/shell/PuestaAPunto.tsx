"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ChevronDown, CircleCheck, CircleDashed, Clock, ListChecks, TriangleAlert, Undo2 } from "lucide-react";
import type { PuestaAPuntoDto, PuntoDePuestaAPuntoDto } from "@l2/contracts";
import { Sheet, avisar, cn } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { rutaPestana, rutaSeccion } from "./navigation.ts";
import { posponerPunto } from "./puesta.acciones";

/**
 * La Puesta a punto en Inicio (JORNADA §2 P6, T-4). Tras la instalación el local existe pero está
 * vacío: esta lista dice qué falta para el primer día y **se tacha sola** cuando el dato existe.
 * Nadie marca nada como hecho: lo que está hecho lo cuenta el servidor. Cada punto sin hacer dice qué no
 * funcionará todavía y lleva a su sección; los que no bloquean nada son recomendables.
 *
 * Un recomendable se puede dejar **para después** (T-8b): baja a su grupo, deja de contar como
 * pendiente y se retoma cuando se quiera. Lo que bloquea un puesto no se pospone. Lo decide el servidor
 * y lo ve igual toda la administración del local, en cualquier equipo.
 *
 * En Inicio ocupa una línea (cuánto falta y qué bloquea) y el detalle se abre en una hoja: el tablero del
 * día no se desplaza por ella. Con todo hecho, deja de salir; con solo lo dejado para después, queda un
 * enlace discreto.
 */

const PUNTO: Record<PuntoDePuestaAPuntoDto["id"], { titulo: string; ruta: Route }> = {
  personas: { titulo: "Personas del equipo, con su rol y su PIN", ruta: rutaPestana("ajustes", "personas", "usuarios") },
  equipos: { titulo: "Equipos de cada puesto aprobados", ruta: rutaPestana("ajustes", "personas", "dispositivos") },
  punto_de_cobro: { titulo: "Punto de cobro marcado", ruta: rutaPestana("ajustes", "personas", "dispositivos") },
  tarifas: { titulo: "Tarifas del parque publicadas", ruta: rutaSeccion("ajustes", "tarifas") },
  impuestos: { titulo: "Impuestos vigentes", ruta: rutaSeccion("ajustes", "impuestos") },
  tasa: { titulo: "Tasa del BCV", ruta: rutaSeccion("ajustes", "tasas") },
  medios: { titulo: "Medios de pago", ruta: rutaSeccion("ajustes", "medios") },
  catalogo: { titulo: "Catálogo de mostrador", ruta: rutaSeccion("inventario", "productos") },
  impresoras: { titulo: "Impresoras", ruta: rutaSeccion("ajustes", "impresoras") },
  feriados: { titulo: "Feriados bancarios del año", ruta: rutaPestana("ajustes", "tasas", "feriados") },
  carta_y_plano: { titulo: "Carta y plano del restaurante", ruta: rutaSeccion("ajustes", "plano") },
  // Abre la entrada en modo «inventario inicial» (T-10).
  existencias: { titulo: "Existencias iniciales del inventario", ruta: `${rutaSeccion("inventario", "entradas")}?inicial=1` as Route },
  descuentos: { titulo: "Descuentos y familias VIP", ruta: rutaSeccion("ajustes", "descuentos") },
  segunda_administracion: { titulo: "Segunda administración con sus credenciales", ruta: rutaPestana("ajustes", "personas", "usuarios") },
  otros_equipos: { titulo: "App de autenticación para otros equipos", ruta: rutaPestana("ajustes", "personas", "usuarios") },
};

export function PuestaAPunto({ puesta: inicial }: { puesta: PuestaAPuntoDto }) {
  const [abierta, setAbierta] = useState(false);
  const [puesta, setPuesta] = useState(inicial);
  const huella = JSON.stringify(inicial);
  useEffect(() => setPuesta(inicial), [huella]);
  const [verDespues, setVerDespues] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { puntos, pendientesQueBloquean } = puesta;
  const hechos = puntos.filter((p) => p.hecho).length;
  const despues = puntos.filter((p) => !p.hecho && p.paraDespues !== null);
  if (hechos === puntos.length) return null;

  const bloquea = pendientesQueBloquean > 0;
  const recomendables = puntos.filter((p) => !p.hecho && p.bloquea === null && p.paraDespues === null).length;
  const soloDespues = !bloquea && recomendables === 0;
  // Lo que falta, delante; y de lo que falta, primero lo que bloquea. Lo dejado para después, en su grupo.
  const orden = puntos
    .filter((p) => p.paraDespues === null || p.hecho)
    .sort((a, b) => Number(a.hecho) - Number(b.hecho) || Number(a.bloquea === null) - Number(b.bloquea === null));

  async function cambiar(p: PuntoDePuestaAPuntoDto, paraDespues: boolean) {
    setOcupado(p.id);
    try {
      const r = await posponerPunto({ id: p.id, paraDespues });
      if (!r.ok) return avisar.error(r.mensaje);
      setPuesta(r.valor);
      avisar.ok(paraDespues ? `«${PUNTO[p.id].titulo}» quedó para después` : `«${PUNTO[p.id].titulo}» vuelve a la lista`);
    } catch {
      avisar.error("El servidor no respondió. No cambió nada.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      {soloDespues ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="mb-2.5 flex min-h-8 cursor-pointer items-center gap-2 self-start rounded-[var(--radius-control)] px-1 text-[12.5px] text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          <ListChecks size={14} aria-hidden="true" />
          Puesta a punto: {despues.length === 1 ? "1 punto para después" : `${despues.length} puntos para después`}
        </button>
      ) : (
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
            {hechos} de {puntos.length} hechos{despues.length > 0 && ` · ${despues.length} para después`}
            <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
              <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((hechos / puntos.length) * 100)}%` }} />
            </span>
            <ArrowRight size={13} className="transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
      )}

      <Sheet
        abierto={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Puesta a punto"
        descripcion="Lo que falta para abrir el primer día. Se tacha solo cuando el dato existe; lo recomendable se puede dejar para después."
      >
        <ul className="flex flex-col gap-2">
          {orden.map((p) => (
            <Punto key={p.id} punto={p} onIr={() => setAbierta(false)} ocupado={ocupado === p.id} onDespues={() => void cambiar(p, true)} />
          ))}
        </ul>

        {despues.length > 0 && (
          <section className="mt-4 border-t border-line pt-3">
            <button
              type="button"
              aria-expanded={verDespues}
              onClick={() => setVerDespues((v) => !v)}
              className="flex min-h-8 w-full cursor-pointer items-center gap-2 text-left text-[13px] font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Clock size={14} aria-hidden="true" />
              Para después ({despues.length})
              <ChevronDown size={14} aria-hidden="true" className={cn("ml-auto transition-transform duration-[var(--dur-rapida)]", verDespues && "rotate-180")} />
            </button>
            {verDespues && (
              <ul className="mt-2 flex flex-col gap-2">
                {despues.map((p) => (
                  <Pospuesto key={p.id} punto={p} ocupado={ocupado === p.id} onRetomar={() => void cambiar(p, false)} onIr={() => setAbierta(false)} />
                ))}
              </ul>
            )}
          </section>
        )}
      </Sheet>
    </>
  );
}

const BOTON_PEQUENO =
  "flex min-h-8 shrink-0 cursor-pointer items-center gap-1 self-center rounded-[var(--radius-control)] px-2 text-[12px] font-medium text-ink-3 " +
  "hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50";

function Punto({ punto, onIr, ocupado, onDespues }: { punto: PuntoDePuestaAPuntoDto; onIr: () => void; ocupado: boolean; onDespues: () => void }) {
  const { titulo, ruta } = PUNTO[punto.id];
  const bloquea = !punto.hecho && punto.bloquea !== null;
  const recomendable = !punto.hecho && punto.bloquea === null;
  const Icono = punto.hecho ? CircleCheck : bloquea ? TriangleAlert : CircleDashed;
  return (
    <li
      className={cn(
        "flex items-stretch gap-1 rounded-[var(--radius-control)] border",
        bloquea ? "border-state-warn/40 bg-state-warn-bg/60" : "border-line bg-surface hover:border-line-strong",
      )}
    >
      <Link
        href={ruta}
        onClick={onIr}
        className={cn(
          "group flex min-h-8 min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-control)] px-3 py-2.5",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        )}
      >
        <Icono size={17} aria-hidden="true" className={cn("mt-0.5 shrink-0", punto.hecho ? "text-state-ok" : bloquea ? "text-state-warn" : "text-ink-3")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13.5px] font-semibold", punto.hecho ? "text-ink-2 line-through decoration-ink-3" : "text-ink")}>{titulo}</span>
          <span className="tnum block text-[12.5px] text-ink-2">{punto.detalle}</span>
          <span className={cn("mt-0.5 block text-[12px] font-medium", punto.hecho ? "text-state-ok" : bloquea ? "text-state-warn" : "text-ink-3")}>
            {punto.hecho ? "Hecho" : bloquea ? `Sin esto no funciona: ${minuscula(punto.bloquea ?? "")}` : "Recomendable: no detiene nada"}
          </span>
        </span>
        <ArrowRight size={14} aria-hidden="true" className="mt-1 shrink-0 text-ink-3 transition-transform duration-[var(--dur-rapida)] group-hover:translate-x-0.5" />
      </Link>
      {recomendable && (
        <button type="button" disabled={ocupado} onClick={onDespues} className={cn(BOTON_PEQUENO, "mr-1.5")} aria-label={`Dejar «${titulo}» para después`} title="Dejar para después">
          <Clock size={13} aria-hidden="true" />
          <span className="hidden sm:inline">Después</span>
        </button>
      )}
    </li>
  );
}

function Pospuesto({ punto, ocupado, onRetomar, onIr }: { punto: PuntoDePuestaAPuntoDto; ocupado: boolean; onRetomar: () => void; onIr: () => void }) {
  const reloj = useReloj();
  const { titulo, ruta } = PUNTO[punto.id];
  const desde = punto.paraDespues ? Date.parse(punto.paraDespues.desde) : null;
  return (
    <li className="flex items-stretch gap-1 rounded-[var(--radius-control)] border border-dashed border-line">
      <Link href={ruta} onClick={onIr} className="flex min-h-8 min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-control)] px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand">
        <Clock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-ink-2">{titulo}</span>
          {punto.paraDespues && desde !== null && (
            <span className="tnum block text-[11.5px] text-ink-3">
              Lo dejó para después {punto.paraDespues.por}, el {reloj.dia(desde)}
            </span>
          )}
        </span>
      </Link>
      <button type="button" disabled={ocupado} onClick={onRetomar} className={cn(BOTON_PEQUENO, "mr-1.5")} aria-label={`Retomar «${titulo}»`} title="Volver a la lista">
        <Undo2 size={13} aria-hidden="true" />
        <span className="hidden sm:inline">Retomar</span>
      </button>
    </li>
  );
}

/** «La entrada al parque» → «la entrada al parque», para seguir a los dos puntos. */
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
