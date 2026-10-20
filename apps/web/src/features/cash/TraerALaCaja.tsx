"use client";

import { Clock, HandCoins, Receipt } from "lucide-react";
import { toMajor } from "@l2/domain-money";
import { Button, Dialog, formatMoneyVE } from "@l2/ui";
import { nombreDeCuenta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import type { AbiertaEnElSalon } from "../mesas/mesas.ts";
import { transcurrido } from "../mesas/tiempo.ts";
import { useReloj } from "../sucursal/SucursalProvider.tsx";

/**
 * Una cuenta del salón que no ha pedido la cuenta, vista desde la caja — B3-27 (M-40).
 *
 * El ticket n.º 3: dos cuentas de pie que nunca pidieron la cuenta no se podían cobrar en la caja y se dieron por
 * incobrables. Ahora la caja las ve en «Abiertas en el salón», con quién las abrió y cuánto llevan; aquí dice lo que se
 * sabe de una y la trae a la cola como si hubiera pedido la cuenta («Pide la cuenta»), para cobrarla sin pasar por el
 * mesero. Si piden algo más, el pedido la devuelve a la mesa (B6-18).
 *
 * B3-28: o «Cobrar lo que va»: paga lo consumido hasta ahora (también lo que falta servir) y la mesa sigue abierta.
 */
export function TraerALaCaja({
  abierta,
  ahora,
  trayendo,
  onTraer,
  onLoQueVa,
  onCerrar,
}: {
  /** «Cobrar lo que va» (B3-28): a la cola sin cerrar la mesa. */
  onLoQueVa: () => void;
  /** La cuenta, o `null` (cerrado). */
  abierta: AbiertaEnElSalon | null;
  ahora: number;
  trayendo: boolean;
  onTraer: () => void;
  onCerrar: () => void;
}) {
  const reloj = useReloj();
  const c = abierta?.cuenta ?? null;
  const abiertaEn = c ? Date.parse(c.openedAt) : 0;
  const ultimo = abierta ? Date.parse(abierta.ultimo) : 0;
  /** «a las 2:31 pm · hace 52 min», o «desde ayer 7:29 pm» si es de otro día. */
  const cuando = (iso: string) => {
    const t = transcurrido(iso, ahora, reloj);
    return t.startsWith("desde ") ? t : `a las ${reloj.hora(Date.parse(iso))} · hace ${t}`;
  };
  return (
    <Dialog
      abierto={c !== null}
      onCerrar={onCerrar}
      titulo={c ? `${nombreDeCuenta(c)} no ha pedido la cuenta` : ""}
      descripcion="Si ya se van, tráela: pasa a la cola como si hubiera pedido la cuenta y se cobra aquí. Si quieren pagar y seguir, «Cobrar lo que va»: la mesa sigue abierta."
      pie={
        // Las dos salidas, a lo ancho: cerrar la cuenta o pagar y seguir. Volver es la «×» (o Esc).
        <div className="flex flex-col gap-2">
          <Button surface="pos" variant="primary" onClick={onTraer} disabled={trayendo} className="w-full">
            <Receipt className="size-(--icono-texto)" aria-hidden="true" />
            {trayendo ? "Pasando a la caja…" : "Traer a la caja y cobrar"}
          </Button>
          <Button surface="pos" variant="neutral" onClick={onLoQueVa} disabled={trayendo} className="w-full">
            <HandCoins className="size-(--icono-texto)" aria-hidden="true" />
            Cobrar lo que va: la mesa sigue abierta
          </Button>
        </div>
      }
    >
      {c && abierta && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5 text-detalle">
          <dt className="text-ink-3">Cuenta</dt>
          <dd className="tnum text-ink">{numeroDeOrden(c)}</dd>
          <dt className="text-ink-3">Abierta</dt>
          <dd className="tnum text-ink">
            {c.abiertaPor ? `por ${c.abiertaPor} · ` : ""}
            {cuando(c.openedAt)}
          </dd>
          {ultimo > abiertaEn && (
            <>
              <dt className="text-ink-3">Último pedido</dt>
              <dd className="tnum text-ink">{cuando(abierta.ultimo)}</dd>
            </>
          )}
          <dt className="text-ink-3">Debe</dt>
          <dd className="tnum font-semibold text-ink">{formatMoneyVE(toMajor(pendiente(c)), "USD")}</dd>
          {abierta.llevaRato && (
            <dd className="col-span-2 mt-1 flex items-center gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg px-2 py-1 font-semibold text-state-warn">
              <Clock className="size-(--icono-texto) shrink-0" aria-hidden="true" />
              Lleva rato sin pedir la cuenta
            </dd>
          )}
        </dl>
      )}
    </Dialog>
  );
}
