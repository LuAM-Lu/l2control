"use client";

import { TriangleAlert } from "lucide-react";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import type { ParquePedido } from "./reportes.servidor.ts";
import { DocumentoDeInforme, SeccionImpresa, importe, periodoEnPalabras } from "./informe.tsx";
import { direccionDelParque, duracion, seccionesDelParque } from "./parque.tsx";

/**
 * El PDF del parque (B11-6): compacto, con las cifras arriba y las cinco secciones. Lo imprime el navegador, que también
 * lo guarda como PDF.
 */
export function ParqueImpreso({ pedido, informe }: ParquePedido) {
  const reloj = useReloj();
  const { formatoHora } = useSucursal().ajustes;
  const volver = direccionDelParque("/panel/reportes/parque", pedido);
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
  const r = i.resumen;
  return (
    <DocumentoDeInforme titulo="Parque" local={i.encabezado.local} periodo={periodoEnPalabras(i.periodo)} generadoEn={i.encabezado.generadoEn} generadoPor={i.encabezado.generadoPor} volver={volver}>
      <dl className="mb-3 grid grid-cols-4 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Niños" valor={String(r.ninos)} pie={`${i.porDia.length} ${i.porDia.length === 1 ? "día" : "días"}`} />
        <Dato termino="Aforo pico" valor={r.pico ? `${r.pico.ninos} de ${r.aforo}` : "—"} pie={r.pico ? reloj.diaYHora(Date.parse(r.pico.en)) : "sin estancias"} />
        <Dato termino="Tiempo promedio" valor={duracion(r.minutosPromedio)} pie="sin pausas por comida" />
        <Dato termino="Dinero del tiempo" valor={importe(r.dinero)} pie={`en mesas ${importe(i.dinero.enMesas.monto)}`} />
      </dl>
      {seccionesDelParque(i, reloj, formatoHora, true).map((s) => (
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
