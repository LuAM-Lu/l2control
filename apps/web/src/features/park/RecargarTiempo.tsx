"use client";

import { useMemo, useRef, useState } from "react";
import { TimerReset } from "lucide-react";
import type { FamilyAccountDto, MonitorSnapshotDto, PricePackageDto } from "@l2/contracts";
import { Button, avisar, cn, formatMoneyVE } from "@l2/ui";
import { money, toMajor } from "@l2/domain-money";
import { fixed, recargaDePaquete } from "@l2/domain-park";
import { recargarEstancia } from "./parque.acciones";
import { contratadoDeEstancia } from "./settlement.ts";

/**
 * Más tiempo para un niño en sala — F5-11; B4-17 (M-37); B4-23 (M-42).
 *
 * Según la regla con que entró la estancia (`estancia.terms.tiempoDeMas`):
 *  · **Por bloques (`POR_BLOQUES`):** suma un paquete fijo entero a su precio completo (30 min + 30 min = $ 6).
 *  · **Con tope (`CON_TOPE`):** sube a un paquete mayor pagando solo la diferencia (de 30 min a 1 hora, $ 2 más).
 * El tiempo cuenta desde que entró, y la gracia corre desde el fin del tiempo nuevo.
 */
export function RecargarTiempo({
  estancia,
  paquetes,
  onHecha,
  onCancelar,
}: {
  /** La estancia como la ve la sala: lo que ya tiene (sus minutos y lo contratado). */
  estancia: MonitorSnapshotDto["sessions"][number];
  /** Los paquetes a la venta: se ofrecen los de tiempo fijo admitidos por la regla de la estancia. */
  paquetes: readonly PricePackageDto[];
  onHecha: (cuenta: FamilyAccountDto) => void;
  onCancelar: () => void;
}) {
  const minutosAhora = estancia.duration.kind === "fixed" ? estancia.duration.minutes : 0;
  const contratado = contratadoDeEstancia(estancia);
  const porBloques = estancia.terms.tiempoDeMas === "POR_BLOQUES";
  const opciones = useMemo(
    () =>
      paquetes
        .filter((p) => p.active && p.duration.kind === "fixed")
        .flatMap((p) => {
          const rec = recargaDePaquete(
            { minutos: minutosAhora, contratado },
            { name: p.name, duration: fixed(p.duration.kind === "fixed" ? p.duration.minutes : 0), price: money(BigInt(p.price.minor), "USD") },
            estancia.terms.tiempoDeMas,
          );
          return rec ? [{ paquete: p, ...rec }] : [];
        })
        .sort((a, b) => a.minutos - b.minutos),
    [paquetes, minutosAhora, contratado.amount, estancia.terms.tiempoDeMas],
  );
  const [elegido, setElegido] = useState(opciones[0]?.paquete.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La clave de este intento: un reintento tras un corte no suma dos veces. */
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
    const monto = formatMoneyVE(toMajor(opcion.precio), "USD");
    avisar.ok(opcion.sumaCompleta ? `Más tiempo: +${opcion.paquete.name}` : `Sube a ${opcion.paquete.name}`, {
      detalle: r.valor.account.mode === "PREPAGO" ? `${monto} más a la caja: se cobra ya.` : `${monto} más a su cuenta: se cobra al salir.`,
    });
    onHecha(r.valor.account);
  }

  if (opciones.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-[14px] text-ink-2">
          {porBloques ? "No hay paquetes de tiempo fijo a la venta para sumar." : "Ya tiene el paquete más largo de tiempo fijo: no hay uno mayor al que subir."}
        </p>
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
        {porBloques ? "Suma un paquete entero al tiempo actual." : "Sube a un paquete mayor: paga solo la diferencia."}
      </p>
      <div role="radiogroup" aria-label={porBloques ? "Paquete a sumar" : "Paquete al que sube"} className="flex flex-col gap-2">
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
              <span className="text-[14px] font-semibold">{o.sumaCompleta ? `+${o.paquete.name}` : o.paquete.name}</span>
              <span className="text-[12px] text-ink-3">{o.minutos} min más</span>
            </span>
            <span className="tnum text-[14px] font-bold">+{formatMoneyVE(toMajor(o.precio), "USD")}</span>
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
          {enviando ? "Sumando…" : opcion ? (opcion.sumaCompleta ? `Sumar ${opcion.paquete.name}` : `Subir a ${opcion.paquete.name}`) : "Sumar"}
        </Button>
      </div>
    </div>
  );
}
