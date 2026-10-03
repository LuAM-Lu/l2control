"use client";

import { useState } from "react";
import type { MotivoAnulacionPedido, PedidoDto, Rechazo } from "@l2/contracts";
import { Button, Dialog, Input, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";

/** El motivo en palabras: vive aquí porque es lo único que lo enseña (§7.5). */
export const TEXTO_MOTIVO_ANULACION: Readonly<Record<MotivoAnulacionPedido, string>> = {
  PEDIDO_EQUIVOCADO: "pedido equivocado",
  CLIENTE_DESISTIO: "el cliente desistió",
  SIN_EXISTENCIA: "sin existencia",
  OTRO: "otro",
};

const MOTIVOS: { id: MotivoAnulacionPedido; texto: string }[] = [
  { id: "PEDIDO_EQUIVOCADO", texto: "Pedido equivocado" },
  { id: "CLIENTE_DESISTIO", texto: "El cliente desistió" },
  { id: "SIN_EXISTENCIA", texto: "Sin existencia" },
  { id: "OTRO", texto: "Otro (explicar)" },
];

const comanda = (n: number) => `#${String(n).padStart(4, "0")}`;

/**
 * Anular un pedido ya enviado a cocina — F6-14, B6-3.
 *
 * No es una cortesía: nada se entregó, el pedido no debió salir así. El motivo es de lista cerrada;
 * «Otro» pide explicarlo. Lo autoriza la administración o un supervisor con su PIN (el mesero no se
 * autoriza a sí mismo): el servidor lo comprueba y deja quién y cuándo. No tiene vuelta: lo anulado
 * por error se vuelve a pedir.
 */
export function AnularPedidoDialog({
  pedido,
  onAplicar,
  onCerrar,
}: {
  pedido: PedidoDto | null;
  /** Anula todos los platos anulables de este pedido, con el mismo motivo y autorización. */
  onAplicar: (motivo: MotivoAnulacionPedido, detalle: string | undefined, autorizacion: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<MotivoAnulacionPedido | null>(null);
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const a = useAutorizacion("pedido.anularEnProduccion", pedido !== null);

  // Cada pedido abre el formulario limpio. Derivado en el render, sin efecto.
  if ((pedido?.id ?? null) !== para) {
    setPara(pedido?.id ?? null);
    setMotivo(null);
    setNota("");
    setErrores({});
  }

  if (!pedido) return null;

  async function confirmar() {
    if (!pedido || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (!motivo) nuevos.motivo = "Elige el motivo";
    if (motivo === "OTRO" && nota.trim().length < 3) nuevos.nota = "Explica la anulación";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    const razon = `${TEXTO_MOTIVO_ANULACION[motivo!]}${nota.trim() ? ` · ${nota.trim()}` : ""}`;
    setEnviando(true);
    const rechazo = await onAplicar(motivo!, nota.trim() || undefined, a.autorizacion(razon)).catch(
      () => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se anuló nada." }) as Rechazo,
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
      titulo={`Anular comanda ${comanda(pedido.numero)}`}
      descripcion="Lo pedido no se borra: se anula, con su motivo y autorización, y no se cobra."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Anulando…" : "Anular pedido"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-[var(--radius-control)] border border-line p-3">
          <p className="text-[13px] text-ink">{pedido.lineas.map((l) => `${l.cantidad}× ${l.nombre}`).join(" · ")}</p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Motivo</legend>
          <div role="radiogroup" aria-label="Motivo de la anulación" className="grid grid-cols-2 gap-1.5">
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

        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede anular un pedido en producción."
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
