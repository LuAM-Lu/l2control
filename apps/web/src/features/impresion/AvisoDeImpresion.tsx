"use client";

import { useState } from "react";
import { PrinterX, RotateCcw } from "lucide-react";
import { Button, Dialog, avisar, cn } from "@l2/ui";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { useCola, useFallidos } from "./ColaProvider.tsx";

/**
 * La alerta de ADR-015: lo que no salió en papel se ve, no se esconde. Una píldora roja con cuántos
 * trabajos fallaron (icono y texto, nunca solo color) que abre la lista con su motivo y «Reintentar».
 * Sin fallos, nada.
 */
export function AvisoDeImpresion({ className }: { className?: string }) {
  const fallidos = useFallidos();
  const { reintentar } = useCola();
  const hora = useHora();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (fallidos.length === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
        title="Impresiones que no salieron"
        className={cn(
          "inline-flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] bg-state-crit-bg px-3 text-[13px] font-medium whitespace-nowrap text-state-crit",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
      >
        <PrinterX size={14} aria-hidden="true" />
        <span className="tnum">{fallidos.length === 1 ? "1 sin imprimir" : `${fallidos.length} sin imprimir`}</span>
      </button>
      <Dialog abierto={abierto} onCerrar={() => setAbierto(false)} titulo="No salieron en papel" descripcion="Revisa la impresora (papel, encendida, en la red) y reintenta. Lo que se cobró o se cerró ya está guardado.">
        <ul className="flex flex-col gap-2">
          {fallidos.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {t.titulo}
                  {t.copia ? " (copia)" : ""}
                </span>
                <span className="block truncate text-[12px] text-state-crit">{t.error ?? "No salió"}</span>
                <span className="block text-[11.5px] text-ink-3">
                  {t.impresora.nombre} · {hora(Date.parse(t.creadoEn))} · {t.creadoPor}
                </span>
              </span>
              <Button
                surface="tablet"
                variant="neutral"
                disabled={ocupado === t.id}
                onClick={async () => {
                  setOcupado(t.id);
                  const r = await reintentar(t.id);
                  setOcupado(null);
                  if (r.ok) avisar.info(`${t.titulo}: otra vez en cola`);
                  else avisar.error(r.mensaje);
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                Reintentar
              </Button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
