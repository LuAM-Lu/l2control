"use client";

import { useState } from "react";
import { Baby, HandCoins } from "lucide-react";
import { TIEMPO_ABIERTO_ID, type FamilyAccountDto, type Rechazo } from "@l2/contracts";
import { paqueteQueCubre, paquetesParaPagarAntes } from "@l2/domain-park";
import { money, toMajor } from "@l2/domain-money";
import { chargeableLines } from "@l2/domain-cash";
import { Button, Dialog, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";
import { pagarParqueAhora } from "./parque.acciones.ts";
import { useAhoraDeLaSala, useSala } from "./SalaProvider.tsx";
import { nombreDeEstancia } from "./view-model.ts";

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la cuenta sigue como estaba." };
const usd = (minor: string) => formatMoneyVE(toMajor(money(BigInt(minor), "USD")), "USD");

/**
 * ¿Hay algo que pagar antes de salir? (B4-19): la cuenta abierta de una familia con un niño de tiempo abierto en la sala, o
 * con algo pendiente (un paquete fijo en cuenta abierta). Lo ya pagado no se ofrece otra vez.
 */
export function hayQuePagarAntes(c: FamilyAccountDto, sesiones: readonly Readonly<{ accountId: string; packageId: string }>[]): boolean {
  if (c.kind !== "FAMILIA" || c.status !== "ABIERTA") return false;
  return sesiones.some((s) => s.accountId === c.id && s.packageId === TIEMPO_ABIERTO_ID) || chargeableLines(c).length > 0;
}

/**
 * Pagar el parque antes de salir — B4-19 (M-39, X-4), en la caja y en la sala.
 *
 * Los niños de la familia en la sala (los vinculados a una mesa se pagan con ella): el de tiempo abierto elige su
 * paquete, desde que entró (se sugiere el que cubre lo que lleva); el de paquete fijo ya lo tiene en la cuenta. La cuenta
 * pasa a la cola de la caja y se cobra con lo demás. Queda prepagado: al salir dentro de su tiempo no pasa por la caja.
 */
export function PagarAhoraDialog({
  cuenta,
  desde,
  onCerrar,
  onHecho,
}: {
  /** La cuenta de la familia; `null`, cerrado. */
  cuenta: FamilyAccountDto | null;
  /** «CAJA» la cobra a continuación; «SALA» la manda a la cola de la caja. */
  desde: "CAJA" | "SALA";
  onCerrar: () => void;
  onHecho?: (c: FamilyAccountDto) => void;
}) {
  const { sala } = useSala();
  const { cuentas, adoptar } = useCuentas();
  const ahora = useAhoraDeLaSala(15_000);
  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);

  // Cada cuenta abre el diálogo con lo sugerido. Derivado en el render, sin efecto.
  if ((cuenta?.id ?? null) !== para) {
    setPara(cuenta?.id ?? null);
    setElegidos({});
  }

  const enMesas = new Set(cuentas.filter((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR")).flatMap((c) => c.sessionIds));
  const ninos = (sala?.sessions ?? []).filter((s) => s.accountId === cuenta?.id && !enMesas.has(s.id));
  const elegidoDe = (s: (typeof ninos)[number]) => {
    const fijos = paquetesParaPagarAntes(s.porUso);
    const sugerido = paqueteQueCubre(s.porUso, Math.max(0, ahora - Date.parse(s.startedAt)), s.terms.graceMinutes);
    return fijos.find((p) => p.name === elegidos[s.id]) ?? sugerido;
  };
  const abiertos = ninos.filter((s) => s.packageId === TIEMPO_ABIERTO_ID);
  const sinPaquete = abiertos.some((s) => !elegidoDe(s));

  async function pagar() {
    if (!cuenta) return;
    setEnviando(true);
    const r = await pagarParqueAhora({
      idempotencyKey: crypto.randomUUID(),
      accountId: cuenta.id,
      version: cuenta.version,
      paquetes: abiertos.map((s) => ({ sessionId: s.id, paquete: elegidoDe(s)!.name })),
    }).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    adoptar(r.valor);
    if (desde === "SALA") {
      avisar.ok(`${nombreDeCuenta(r.valor)} pasó a la cola de la caja`, { detalle: "Paga ahí. Al salir dentro de su tiempo, se va sin pasar por la caja." });
    }
    onHecho?.(r.valor);
    onCerrar();
  }

  return (
    <Dialog
      abierto={cuenta !== null}
      onCerrar={onCerrar}
      titulo={`Pagar ahora · ${cuenta ? nombreDeCuenta(cuenta) : ""}`}
      descripcion="Se paga ya el tiempo de sus niños, con lo demás de la cuenta. Al salir dentro de su tiempo se van sin pasar por la caja; si se pasan, el tiempo de más va a la caja."
      pie={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void pagar()} disabled={ninos.length === 0 || sinPaquete || enviando}>
            <HandCoins size={16} aria-hidden="true" />
            {desde === "CAJA" ? "Pagar ahora" : "Mandar a la caja"}
          </Button>
        </div>
      }
    >
      {ninos.length === 0 ? (
        <p className="text-detalle text-ink-2">Esta familia no tiene niños en la sala fuera de una mesa.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ninos.map((s) => {
            const lleva = Math.max(0, Math.floor((ahora - Date.parse(s.startedAt)) / 60_000));
            const abierto = s.packageId === TIEMPO_ABIERTO_ID;
            const elegido = abierto ? elegidoDe(s) : null;
            return (
              <li key={s.id} className="rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2">
                <p className="flex items-center gap-2 text-cuerpo font-semibold text-ink">
                  <Baby size={15} aria-hidden="true" className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate">{nombreDeEstancia(s)}</span>
                  <span className="tnum text-detalle font-normal text-ink-3">lleva {lleva} min</span>
                </p>
                {abierto ? (
                  <div role="radiogroup" aria-label={`Paquete de ${nombreDeEstancia(s)}`} className="mt-2 flex flex-wrap gap-1.5">
                    {paquetesParaPagarAntes(s.porUso).map((p) => {
                      const activo = elegido?.name === p.name;
                      return (
                        <button
                          key={p.name}
                          type="button"
                          role="radio"
                          aria-checked={activo}
                          onClick={() => setElegidos((e) => ({ ...e, [s.id]: p.name }))}
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-left text-detalle",
                            "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                            activo ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                          )}
                        >
                          <span className="font-semibold">{p.name}</span>
                          <span className="tnum">{usd(p.price.minor)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-1 text-detalle text-ink-3">
                    {s.packageName} · {usd(s.packagePrice.minor)} · {s.pagadaAntes ? "ya pagado" : "en la cuenta"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
