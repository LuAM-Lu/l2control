"use client";

import { useState } from "react";
import { CircleDollarSign, Trash2, UserPlus } from "lucide-react";
import type { DatosDelClienteDto, FamilyAccountDto, Rechazo } from "@l2/contracts";
import { toMajor } from "@l2/domain-money";
import { Button, Dialog, formatMoneyVE } from "@l2/ui";
import { DatosDelCliente, SIN_DATOS, problemasDelCliente } from "../clientes/DatosDelCliente.tsx";
import { numeroDeOrden, pendiente, puedeDescartarse } from "../cuentas/cuentas.ts";

/**
 * La venta del mostrador que se deja sin cobrar — B6-9 (M-33).
 *
 * En el mostrador se cobra al momento y la venta va a «Consumidor final» (DEC-23). Si la cajera sale de ella sin
 * cobrarla (elige otra cuenta, empieza otra venta o la entrada), la caja pregunta antes: cobrarla ahora, dejarla
 * pendiente a nombre de alguien —nombre, cédula y teléfono: si se va sin pagar, hay a quién cobrarle— o descartarla.
 */
export function VentaSinCobrar({
  cuenta,
  onCobrar,
  onDejarPendiente,
  onDescartar,
}: {
  /** La venta que se deja, o `null` si no hay nada que preguntar. */
  cuenta: FamilyAccountDto | null;
  /** Volver a ella para cobrarla: no se sale. */
  onCobrar: () => void;
  /** Le pone el cliente en el servidor y sigue; devuelve el rechazo, si lo hay, para enseñarlo aquí. */
  onDejarPendiente: (cliente: DatosDelClienteDto) => Promise<Rechazo | null>;
  onDescartar: () => void;
}) {
  const [conDatos, setConDatos] = useState(false);
  const [datos, setDatos] = useState<DatosDelClienteDto>(SIN_DATOS);
  const [errores, setErrores] = useState<ReturnType<typeof problemasDelCliente>>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraDe, setEraDe] = useState<string | null>(null);

  // Cada venta empieza la pregunta desde cero.
  if ((cuenta?.id ?? null) !== eraDe) {
    setEraDe(cuenta?.id ?? null);
    setConDatos(false);
    setDatos(SIN_DATOS);
    setErrores(null);
    setError(null);
  }

  async function dejarPendiente() {
    const problemas = problemasDelCliente(datos);
    setErrores(problemas);
    if (problemas) return;
    setEnviando(true);
    setError(null);
    const r = await onDejarPendiente(datos);
    setEnviando(false);
    if (r) setError(r.mensaje);
  }

  const debe = cuenta ? formatMoneyVE(toMajor(pendiente(cuenta)), "USD") : "";
  return (
    <Dialog
      abierto={cuenta !== null}
      onCerrar={onCobrar}
      titulo="Esta venta no está cobrada"
      descripcion={
        cuenta
          ? `${numeroDeOrden(cuenta)} · debe ${debe}. En el mostrador se cobra al momento; si queda pendiente, es a nombre de alguien: si se va sin pagar, hay a quién cobrarle.`
          : ""
      }
      pie={
        conDatos ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button surface="pos" variant="neutral" onClick={() => setConDatos(false)} disabled={enviando}>
              Volver
            </Button>
            <Button surface="pos" variant="primary" onClick={() => void dejarPendiente()} disabled={enviando}>
              <UserPlus size={17} aria-hidden="true" />
              {enviando ? "Anotando…" : "Dejarla pendiente"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {conDatos ? (
        <div className="flex flex-col gap-3">
          <DatosDelCliente
            valor={datos}
            // Después del primer intento, lo que falta se recalcula al escribir: un error corregido se va solo.
            onCambio={(d) => {
              setDatos(d);
              if (errores) setErrores(problemasDelCliente(d));
            }}
            errores={errores}
            surface="pos"
            autoFocus
          />
          {error && (
            <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button surface="pos" variant="primary" onClick={onCobrar} className="w-full justify-start">
            <CircleDollarSign size={18} aria-hidden="true" />
            Cobrarla ahora
          </Button>
          <Button surface="pos" variant="neutral" onClick={() => setConDatos(true)} className="w-full justify-start">
            <UserPlus size={18} aria-hidden="true" />
            Dejarla pendiente a nombre de…
          </Button>
          {cuenta && puedeDescartarse(cuenta) && (
            <Button surface="pos" variant="danger" onClick={onDescartar} className="w-full justify-start">
              <Trash2 size={18} aria-hidden="true" />
              Descartar la venta
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}
