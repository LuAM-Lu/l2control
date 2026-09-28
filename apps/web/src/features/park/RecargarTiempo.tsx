"use client";

import { useMemo, useRef, useState } from "react";
import { TimerReset } from "lucide-react";
import type { FamilyAccountDto, PricePackageDto } from "@l2/contracts";
import { Button, avisar, formatMoneyVE } from "@l2/ui";
import { toMajor } from "@l2/domain-money";
import { PackagePicker } from "./PackagePicker";
import { toMoney } from "./mappers.ts";
import { recargarEstancia } from "./parque.acciones";

/**
 * Recargar tiempo a un niño en sala — F5-11, R2.
 *
 * Faltan unos minutos, el representante pide más tiempo: se elige un paquete de tiempo fijo y el
 * servidor suma el tramo a la estancia y su precio a la cuenta de la familia. La tarjeta vuelve a
 * estar en tiempo; la estancia conserva sus tramos y cada uno su cobro.
 */
export function RecargarTiempo({
  sessionId,
  paquetes,
  onHecha,
  onCancelar,
}: {
  sessionId: string;
  /** Los paquetes a la venta de tiempo fijo: el tiempo abierto no se suma. */
  paquetes: readonly PricePackageDto[];
  onHecha: (cuenta: FamilyAccountDto) => void;
  onCancelar: () => void;
}) {
  const fijos = useMemo(() => paquetes.filter((p) => p.active && p.duration.kind === "fixed"), [paquetes]);
  const [elegido, setElegido] = useState(fijos[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** La clave de este intento: un reintento tras un corte no recarga dos veces. */
  const clave = useRef<string | null>(null);
  const paquete = fijos.find((p) => p.id === elegido) ?? null;

  async function recargar() {
    if (!paquete) return;
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await recargarEstancia({ idempotencyKey: clave.current, sessionId, packageId: paquete.id }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: la recarga no se registró. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    avisar.ok(`Recarga de ${paquete.name}`, {
      detalle:
        r.valor.account.mode === "PREPAGO"
          ? `${formatMoneyVE(toMajor(toMoney(paquete.price)), "USD")} a la caja: se cobra ya.`
          : `${formatMoneyVE(toMajor(toMoney(paquete.price)), "USD")} a su cuenta: se cobra al salir.`,
    });
    onHecha(r.valor.account);
  }

  if (fijos.length === 0) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-[14px] text-ink-2">No hay paquetes de tiempo fijo a la venta para recargar.</p>
        <Button variant="neutral" onClick={onCancelar}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="flex items-center gap-2 text-[14px] text-ink-2">
        <TimerReset size={16} aria-hidden="true" />
        Elige cuánto tiempo más. Se suma a lo que le queda.
      </p>
      <PackagePicker packages={fijos} selectedId={elegido} onSelect={setElegido} />
      {error && (
        <p role="alert" className="text-[13px] text-state-crit">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => void recargar()} disabled={!paquete || enviando}>
          {enviando ? "Recargando…" : paquete ? `Recargar ${paquete.name}` : "Recargar"}
        </Button>
      </div>
    </div>
  );
}
