"use client";

import { useEffect, useState } from "react";
import { CircleCheckBig, ImageOff, Send, TriangleAlert } from "lucide-react";
import type { CapturaDto, ReporteEnviadoDto } from "@l2/contracts";
import { Button, Dialog, avisar, cn } from "@l2/ui";
import { VERSION } from "../shell/version.ts";
import { reportarProblema } from "./soporte.acciones.ts";
import { EstadoDeReporte } from "./estados.tsx";

export type PedidoDeReporte = Readonly<{
  /** La pantalla en la que pasó (solo la ruta). */
  ruta: string;
  /** El error conocido que se estaba viendo, si se reporta desde su ayuda. */
  codigoError: string | null;
  /** Los últimos errores que enseñó la pantalla. */
  errores: readonly string[];
  /** La captura tomada antes de abrir este diálogo; `null` si no se pudo. */
  captura: CapturaDto | null;
}>;

/**
 * «Reportar un problema» (T-11, M-27, P-4). La persona cuenta qué pasó; lo demás lo pone el sistema y se le dice qué:
 * la pantalla, la versión, el equipo, su rol, los últimos errores y la captura (que puede quitar). Nunca datos de cobro
 * ni PIN. Al enviarlo dice su número y, si el mismo error ya se conocía, cómo va.
 */
export function ReportarDialog({ pedido, onCerrar, onMisReportes }: { pedido: PedidoDeReporte | null; onCerrar: () => void; onMisReportes: () => void }) {
  const [texto, setTexto] = useState("");
  const [conCaptura, setConCaptura] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<ReporteEnviadoDto | null>(null);

  useEffect(() => {
    if (!pedido) return;
    setTexto("");
    setConCaptura(pedido.captura !== null);
    setError(null);
    setEnviado(null);
  }, [pedido]);

  const listo = texto.trim().length >= 3 && !enviando;

  async function enviar() {
    if (!pedido || !listo) return;
    setEnviando(true);
    setError(null);
    const r = await reportarProblema({
      texto: texto.trim(),
      ruta: pedido.ruta,
      version: VERSION.numero || "0.0.0",
      ...(pedido.codigoError ? { codigoError: pedido.codigoError } : {}),
      errores: pedido.errores,
      ...(conCaptura && pedido.captura ? { captura: pedido.captura } : {}),
    }).catch(() => null);
    setEnviando(false);
    if (!r) return setError("El servidor no respondió: el reporte no se envió. Inténtalo de nuevo.");
    if (!r.ok) return setError(r.mensaje);
    setEnviado(r.valor);
    avisar.ok(`Reporte n.º ${r.valor.reporte.numero} enviado`);
  }

  const vistaPrevia = pedido?.captura ? `data:${pedido.captura.tipo};base64,${pedido.captura.base64}` : null;

  return (
    <Dialog
      abierto={pedido !== null}
      onCerrar={onCerrar}
      titulo={enviado ? `Reporte n.º ${enviado.reporte.numero}` : "Reportar un problema"}
      descripcion={enviado ? "Llegó al soporte. Lo sigues en «Mis reportes», en la ayuda." : "Cuenta qué pasó. Lo demás lo pone el sistema."}
      pie={
        enviado ? (
          <div className="flex gap-2">
            <Button surface="tablet" variant="ghost" className="flex-1" onClick={onMisReportes}>
              Mis reportes
            </Button>
            <Button surface="tablet" variant="primary" className="flex-1" onClick={onCerrar}>
              Listo
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button surface="tablet" variant="ghost" className="flex-1" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button surface="tablet" variant="primary" className="flex-1" onClick={() => void enviar()} disabled={!listo}>
              <Send size={16} aria-hidden="true" />
              {enviando ? "Enviando…" : "Enviar el reporte"}
            </Button>
          </div>
        )
      }
    >
      {enviado ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-cuerpo text-ink">
            <CircleCheckBig size={18} aria-hidden="true" className="shrink-0 text-state-ok" />
            Gracias: quedó en el servidor del local y el soporte ya lo tiene.
          </p>
          <div className="flex items-center gap-2">
            <EstadoDeReporte reporte={enviado.reporte} />
          </div>
          {enviado.conocido && (
            <p className="rounded-[var(--radius-control)] border border-line bg-base/40 p-3 text-detalle text-ink-2">
              {enviado.conocido.estado === "RESUELTO"
                ? `Este error ya se había reportado y quedó resuelto en la versión ${enviado.conocido.resueltoEn}. Si este equipo tiene una anterior, se pone al día solo; si sigue pasando, tu reporte lo dice.`
                : enviado.conocido.estado === "EN_CURSO"
                  ? `Este error ya se conoce: ${enviado.conocido.antes === 1 ? "hay otro reporte" : `hay ${enviado.conocido.antes} reportes`} y se está trabajando en él. Tu reporte se suma.`
                  : `Este error ya se había reportado (${enviado.conocido.antes === 1 ? "un reporte" : `${enviado.conocido.antes} reportes`}). Tu reporte se suma y ayuda a darle prioridad.`}
            </p>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-etiqueta font-semibold text-ink-2 uppercase">Qué pasó</span>
            <textarea
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Qué hacías, qué esperabas y qué salió. Por ejemplo: «Al cobrar en bolívares dice que no hay tasa»."
              className="min-h-24 w-full rounded-[var(--radius-control)] border border-line bg-base px-3 py-2 text-cuerpo text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>

          {pedido?.captura && vistaPrevia ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line bg-base/40 p-2">
              <input type="checkbox" className="mt-1 size-4 accent-[var(--color-brand)]" checked={conCaptura} onChange={(e) => setConCaptura(e.target.checked)} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-detalle font-semibold text-ink">Adjuntar la captura de la pantalla</span>
                {/* La vista previa: lo que se envía, sin los datos de cobro ni el PIN. */}
                <img src={vistaPrevia} alt="Captura de la pantalla que se adjunta" className={cn("max-h-40 w-full rounded border border-line object-contain object-left-top", !conCaptura && "opacity-35")} />
              </span>
            </label>
          ) : (
            <p className="flex items-center gap-2 text-detalle text-ink-3">
              <ImageOff size={15} aria-hidden="true" className="shrink-0" />
              No se pudo tomar la captura en este equipo: el reporte va sin ella.
            </p>
          )}

          <p className="text-nota text-ink-3">
            Se adjunta la pantalla ({pedido?.ruta}), la versión ({VERSION.numero ? `v${VERSION.numero}` : "sin versión"}), tu nombre, tu rol, el equipo y{" "}
            {pedido && pedido.errores.length > 0
              ? pedido.errores.length === 1
                ? "el último error que salió"
                : `los últimos ${pedido.errores.length} errores que salieron`
              : "ningún error (no salió ninguno)"}
            . Nunca datos de cobro ni tu PIN.
          </p>

          {error && (
            <p role="alert" className="flex items-start gap-2 text-detalle font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Dialog>
  );
}
