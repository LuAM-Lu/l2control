"use client";

import { TriangleAlert } from "lucide-react";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import type { VentasPedidas } from "./reportes.servidor.ts";
import { DocumentoDeInforme, SeccionImpresa, importe, periodoEnPalabras } from "./informe.tsx";
import { deudasEnUnaLinea, direccionDeVentas, hayDeudas, seccionesDeVentas } from "./ventas.tsx";

/**
 * El PDF del informe de ventas (B11-1): el mismo informe que la pantalla, en una hoja A4 con todas sus secciones una
 * tras otra. Lo imprime el navegador, que también lo guarda como PDF.
 */
export function VentasImpreso({ pedido, informe }: VentasPedidas) {
  const reloj = useReloj();
  const volver = direccionDeVentas("/panel/reportes/ventas", pedido);
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
    <DocumentoDeInforme
      titulo="Informe de ventas"
      local={i.encabezado.local}
      periodo={periodoEnPalabras(i.periodo)}
      filtro={i.cajera ? `Solo los turnos de ${i.cajera.nombre}` : null}
      generadoEn={i.encabezado.generadoEn}
      generadoPor={i.encabezado.generadoPor}
      volver={volver}
    >
      <dl className="mb-3 grid grid-cols-4 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Vendido" valor={importe(r.vendido)} pie={`${r.ventas} ${r.ventas === 1 ? "venta" : "ventas"}`} />
        <Dato termino="Cobrado en dólares" valor={r.cobradoEnDolares ? importe(r.cobradoEnDolares) : "Sin tasa"} pie="con la tasa de cada cobro" />
        <Dato termino="Anuladas" valor={String(r.anuladas)} pie={importe(r.anulado)} />
        <Dato termino="Turnos con su Z" valor={`${r.turnos - r.turnosSinZ} de ${r.turnos}`} pie={r.turnosSinZ > 0 ? "sin Z, sus cifras pueden cambiar" : "todos cerrados"} />
      </dl>
      {seccionesDeVentas(i, reloj, true).map((s) => (
        <SeccionImpresa key={s.id} seccion={s} />
      ))}
      {r.desdePapel > 0 && <p className="text-[8.5pt]">{r.desdePapel} de las ventas se cargaron desde los formularios de papel.</p>}
      {hayDeudas(i.deudas) && (
        <p className="text-[8.5pt]">
          <span className="font-bold">Deudas de clientes.</span> {deudasEnUnaLinea(i.deudas)}. Lo recuperado ya está en lo vendido, en la cuenta con que se cobró; lo que quedó y lo perdido, no. El detalle, en el informe de deudas.
        </p>
      )}
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
