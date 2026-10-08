"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * El procedimiento en papel — B8-2 (M-30), JORNADA §4, ADR-021 (N2).
 *
 * La hoja que va pegada junto a la caja para cuando el sistema no está: cuándo se pasa al papel, quién anota qué y cómo
 * se carga al volver. La ayuda de la app es el manual (M-30), pero sin sistema no hay ayuda: esto es lo que queda. Una
 * sola hoja A4, en blanco y negro, con los teléfonos que el local escribe a mano. Los formularios para anotar son los de
 * B3-7 (`/formularios-papel`) y su carga, Caja → Papel.
 */
export function ProcedimientoDePapel() {
  const { ajustes } = useSucursal();
  return (
    <div className="l2-formularios fixed inset-0 overflow-y-auto bg-base">
      <div className="mx-auto flex max-w-[210mm] flex-col gap-4 px-3 py-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-ink">El procedimiento en papel</h1>
            <p className="mt-1 text-[13px] text-ink-3">
              Imprímelo y pégalo junto a la caja, con los formularios: sin sistema, esta hoja es la ayuda.
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

      <section aria-label="Procedimiento en papel" className="l2-formulario mx-auto mb-6 w-[210mm] max-w-full border border-line p-[10mm] text-[11.5px] leading-snug shadow-card print:mb-0">
        <header className="flex items-end justify-between gap-4 border-b-2 border-current pb-2">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase">Contingencia · para pegar junto a la caja</p>
            <h2 className="font-display text-2xl leading-tight font-bold">Si se cae el sistema: trabajar en papel</h2>
            <p className="text-[12px]">{ajustes.nombre}</p>
          </div>
          <p className="max-w-[62mm] text-right text-[10.5px]">El local no se detiene: se anota todo en papel, con la hora del reloj de la pared, y se carga al volver.</p>
        </header>

        <Paso n={1} titulo="Cuándo se pasa al papel">
          <ul className="list-disc space-y-1 pl-4">
            <li>
              Cuando la caja y la entrada dicen <b>«Sin conexión»</b> por <b>más de 5 minutos</b> porque cayeron <b>los dos internet</b> (el principal y el
              4G), o se fue la luz y el router no tiene batería.
            </li>
            <li>
              Antes, mira: ¿el router 4G tiene luz? ¿Una sola pantalla falla y las demás no? Entonces es ese equipo, no el sistema: recárgalo o cambia de
              equipo.
            </li>
            <li>
              Lo decide <b>supervisión</b> (o la cajera, si está sola) y lo dice a todos los puestos: «<b>Pasamos a papel a las ___</b>». Esa hora va
              arriba en cada hoja: es el inicio del corte.
            </li>
          </ul>
        </Paso>

        <Paso n={2} titulo="Quién anota qué">
          <table className="w-full border-collapse">
            <tbody>
              {[
                ["Entrada (monitora)", "Hoja de ENTRADAS: hora de entrada, representante y teléfono, pulseras y niños, paquete y si pagó. Al salir el niño, su hora de salida. Las pulseras se ponen igual: son de un solo uso."],
                ["Caja (cajera)", "Hoja de COBROS: hora, de qué es, el total, cuánto en cada medio, la referencia, el vuelto y la tasa con que cobraste en bolívares (la última del BCV)."],
                ["Mesero", "La comanda a mano, en la libreta, y la lleva a la cocina. La cuenta de la mesa se cobra en la caja y va en la hoja de COBROS."],
                ["Pagos sin efectivo", "Pago Móvil, Zelle o el punto, solo si funcionan (el punto con su propio 4G): siempre con su referencia. Si no, en efectivo."],
              ].map(([quien, que]) => (
                <tr key={quien}>
                  <th scope="row" className="w-[34mm] border border-current/70 px-1.5 py-1 text-left align-top font-bold">
                    {quien}
                  </th>
                  <td className="border border-current/70 px-1.5 py-1">{que}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1">
            <b>Nadie tira una hoja:</b> todas van a la carpeta junto a la caja, numeradas (Hoja N.º 1, 2…).
          </p>
        </Paso>

        <Paso n={3} titulo="Cuando vuelve el sistema">
          <ol className="list-decimal space-y-1 pl-4">
            <li>Espera a que esté estable: Inicio carga y se ve la tasa del día. Se sigue en papel hasta entonces; lo que pasó en papel se carga después.</li>
            <li>
              La cajera, en <b>Caja → Papel</b>: «Abrir carga» con la hora en que se pasó al papel y la hora en que volvió. Carga, con la hora de cada fila,
              primero las <b>entradas</b>, después las <b>salidas</b> y al final los <b>cobros</b>. Y «Terminar la carga».
            </li>
            <li>
              <b>Supervisión</b> la revisa en Caja → Papel → «Por revisar», <b>contra estas hojas</b>, con su PIN. Quien cargó no revisa lo suyo.
            </li>
            <li>Sin revisar, no se cierra el turno ni la jornada. Las hojas se guardan con el corte Z de ese día.</li>
          </ol>
        </Paso>

        <Paso n={4} titulo="A quién se llama">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {["Soporte de L2 Control", "Administración", "Internet principal", "Internet 4G"].map((c) => (
              <div key={c} className="flex items-end gap-2">
                <dt className="shrink-0 font-bold">{c}:</dt>
                <dd className="h-5 flex-1 border-b border-current" />
              </div>
            ))}
          </dl>
        </Paso>

        <footer className="mt-4 border-t border-current pt-2 text-[10.5px]">
          Ten siempre <b>al menos cinco copias</b> de cada formulario (Caja → Papel → «Imprimir los formularios») y esta hoja a la vista. Si un día se
          usaron, imprime más.
        </footer>
      </section>
    </div>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 flex items-center gap-2 text-[14px] font-bold">
        <span className="grid size-6 place-content-center rounded-full border-2 border-current text-[12px]">{n}</span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}
