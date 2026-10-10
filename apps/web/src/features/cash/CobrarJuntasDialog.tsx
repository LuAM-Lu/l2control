"use client";

import { useRef, useState } from "react";
import { Combine } from "lucide-react";
import type { FamilyAccountDto } from "@l2/contracts";
import { sum, toMajor } from "@l2/domain-money";
import { Button, Dialog, MoneyDisplay, cn } from "@l2/ui";
import { nombreDeCuenta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import { juntarCuentas } from "../cuentas/cuentas.acciones.ts";

/**
 * Cobrar juntas — B3-16 (M-37).
 *
 * Las cuentas marcadas en la cola se cobran una vez, con un solo recibo: lo pendiente de las otras pasa a la que queda
 * (la primera marcada, o la que elija la cajera), cada línea con de qué cuenta vino; las otras salen de la cola
 * «juntadas en #N». Nada se borra. Hecho, la caja abre la que queda para cobrarla.
 */
export function CobrarJuntasDialog({
  cuentas,
  onCerrar,
  adoptar,
  onHecha,
}: {
  /** Las marcadas, en el orden en que se marcaron; vacío, el diálogo está cerrado. */
  cuentas: readonly FamilyAccountDto[];
  onCerrar: () => void;
  adoptar: (cuenta: FamilyAccountDto) => void;
  /** La que queda, ya con todo: la caja la abre para cobrarla. */
  onHecha: (destino: FamilyAccountDto) => void;
}) {
  const [queda, setQueda] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eran, setEran] = useState("");
  /** La clave de este intento: un reintento tras un corte no las junta dos veces. */
  const clave = useRef<string | null>(null);

  // Cada selección empieza desde cero: queda la primera marcada.
  const ids = cuentas.map((c) => c.id).join(",");
  if (ids !== eran) {
    setEran(ids);
    setQueda(cuentas[0]?.id ?? null);
    setError(null);
    clave.current = null;
  }

  const destino = cuentas.find((c) => c.id === queda) ?? cuentas[0] ?? null;
  const total = sum(cuentas.map(pendiente), "USD");

  async function juntar() {
    if (!destino) return;
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    setError(null);
    const r = await juntarCuentas({
      idempotencyKey: clave.current,
      destino: { accountId: destino.id, version: destino.version },
      otras: cuentas.filter((c) => c.id !== destino.id).map((c) => ({ accountId: c.id, version: c.version })),
    }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: no se juntaron. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      setError(r.mensaje);
      return;
    }
    for (const o of r.valor.otras) adoptar(o);
    adoptar(r.valor.destino);
    onHecha(r.valor.destino);
  }

  return (
    <Dialog
      abierto={cuentas.length > 0}
      onCerrar={onCerrar}
      titulo={`Cobrar juntas · ${cuentas.length} cuentas`}
      descripcion="Lo que deben las otras pasa a la que queda, con de qué cuenta vino cada cosa, y se cobra una vez con un solo recibo. Las otras salen de la cola juntadas en ella."
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void juntar()} disabled={!destino || enviando}>
            <Combine size={17} aria-hidden="true" />
            {enviando ? "Juntando…" : "Juntar y cobrar"}
          </Button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">La que queda</legend>
        <ul className="flex flex-col gap-1.5">
          {cuentas.map((c) => {
            const marcada = c.id === destino?.id;
            return (
              <li key={c.id}>
                <label
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2",
                    "transition-colors duration-[var(--dur-rapida)]",
                    marcada ? "border-brand/60 bg-brand/10" : "border-line bg-base/40 hover:border-line-strong",
                  )}
                >
                  <input type="radio" name="queda" checked={marcada} onChange={() => setQueda(c.id)} className="size-5 accent-[var(--color-brand)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-ink">{nombreDeCuenta(c)}</span>
                    <span className="tnum block text-[12.5px] text-ink-2">
                      {numeroDeOrden(c)} · {marcada ? "queda, y se cobra con todo" : `se junta en ${destino ? numeroDeOrden(destino) : "la que queda"}`}
                    </span>
                  </span>
                  <MoneyDisplay value={toMajor(pendiente(c))} currency="USD" size="sm" />
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-[13px] font-semibold text-ink-2">Subtotal, junto (el IVA, al cobrar)</span>
        <MoneyDisplay value={toMajor(total)} currency="USD" size="lg" />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2.5 text-[13px] text-state-crit">
          {error}
        </p>
      )}
    </Dialog>
  );
}
