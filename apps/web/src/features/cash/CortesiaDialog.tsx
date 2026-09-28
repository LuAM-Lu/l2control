"use client";

import { useState } from "react";
import type { AccountLineDto, CortesiaDto, Rechazo } from "@l2/contracts";
import { Button, Dialog, Input, MoneyDisplay, cn } from "@l2/ui";
import { money, toMajor } from "@l2/domain-money";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";

/**
 * El motivo en palabras. Vive aquí y se exporta porque lo usan tres sitios —el
 * diálogo, el ticket y el recibo— y en ninguno se puede enseñar
 * `ERROR_DE_COCINA` tal cual a una persona.
 */
export const TEXTO_MOTIVO: Readonly<Record<CortesiaDto["motivo"], string>> = {
  INVITACION: "invitación de la casa",
  ERROR_DE_COCINA: "error de cocina",
  CONSUMO_DE_PERSONAL: "consumo de personal",
  OTRO: "otro",
};

const MOTIVOS: { id: CortesiaDto["motivo"]; texto: string }[] = [
  { id: "INVITACION", texto: "Invitación de la casa" },
  { id: "ERROR_DE_COCINA", texto: "Error de cocina o merma" },
  { id: "CONSUMO_DE_PERSONAL", texto: "Consumo de personal" },
  { id: "OTRO", texto: "Otro (explicar)" },
];

/**
 * Dar una línea como cortesía, o quitársela — F6-14, §7.5, en el servidor desde B3-4.
 *
 * El motivo es de lista cerrada; «Otro» pide explicarlo. Lo autoriza un supervisor con su PIN o la
 * administración con el suyo, y el servidor lo comprueba y pone quién y cuándo: la pantalla ya no lo
 * declara. La línea conserva su importe (se sabe cuánto se regaló) y deja de cobrarse.
 */
export function CortesiaDialog({
  linea,
  quitar,
  onAplicar,
  onCerrar,
}: {
  linea: AccountLineDto | null;
  quitar?: boolean;
  /** Pide la cortesía al servidor. Devuelve el rechazo, si lo hay, para enseñarlo aquí. */
  onAplicar: (motivo: CortesiaDto["motivo"] | null, detalle: string | undefined, autorizacion: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<CortesiaDto["motivo"] | null>(null);
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const a = useAutorizacion("cuenta.cortesia", linea !== null);

  // Cada línea abre el formulario limpio. Derivado en el render, sin efecto.
  if ((linea?.id ?? null) !== para) {
    setPara(linea?.id ?? null);
    setMotivo(null);
    setNota("");
    setErrores({});
  }

  if (!linea) return null;

  async function confirmar() {
    if (!linea || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (!quitar && !motivo) nuevos.motivo = "Elige el motivo";
    if (!quitar && motivo === "OTRO" && nota.trim().length < 3) nuevos.nota = "Explica la cortesía";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    const razon = quitar ? `Quitar la cortesía de ${linea.concept}` : `${TEXTO_MOTIVO[motivo!]}${nota.trim() ? ` · ${nota.trim()}` : ""}`;
    setEnviando(true);
    const rechazo = await onAplicar(quitar ? null : motivo, nota.trim() || undefined, a.autorizacion(razon)).catch(
      () => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se aplicó nada." }) as Rechazo,
    );
    setEnviando(false);
    if (!rechazo) return;
    const e = erroresDeRechazo(rechazo.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={quitar ? "Quitar cortesía" : "Dar como cortesía"}
      descripcion={quitar ? "La línea volverá a cobrarse en la cuenta." : "El importe de la línea se mantiene, pero no se cobrará."}
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant={quitar ? "danger" : "primary"} onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Aplicando…" : quitar ? "Quitar cortesía" : "Regalar"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-[var(--radius-control)] border border-line p-3">
          <p className="font-semibold text-ink">{linea.concept}</p>
          <p className="text-ink-2">
            <MoneyDisplay value={toMajor(money(BigInt(linea.amount.minor), linea.amount.currency))} currency={linea.amount.currency} />
          </p>
        </div>
        {/* ── 1. por qué ── */}
        {!quitar && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Motivo</legend>
            <div role="radiogroup" aria-label="Motivo de la cortesía" className="grid grid-cols-2 gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={motivo === m.id}
                  onClick={() => {
                    setMotivo(m.id);
                    setErrores((e) => ({ ...e, motivo: "" }));
                  }}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-left text-[13px] leading-tight transition-colors",
                    motivo === m.id ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  {m.texto}
                </button>
              ))}
            </div>
            {errores.motivo && <p className="text-[12px] text-state-crit">{errores.motivo}</p>}
            {motivo === "OTRO" && (
              <Input
                label="Explicación (obligatoria)"
                surface="tablet"
                value={nota}
                maxLength={120}
                onChange={(e) => setNota(e.target.value)}
                error={errores.nota || undefined}
              />
            )}
          </fieldset>
        )}

        {/* ── 2. quién autoriza ── */}
        <CampoAutorizacion
          a={a}
          numero={quitar ? 1 : 2}
          denegado="Tu puesto no puede conceder ni quitar cortesías."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />

        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
