"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ImageIcon } from "lucide-react";
import type { ReporteDto } from "@l2/contracts";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerMisReportes } from "./soporte.acciones.ts";
import { EstadoDeReporte } from "./estados.tsx";

/**
 * «Mis reportes» (T-11): los problemas que reportó la persona de la sesión y cómo va cada uno. Se lee al abrirse y cada
 * vez que el soporte cambia un estado (tema «soporte»).
 */
export function MisReportes() {
  const reloj = useReloj();
  const [reportes, setReportes] = useState<readonly ReporteDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = useCallback(() => {
    void leerMisReportes()
      .then((r) => {
        if (r.ok) {
          setReportes(r.valor.reportes);
          setError(null);
        } else setError(r.mensaje);
      })
      .catch(() => setError("El servidor no respondió: no se pudieron leer tus reportes."));
  }, []);
  useEffect(leer, [leer]);
  useAlCambiar(["soporte"], leer);

  if (error) return <p role="alert" className="text-detalle text-state-crit">{error}</p>;
  if (!reportes) return <p className="text-detalle text-ink-3">Leyendo tus reportes…</p>;
  if (reportes.length === 0) return <p className="text-detalle text-ink-3">Todavía no has reportado nada.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {reportes.slice(0, 8).map((r) => (
        <li key={r.id} className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-detalle font-semibold text-ink">
              N.º {r.numero} · {reloj.diaYHora(Date.parse(r.creadoEn))}
            </span>
            <EstadoDeReporte reporte={r} />
          </span>
          <span className="line-clamp-2 text-detalle text-ink-2">{r.texto}</span>
          {(r.iguales > 0 || r.conCaptura) && (
            <span className="flex flex-wrap gap-3 text-nota text-ink-3">
              {r.iguales > 0 && (
                <span className="flex items-center gap-1">
                  <Copy size={12} aria-hidden="true" />
                  {r.iguales === 1 ? "Otro reporte igual" : `${r.iguales} reportes iguales`}
                </span>
              )}
              {r.conCaptura && (
                <span className="flex items-center gap-1">
                  <ImageIcon size={12} aria-hidden="true" />
                  Con captura
                </span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
