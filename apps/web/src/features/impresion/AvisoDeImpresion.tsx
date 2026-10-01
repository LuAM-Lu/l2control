"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, PrinterX, RotateCcw } from "lucide-react";
import { Button, Dialog, avisar, cn } from "@l2/ui";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { useCola } from "./ColaProvider.tsx";

/** Lo que un trabajo puede esperar en cola sin que extrañe: después, el agente no lo está tomando. */
const ESPERA_NORMAL_MS = 60_000;

/**
 * La alerta de ADR-015: lo que no salió en papel se ve, no se esconde.
 *
 *  · Rojo, «N sin imprimir»: trabajos que fallaron (sin papel, la impresora no responde), con su motivo
 *    y «Reintentar».
 *  · Ámbar, «N en espera»: trabajos que llevan más de un minuto sin que el agente los tome. Casi siempre
 *    es la laptop de caja apagada o sin internet, o el agente parado: salen solos cuando vuelve.
 *
 * Icono y texto, nunca solo color. Sin nada de eso, nada.
 */
export function AvisoDeImpresion({ className }: { className?: string }) {
  const { trabajos, reintentar } = useCola();
  const hora = useHora();
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Un reloj que avanza solo para decidir qué lleva demasiado esperando (es de la pantalla, no del cobro).
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const fallidos = useMemo(() => trabajos.filter((t) => t.estado === "FALLIDO"), [trabajos]);
  const enEspera = useMemo(
    () => trabajos.filter((t) => (t.estado === "PENDIENTE" || t.estado === "ENVIADO") && ahora - Date.parse(t.creadoEn) > ESPERA_NORMAL_MS),
    [trabajos, ahora],
  );
  if (fallidos.length === 0 && enEspera.length === 0) return null;
  const critico = fallidos.length > 0;
  const lista = [...fallidos, ...enEspera];

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
        title={critico ? "Impresiones que no salieron" : "Impresiones esperando al agente de la caja"}
        className={cn(
          "inline-flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[13px] font-medium whitespace-nowrap",
          critico ? "bg-state-crit-bg text-state-crit" : "bg-state-warn-bg text-state-warn",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
      >
        {critico ? <PrinterX size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
        <span className="tnum">
          {critico ? `${fallidos.length} sin imprimir` : `${enEspera.length} en espera`}
          {critico && enEspera.length > 0 ? ` · ${enEspera.length} en espera` : ""}
        </span>
      </button>
      <Dialog
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo={critico ? "No salieron en papel" : "Esperando para imprimir"}
        descripcion={
          critico
            ? "Revisa la impresora (papel, encendida, en la red) y reintenta. Lo que se cobró o se cerró ya está guardado."
            : "El agente de impresión no los ha tomado: revisa que la laptop de caja esté encendida y con internet. Salen solos cuando vuelva."
        }
      >
        <ul className="flex flex-col gap-2">
          {lista.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">
                  {t.titulo}
                  {t.copia ? " (copia)" : ""}
                </span>
                <span className={cn("block truncate text-[12px]", t.estado === "FALLIDO" ? "text-state-crit" : "text-state-warn")}>
                  {t.estado === "FALLIDO" ? (t.error ?? "No salió") : t.error ? `Reintentando: ${t.error}` : "Esperando al agente de la caja"}
                </span>
                <span className="block text-[11.5px] text-ink-3">
                  {t.impresora.nombre} · {hora(Date.parse(t.creadoEn))} · {t.creadoPor}
                </span>
              </span>
              {t.estado === "FALLIDO" && (
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
              )}
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
