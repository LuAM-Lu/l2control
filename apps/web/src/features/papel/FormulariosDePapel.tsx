"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, cn } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * Los formularios para anotar en papel — B3-7, V-12, ADR-021 (N2), JORNADA §4.
 *
 * Si caen los dos enlaces (o la luz sin respaldo) el local sigue trabajando en papel: este es el papel. Dos
 * hojas, la de entradas y la de cobros, que se imprimen desde aquí, se guardan junto a la caja y se llenan a
 * mano. Cada fila lleva la HORA REAL, como la marca el reloj de la pared: es la que se carga después en el
 * sistema, y tiene que caer dentro del corte que se declara al cargar. Al volver, la cajera lo carga en su
 * turno y supervisión lo revisa contra estas mismas hojas.
 */

const FILAS = 13;
const filas = Array.from({ length: FILAS }, (_, i) => i + 1);

/** Una celda de la tabla: borde fino, alto de renglón escribible. */
const CELDA = "h-9 border border-current/70 px-1.5 align-top";
const ENCABEZADO = "border border-current/70 px-1.5 py-1 text-left text-[10px] leading-tight font-bold uppercase";

export function FormulariosDePapel() {
  const { ajustes } = useSucursal();
  return (
    <div className="l2-formularios fixed inset-0 overflow-y-auto bg-base">
      <div className="mx-auto flex max-w-[210mm] flex-col gap-4 px-3 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Formularios para anotar en papel</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              Imprime varias copias de cada hoja y guárdalas junto a la caja. Si caen internet y luz, se anota aquí; al volver, la caja lo carga y supervisión lo revisa.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={"/papel" as Route} className="inline-flex min-h-12 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13.5px] font-semibold text-ink hover:border-line-strong">
              <ArrowLeft size={15} aria-hidden="true" />
              Volver
            </Link>
            <Button surface="tablet" variant="primary" className="gap-1.5" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" />
              Imprimir
            </Button>
          </div>
        </div>
      </div>

      <Hoja titulo="Entradas" nombre={ajustes.nombre}>
        <p className="text-[11px] leading-snug">
          Anota <b>cada entrada cuando ocurre</b>, con la hora del reloj de la pared. Cuando el niño sale, escribe su hora de salida. Si la familia paga al entrar, marca «Sí» y cobra con la hoja de cobros.
        </p>
        <table className="mt-2 w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className={cn(ENCABEZADO, "w-7")}>N.º</th>
              <th className={cn(ENCABEZADO, "w-[14%]")}>Hora de entrada</th>
              <th className={ENCABEZADO}>Representante y teléfono</th>
              <th className={ENCABEZADO}>Pulsera(s) y niño(s)</th>
              <th className={cn(ENCABEZADO, "w-[11%]")}>Paquete</th>
              <th className={cn(ENCABEZADO, "w-[8%]")}>¿Pagó?</th>
              <th className={cn(ENCABEZADO, "w-[14%]")}>Hora de salida</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((n) => (
              <tr key={n}>
                <td className={cn(CELDA, "text-center text-[10px]")}>{n}</td>
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={cn(CELDA, "text-center text-[10px]")}>Sí · No</td>
                <td className={CELDA} />
              </tr>
            ))}
          </tbody>
        </table>
        <Pie />
      </Hoja>

      <Hoja titulo="Cobros" nombre={ajustes.nombre}>
        <p className="text-[11px] leading-snug">
          Anota <b>cada cobro cuando se hace</b>, con la hora del reloj de la pared. Si se pagó en bolívares, escribe la tasa que usaste. Anota el vuelto que diste.
        </p>
        <table className="mt-2 w-full border-collapse text-[10.5px]">
          <thead>
            <tr>
              <th className={cn(ENCABEZADO, "w-7")}>N.º</th>
              <th className={cn(ENCABEZADO, "w-[11%]")}>Hora</th>
              <th className={ENCABEZADO}>De qué (pulsera, familia o producto)</th>
              <th className={cn(ENCABEZADO, "w-[9%]")}>Total $</th>
              <th className={cn(ENCABEZADO, "w-[9%]")}>Efectivo $</th>
              <th className={cn(ENCABEZADO, "w-[10%]")}>Efectivo Bs</th>
              <th className={cn(ENCABEZADO, "w-[14%]")}>Otro medio y referencia</th>
              <th className={cn(ENCABEZADO, "w-[8%]")}>Vuelto</th>
              <th className={cn(ENCABEZADO, "w-[9%]")}>Tasa</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((n) => (
              <tr key={n}>
                <td className={cn(CELDA, "text-center text-[10px]")}>{n}</td>
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
                <td className={CELDA} />
              </tr>
            ))}
          </tbody>
        </table>
        <Pie />
      </Hoja>
    </div>
  );
}

/** Una hoja de papel: su encabezado (local, fecha, hoja, quién anota) y su cuerpo. */
function Hoja({ titulo, nombre, children }: { titulo: string; nombre: string; children: React.ReactNode }) {
  return (
    <section aria-label={`Hoja de ${titulo.toLowerCase()}`} className="l2-formulario mx-auto mb-6 w-[210mm] max-w-full border border-line p-[10mm] shadow-card print:mb-0">
      <header className="flex items-start justify-between gap-4 border-b-2 border-current pb-2">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase">Hoja de contingencia · sin sistema</p>
          <h2 className="font-display text-2xl leading-tight font-bold">{titulo}</h2>
          <p className="text-[12px]">{nombre}</p>
        </div>
        <dl className="grid min-w-[62mm] gap-y-2 text-[11px]">
          {["Fecha", "Hoja N.º", "Anotó"].map((c) => (
            <div key={c} className="flex items-end gap-2">
              <dt className="shrink-0 font-bold">{c}:</dt>
              <dd className="h-5 flex-1 border-b border-current" />
            </div>
          ))}
        </dl>
      </header>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Pie() {
  return (
    <footer className="mt-3 grid grid-cols-2 gap-4 text-[10.5px] leading-snug">
      <p>
        <b>Al volver el sistema:</b> la cajera carga estas hojas en Caja → Papel, con la hora de cada fila, y supervisión las revisa contra el papel antes del cierre.
      </p>
      <p>
        <b>No tires esta hoja.</b> Entrégala a supervisión cuando termine la carga: es lo que se compara.
      </p>
    </footer>
  );
}
