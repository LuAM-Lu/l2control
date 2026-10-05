"use client";

import { createContext, useContext, useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, FileText } from "lucide-react";
import type { CargaDePapelDto, DesdePapel } from "@l2/contracts";
import { Container } from "@l2/ui";
import { RelojDeLaCarga } from "../operacion/OperacionProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { CampoHoraReal, useHoraReal } from "./CampoHoraReal.tsx";

/**
 * El modo papel de la caja — B3-7, V-12, ADR-027, JORNADA §4.
 *
 * Con una carga abierta, la caja de siempre sirve para cobrar lo que se anotó en el formulario: la misma
 * pantalla, el mismo cobro mixto, con dos diferencias que esta cinta dice con palabras. Cada cobro lleva
 * **la hora real que se anotó** (la única hora que declara una pantalla) y la caja entera pinta como si
 * fuera ESA hora: la tasa que regía, el IVA y los precios de entonces. El servidor recibe la misma hora y
 * comprueba lo mismo, y la acepta solo dentro del corte que se declaró al abrir la carga.
 *
 * Fuera de este modo `useModoPapel()` es `null` y la caja no cambia en nada.
 */

/** De la carga, lo que hace falta para cobrar en ella. */
export type CargaEnCurso = Pick<CargaDePapelDto, "id" | "desde" | "hasta" | "punto">;

type Valor = Readonly<{
  carga: CargaEnCurso;
  /** La hora real escrita (instante), o `null` si falta o no vale. */
  horaReal: number | null;
  /**
   * Lo que viaja con cada registro: la carga y la hora real. Sin hora válida va vacía: el servidor la rechaza y
   * el cobro no se hace de ahora por descuido (fail-closed).
   */
  desdePapel: () => DesdePapel;
  /** Tras un registro la hora se borra: el siguiente trae la suya, no la del anterior. */
  limpiarHora: () => void;
}>;

const Contexto = createContext<Valor | null>(null);

/** El modo papel en curso, o `null` si la caja trabaja de ahora. */
export function useModoPapel(): Valor | null {
  return useContext(Contexto);
}

export function ModoPapel({ carga, children }: { carga: CargaEnCurso; children: React.ReactNode }) {
  const reloj = useReloj();
  const hora = useHoraReal(carga);
  const { instante, iso, limpiar } = hora;

  const valor = useMemo<Valor>(
    () => ({ carga, horaReal: instante, desdePapel: () => ({ cargaId: carga.id, ocurrioEn: iso ?? "" }), limpiarHora: limpiar }),
    [carga, instante, iso, limpiar],
  );

  return (
    <Contexto.Provider value={valor}>
      {/* La caja pinta como si fuera la hora anotada; sin hora todavía, como si fuera el final del corte. */}
      <RelojDeLaCarga ahora={instante ?? Date.parse(carga.hasta)}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div role="region" aria-label="Carga desde papel" className="shrink-0 border-b border-brand/40 bg-brand/10">
            <Container ancho="muro" className="flex flex-wrap items-start gap-x-6 gap-y-2 py-2 bajo:py-1.5">
              <div className="flex min-w-0 flex-1 basis-72 items-center gap-2.5 self-center">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/15 text-brand">
                  <FileText size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[14px] leading-tight font-bold text-ink">Cargando lo anotado en papel</p>
                  <p className="tnum text-[12.5px] text-ink-2">
                    Corte de {reloj.diaYHora(Date.parse(carga.desde))} a {reloj.hora(Date.parse(carga.hasta))} · {carga.punto}
                  </p>
                </div>
              </div>
              <div className="w-64 max-w-full">
                <CampoHoraReal hora={hora} />
              </div>
              <Link
                href={"/papel" as Route}
                className="inline-flex min-h-12 items-center gap-1.5 self-end rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[13px] font-semibold text-ink hover:border-line-strong"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Volver a la carga
              </Link>
            </Container>
          </div>
          {children}
        </div>
      </RelojDeLaCarga>
    </Contexto.Provider>
  );
}
