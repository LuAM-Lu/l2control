"use client";

import { useMemo, useRef, useState } from "react";
import { TimerReset } from "lucide-react";
import type { FamilyAccountDto, MonitorSnapshotDto, PricePackageDto } from "@l2/contracts";
import { Button, avisar, cn, formatMoneyVE } from "@l2/ui";
import { money, toMajor } from "@l2/domain-money";
import { fixed, subirDePaquete } from "@l2/domain-park";
import { recargarEstancia } from "./parque.acciones";
import { contratadoDeEstancia } from "./settlement.ts";

/**
 * Más tiempo para un niño en sala — F5-11; B4-17 (M-37): subir de paquete.
 *
 * El representante pide más tiempo: se ofrecen los paquetes mayores que el que tiene, cada uno con lo que falta pagar
 * (de 30 min a 1 hora, $ 2 más), y el total queda en el precio del paquete final. Ya no se apila otro paquete: 30 min
 * más otros 30 costaban $ 6 cuando la hora vale $ 5. El tiempo cuenta desde que entró, y la gracia corre desde el fin
 * del paquete nuevo.
 */
export function RecargarTiempo({
  estancia,
  paquetes,
  onHecha,
  onCancelar,
}: {
  /** La estancia como la ve la sala: lo que ya tiene (sus minutos y lo contratado). */
  estancia: MonitorSnapshotDto["sessions"][number];
  /** Los paquetes a la venta: se ofrecen los de tiempo fijo mayores que lo que tiene. */
  paquetes: readonly PricePackageDto[];
  onHecha: (cuenta: FamilyAccountDto) => void;
  onCancelar: () => void;
}) {
  const minutosAhora = estancia.duration.kind === "fixed" ? estancia.duration.minutes : 0;
  const contratado = contratadoDeEstancia(estancia);
  const opciones = useMemo(
    () =>
      paquetes
        .filter((p) => p.active && p.duration.kind === "fixed")
        .flatMap((p) => {
          const sube = subirDePaquete(
            { minutos: minutosAhora, contratado },
            { name: p.name, duration: fixed(p.duration.kind === "fixed" ? p.duration.minutes : 0), price: money(BigInt(p.price.minor), "USD") },
          );
          return sube ? [{ paquete: p, ...sube }] : [];
        })
        .sort((a, b) => a.minutos - b.minutos),
    [paquetes, minutosAhora, contratado.amount],
  );
  const [elegido, setElegido] = useState(opciones[0]?.paquete.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La clave de este intento: un reintento tras un corte no sube dos veces. */
  const clave = useRef<string | null>(null);
  const opcion = opciones.find((o) => o.paquete.id === elegido) ?? null;

  async function subir() {
    if (!opcion) return;
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await recargarEstancia({ idempotencyKey: clave.current, sessionId: estancia.id, packageId: opcion.paquete.id }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: no se sumó el tiempo. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    const falta = formatMoneyVE(toMajor(opcion.diferencia), "USD");
    avisar.ok(`Sube a ${opcion.paquete.name}`, {
      detalle: r.valor.account.mode === "PREPAGO" ? `${falta} más a la caja: se cobra ya.` : `${falta} más a su cuenta: se cobra al salir.`,
    });
    onHecha(r.valor.account);
  }

  if (opciones.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-[14px] text-ink-2">Ya tiene el paquete más largo de tiempo fijo: no hay uno mayor al que subir.</p>
        <Button variant="neutral" onClick={onCancelar}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="flex items-center gap-2 text-[14px] text-ink-2">
        <TimerReset size={16} aria-hidden="true" />
        Sube a un paquete mayor: paga solo la diferencia.
      </p>
      <div role="radiogroup" aria-label="Paquete al que sube" className="flex flex-col gap-2">
        {opciones.map((o) => (
          <button
            key={o.paquete.id}
            type="button"
            role="radio"
            aria-checked={elegido === o.paquete.id}
            onClick={() => setElegido(o.paquete.id)}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              elegido === o.paquete.id ? "border-brand bg-brand/15 text-ink" : "border-line bg-base text-ink-2 hover:border-line-strong",
            )}
          >
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold">{o.paquete.name}</span>
              <span className="text-[12px] text-ink-3">{o.minutos} min más</span>
            </span>
            <span className="tnum text-[14px] font-bold">+{formatMoneyVE(toMajor(o.diferencia), "USD")}</span>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-state-crit">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void subir()} disabled={!opcion || enviando}>
          {enviando ? "Sumando…" : opcion ? `Subir a ${opcion.paquete.name}` : "Subir"}
        </Button>
      </div>
    </div>
  );
}
