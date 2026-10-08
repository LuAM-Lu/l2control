"use client";

import { TriangleAlert } from "lucide-react";
import { TAMANO_ICONO } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import type { DeudasPedidas } from "./reportes.servidor.ts";
import { DocumentoDeInforme, SeccionImpresa, TablaDeInforme, importe, periodoEnPalabras } from "./informe.tsx";
import { EstadoDeDeuda, direccionDeDeudas, ordenDeDeuda, seccionDeHistoria, seccionesDeDeudas } from "./deudas.tsx";

/**
 * El PDF del informe de deudas (B11-4): el resumen, las deudas, por mesero, por quien autorizó y la historia de cada
 * una, con la cédula y el teléfono completos del cliente (M-33). Lo imprime el navegador, que también lo guarda como PDF.
 */
export function DeudasImpreso({ pedido, informe }: DeudasPedidas) {
  const reloj = useReloj();
  const { preciosConIva } = useSucursal().ajustes;
  const volver = direccionDeDeudas("/panel/reportes/deudas", pedido);
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
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
  return (
    <DocumentoDeInforme
      titulo="Deudas de clientes"
      local={i.encabezado.local}
      periodo={periodoEnPalabras(i.periodo)}
      generadoEn={i.encabezado.generadoEn}
      generadoPor={i.encabezado.generadoPor}
      volver={volver}
    >
      <dl className="mb-3 grid grid-cols-4 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Quedaron en deuda" valor={importe(r.quedaron.monto)} pie={n(r.quedaron.cantidad, "deuda", "deudas")} />
        <Dato termino="Recuperado" valor={importe(r.recuperado.monto)} pie={n(r.recuperado.cantidad, "cobrada", "cobradas")} />
        <Dato termino="Perdido" valor={importe(r.perdido.monto)} pie={n(r.perdido.cantidad, "dada por perdida", "dadas por perdidas")} />
        <Dato termino="Pendiente al terminar" valor={importe(r.pendienteAlTerminar.monto)} pie={`${n(r.pendienteAlTerminar.cantidad, "deuda", "deudas")} por cobrar`} />
      </dl>
      {seccionesDeDeudas(i, reloj, true).map((s) => (
        <SeccionImpresa key={s.id} seccion={s} />
      ))}
      {i.deudas.length > 0 && <h2 className="mt-4 mb-1 border-b border-current/60 pb-0.5 text-[12pt] font-bold [break-after:avoid]">La historia de cada deuda</h2>}
      {i.deudas.map((d) => (
        <section key={d.id} className="mb-3 [break-inside:avoid]">
          <h3 className="text-[10.5pt] font-bold [break-after:avoid]">
            {ordenDeDeuda(d.orden)} · {d.lugar} · {importe(d.monto)} · <EstadoDeDeuda estado={d.estado} dias={d.diasPendiente} papel />
          </h3>
          <p className="mb-0.5 text-[9pt]">
            Cliente: <span className="font-semibold">{d.cliente.nombre}</span> · <span className="tnum">{d.cliente.cedula}</span> · <span className="tnum">{d.cliente.telefono}</span>. Lo
            sentó {d.sentadoPor}.
          </p>
          <TablaDeInforme seccion={seccionDeHistoria(d, reloj, preciosConIva, true)} papel />
        </section>
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
