"use client";

import { TriangleAlert } from "lucide-react";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import type { MovimientosPedidos } from "./reportes.servidor.ts";
import { DocumentoDeInforme, SeccionImpresa, periodoEnPalabras } from "./informe.tsx";
import { direccionDeMovimientos, seccionDeKardex, seccionDeResumen } from "./movimientos.tsx";

/**
 * El PDF del kárdex (B11-3): con una categoría, su resumen y el kárdex de cada producto, uno tras otro; con un
 * producto, el suyo. Lo imprime el navegador, que también lo guarda como PDF.
 */
export function MovimientosImpreso({ pedido, informe }: MovimientosPedidos) {
  const reloj = useReloj();
  const volver = direccionDeMovimientos("/panel/reportes/movimientos", pedido);
  if (!informe.ok || informe.valor.productos.length === 0) {
    return (
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-3 py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {!informe.ok ? (informe.problemas?.[0]?.message ?? informe.mensaje) : "Elige un producto o una categoría antes de imprimir."}
        </p>
        <a href={volver} className="text-detalle font-semibold text-brand underline">
          Volver al informe
        </a>
      </div>
    );
  }
  const i = informe.valor;
  return (
    <DocumentoDeInforme
      titulo="Movimientos de inventario"
      local={i.encabezado.local}
      periodo={periodoEnPalabras(i.periodo)}
      filtro={i.filtro.categoria ? `Categoría ${i.filtro.categoria}` : i.filtro.producto}
      generadoEn={i.encabezado.generadoEn}
      generadoPor={i.encabezado.generadoPor}
      volver={volver}
    >
      <p className="mb-2 text-[8.5pt]">En unidades de venta. Un conteo que cuadró y un inventario inicial en cero no mueven nada: salen con cantidad 0.</p>
      {i.filtro.categoria && <SeccionImpresa seccion={seccionDeResumen(i)} />}
      {i.productos.map((p) => (
        <SeccionImpresa key={p.id} seccion={seccionDeKardex(p, i.periodo, reloj)} />
      ))}
    </DocumentoDeInforme>
  );
}
