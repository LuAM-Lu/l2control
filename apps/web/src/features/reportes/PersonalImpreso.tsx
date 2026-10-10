"use client";

import { TriangleAlert } from "lucide-react";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import type { ValesPedidos } from "./reportes.servidor.ts";
import { DocumentoDeInforme, SeccionImpresa, importe, periodoEnPalabras } from "./informe.tsx";
import { direccionDelPersonal, seccionesDelPersonal } from "./personal.tsx";

/**
 * El PDF del consumo del personal (B3-17, M-37): lo de cada persona en el periodo y cada vale. Lo imprime el navegador,
 * que también lo guarda como PDF. Los vales firmados se quedan en la caja.
 */
export function PersonalImpreso({ pedido, informe }: ValesPedidos) {
  const reloj = useReloj();
  const volver = direccionDelPersonal("/panel/reportes/personal", pedido);
  if (!informe.ok) {
    return (
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-3 py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.problemas?.[0]?.message ?? informe.mensaje}
        </p>
        <a href={volver} className="text-detalle font-semibold text-brand underline">
          Volver al informe
        </a>
      </div>
    );
  }
  const i = informe.valor;
  const vales = i.porPersona.reduce((n, p) => n + p.vales, 0);
  return (
    <DocumentoDeInforme
      titulo="Consumo del personal"
      local={i.encabezado.local}
      periodo={periodoEnPalabras(i.periodo)}
      generadoEn={i.encabezado.generadoEn}
      generadoPor={i.encabezado.generadoPor}
      volver={volver}
    >
      <dl className="mb-3 grid grid-cols-3 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Consumió el equipo" valor={importe(i.total)} pie={`${i.porPersona.length} ${i.porPersona.length === 1 ? "persona" : "personas"}`} />
        <Dato termino="Vales" valor={String(vales)} pie="sin los anulados" />
        <Dato termino="Descuento del sueldo" valor="Fuera del sistema" pie="con los vales firmados de la caja" />
      </dl>
      {seccionesDelPersonal(i, reloj, true).map((s) => (
        <SeccionImpresa key={s.id} seccion={s} />
      ))}
    </DocumentoDeInforme>
  );
}

function Dato({ termino, valor, pie }: { termino: string; valor: string; pie: string }) {
  return (
    <div>
      <dt className="text-[8pt] font-semibold tracking-[0.05em] uppercase">{termino}</dt>
      <dd className="tnum text-[12pt] font-bold">{valor}</dd>
      <dd className="text-[8pt]">{pie}</dd>
    </div>
  );
}
