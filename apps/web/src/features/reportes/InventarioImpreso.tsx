"use client";

import { TriangleAlert } from "lucide-react";
import type { InformeDeInventarioDto, Resultado } from "@l2/contracts";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { DocumentoDeInforme, SeccionImpresa, importe } from "./informe.tsx";
import { productosFiltrados, seccionesDeInventario, type FiltroDeInventario } from "./inventario.tsx";

/**
 * El PDF del inventario al momento (B11-2): el resumen y una tabla por categoría, con el filtro que se puso en la
 * pantalla (estado y categoría). Lo imprime el navegador, que también lo guarda como PDF.
 */

const NOMBRE_FILTRO = { TODOS: null, AGOTADO: "Solo los agotados", BAJO_MINIMO: "Solo lo bajo mínimo", SIN_INICIAL: "Solo lo sin contar" } as const;

export function InventarioImpreso({ informe, filtro }: { informe: Resultado<InformeDeInventarioDto>; filtro: FiltroDeInventario }) {
  const reloj = useReloj();
  if (!informe.ok) {
    return (
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-3 py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.mensaje}
        </p>
        <a href="/panel/reportes/inventario" className="text-detalle font-semibold text-brand underline">
          Volver al informe
        </a>
      </div>
    );
  }
  const i = informe.valor;
  const r = i.resumen;
  const instante = Date.parse(i.encabezado.generadoEn);
  const filtros = [NOMBRE_FILTRO[filtro.estado], filtro.categoria && `categoría ${filtro.categoria}`].filter(Boolean).join(" · ");
  return (
    <DocumentoDeInforme
      titulo="Inventario al momento"
      local={i.encabezado.local}
      periodo={`A las ${reloj.hora(instante)} del ${reloj.diaConAnio(instante)}`}
      filtro={filtros || null}
      generadoEn={i.encabezado.generadoEn}
      generadoPor={i.encabezado.generadoPor}
      volver="/panel/reportes/inventario"
    >
      <dl className="mb-3 grid grid-cols-4 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Valor al costo" valor={importe(r.valor)} pie={`${r.unidades} unidades en ${r.productos} productos`} />
        <Dato termino="Agotados" valor={String(r.agotados)} pie="no se venden" />
        <Dato termino="Bajo mínimo" valor={String(r.bajoMinimo)} pie="hay que reponer" />
        <Dato termino="Sin contar" valor={String(r.sinInicial)} pie="sin inventario inicial" />
      </dl>
      {filtros && <p className="mb-2 text-[8.5pt]">Con el filtro puesto salen {productosFiltrados(i, filtro).length} de {r.productos} productos; el resumen es del inventario entero.</p>}
      {seccionesDeInventario(i, filtro, true).map((s) => (
        <SeccionImpresa key={s.id} seccion={s} />
      ))}
      <p className="text-[8.5pt]">El valor al costo es la suma de los movimientos al costo promedio (lo que costó lo que entró, menos lo que salió).</p>
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
