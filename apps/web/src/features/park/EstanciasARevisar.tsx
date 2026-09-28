"use client";

import { useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import type { EstanciaDto } from "@l2/contracts";
import { Button, Input, Sheet, avisar } from "@l2/ui";
import { formatClock, type TimeFormat } from "./time-format.ts";
import { nombreDeEstancia } from "./view-model";
import { cerrarEstanciaHuerfana } from "./parque.acciones";

/**
 * Estancias a revisar — F5-13, H-19.
 *
 * Siguen abiertas desde un día anterior o llevan más de 8 horas: casi seguro el niño se fue sin que
 * se registrara la salida. No cuentan en el aforo ni se les cobra tiempo de más. La dirección las
 * cierra con un motivo; lo contratado se sigue debiendo en la cuenta de la familia.
 */
export function EstanciasARevisar({
  abierto,
  onCerrar,
  huerfanas,
  puedeCerrar,
  formatoHora,
  onCerrada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  huerfanas: readonly EstanciaDto[];
  /** Si quien opera puede cerrarlas (`parque.cerrarHuerfana`); si no, solo las ve. */
  puedeCerrar: boolean;
  formatoHora: TimeFormat;
  onCerrada: () => void;
}) {
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const clave = useRef<string | null>(null);

  async function confirmar(sessionId: string) {
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await cerrarEstanciaHuerfana({ idempotencyKey: clave.current, sessionId, motivo }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: no se cerró. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      setError(r.problemas?.[0]?.message && r.motivo === "INVALIDO" ? "Explica qué pasó (al menos 5 letras)." : r.mensaje);
      return;
    }
    avisar.ok("Estancia cerrada", { detalle: "Sin tiempo de más. Lo contratado sigue en la cuenta de la familia." });
    setCerrando(null);
    setMotivo("");
    setError(null);
    onCerrada();
  }

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Estancias a revisar"
      descripcion="Abiertas desde un día anterior o con más de 8 horas dentro. No cuentan en el aforo ni se les cobra tiempo de más."
    >
      <ul className="flex flex-col gap-3">
        {huerfanas.map((h) => (
          <li key={h.id} className="rounded-[var(--radius-card)] border border-line bg-base/40 p-3 text-[13px]">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-ink">{nombreDeEstancia(h)}</span>
              <span className="tnum font-mono text-[12px] text-ink-3">{h.wristbandCode}</span>
            </p>
            <p className="tnum mt-1 text-ink-3">
              {h.guardianName} · entró el {new Date(h.startedAt).toLocaleDateString("es-VE", { day: "numeric", month: "short" })} a las{" "}
              {formatClock(Date.parse(h.startedAt), formatoHora)} · {h.packageName}
            </p>
            {puedeCerrar &&
              (cerrando === h.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Input
                    label="Qué pasó"
                    value={motivo}
                    onChange={(e) => {
                      setMotivo(e.target.value);
                      setError(null);
                    }}
                    placeholder="Se fue sin registrar la salida"
                    autoComplete="off"
                  />
                  {error && (
                    <p role="alert" className="text-state-crit">
                      {error}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => setCerrando(null)} disabled={enviando}>
                      Cancelar
                    </Button>
                    <Button variant="primary" className="flex-1" onClick={() => void confirmar(h.id)} disabled={enviando || motivo.trim().length < 5}>
                      {enviando ? "Cerrando…" : "Cerrar sin tiempo de más"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="neutral"
                  className="mt-3 w-full"
                  onClick={() => {
                    setCerrando(h.id);
                    setMotivo("");
                    setError(null);
                  }}
                >
                  <ClipboardList size={16} aria-hidden="true" />
                  Cerrar esta estancia
                </Button>
              ))}
          </li>
        ))}
      </ul>
      {!puedeCerrar && huerfanas.length > 0 && (
        <p className="mt-4 text-[13px] text-ink-3">Las cierra la dirección del local (supervisión o administración).</p>
      )}
    </Sheet>
  );
}
