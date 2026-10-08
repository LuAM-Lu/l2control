"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { Rechazo } from "@l2/contracts";
import { Button, Dialog, Input } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";

/**
 * Anular la entrada de un niño registrada por error — B4-10 (M-27, P-7).
 *
 * No es una salida: el niño no debió entrar (se pasó la pulsera equivocada, se registró dos veces). Sale de la sala
 * sin cobro, su paquete deja de cobrarse y su pulsera vuelve a servir. Pide un motivo y lo autoriza administración con
 * su PIN (supervisión, con el de administración). Nada se borra: queda la estancia anulada, con quién y por qué.
 */
export function AnularEntradaDialog({
  nino,
  onAplicar,
  onCerrar,
}: {
  /** El niño cuya entrada se anula (su nombre visible), o `null` si el diálogo está cerrado. */
  nino: string | null;
  onAplicar: (motivo: string, autorizacion: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const a = useAutorizacion("parque.anularEntrada", nino !== null);

  // Cada niño abre el formulario limpio. Derivado en el render, sin efecto.
  if (nino !== para) {
    setPara(nino);
    setMotivo("");
    setErrores({});
  }
  if (nino === null) return null;

  async function confirmar() {
    if (enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (motivo.trim().length < 5) nuevos.motivo = "Explica qué pasó (al menos 5 letras)";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    const rechazo = await onAplicar(motivo.trim(), a.autorizacion(motivo.trim()));
    setEnviando(false);
    if (rechazo) setErrores(erroresDeRechazo(rechazo.mensaje));
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={`Anular la entrada de ${nino}`}
      descripcion="Para una entrada registrada por error. Sale de la sala sin cobro y su pulsera vuelve a servir. No tiene vuelta."
      pie={
        <div className="grid w-full grid-cols-2 gap-2">
          <Button variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={enviando || a.permiso === "DENEGADO"} onClick={() => void confirmar()}>
            {enviando ? "Anulando…" : "Anular la entrada"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg/40 px-3 py-2 text-[13px] text-ink-2">
          <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-state-warn" />
          Si el niño jugó y se va, no es esto: registra su salida. Si su paquete ya se cobró, primero se anula ese cobro en la caja.
        </p>
        <Input
          label="1 · Qué pasó"
          surface="tablet"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Se pasó la pulsera equivocada"
          maxLength={200}
          error={errores.motivo}
        />
        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede anular entradas: pídeselo a administración."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
        {errores.general && (
          <p role="alert" className="text-[13px] font-medium text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
