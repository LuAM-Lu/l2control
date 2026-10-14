"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, CircleCheckBig, Trash2 } from "lucide-react";
import type { DescuentoDeQuincenaDto, Rechazo, ValeDto } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { Button, Dialog, avisar, cn, formatMoneyVE } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { periodoEnPalabras } from "../reportes/informe.tsx";
import { ordenDelVale } from "../reportes/personal.tsx";
import { anularValeDelPersonal, descontarQuincena } from "./personal.acciones";

/**
 * Lo que la administración hace con lo que debe el personal — B3-26 (M-39, X-6).
 *
 * El personal paga fuera del sistema, en su quincena: «Descontado en la quincena» lo marca por persona y periodo y deja
 * de estar pendiente (no toca la gaveta). «Anular vale», de cualquier día (no movió dinero): cada cosa al estante o a
 * merma. Las dos con el PIN de administración, y quedan en la auditoría.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se hizo nada." };
const usd = (minor: string) => formatMoneyVE(toMajor(money(BigInt(minor), "USD")), "USD");

/** «Descontado en la quincena» de una persona: lo que consumió y lo adelantado de ese periodo, con el PIN de administración. */
export function DescontarDialog({
  para,
  onCerrar,
}: {
  para: Readonly<{
    persona: { id: string; nombre: string };
    neto: { minor: string };
    adelantado: { minor: string };
    descontado: Readonly<{ despues: { minor: string } }> | null;
    periodo: { desde: string; hasta: string };
  }> | null;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const a = useAutorizacion("cobro.anular", para !== null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function marcar() {
    if (!para || enviando) return;
    const falta = a.falta();
    if (falta) return setErrores(falta);
    setErrores({});
    setEnviando(true);
    const r = await descontarQuincena(
      { idempotencyKey: crypto.randomUUID(), persona: para.persona.id, ...para.periodo },
      a.autorizacion(`Descontado en la quincena de ${para.persona.nombre}`),
    ).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) return setErrores(erroresDeRechazo(r.mensaje));
    const d: DescuentoDeQuincenaDto = r.valor;
    avisar.ok(`${para.persona.nombre}: descontado en la quincena`, { detalle: `Consumió ${usd(d.consumido.minor)} · adelantos ${usd(d.adelantado.minor)}. Deja de estar pendiente.` });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog
      abierto={para !== null}
      onCerrar={onCerrar}
      titulo={`Descontado en la quincena · ${para?.persona.nombre ?? ""}`}
      descripcion={para ? `${periodoEnPalabras(para.periodo)}. Se descontó de su sueldo, fuera del sistema: no toca la gaveta.` : ""}
      pie={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void marcar()} disabled={enviando || a.permiso === "DENEGADO"}>
            <CircleCheckBig size={16} aria-hidden="true" />
            Marcar descontado
          </Button>
        </div>
      }
    >
      {para && (
        <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-cuerpo text-ink">
          {para.descontado ? (
            <span>
              Lo de después de la marca anterior <span className="tnum font-semibold">{usd(para.descontado.despues.minor)}</span>
            </span>
          ) : (
            <>
              <span>
                Consumió <span className="tnum font-semibold">{usd(para.neto.minor)}</span>
              </span>
              <span>
                Adelantos <span className="tnum font-semibold">{usd(para.adelantado.minor)}</span>
              </span>
            </>
          )}
        </p>
      )}
      <CampoAutorizacion a={a} denegado="Lo marca administración." errores={errores} deshabilitado={enviando} onConfirmar={() => void marcar()} />
      {errores.general && <p className="mt-2 text-detalle text-state-crit">{errores.general}</p>}
    </Dialog>
  );
}

/** «Anular vale», de cualquier día: cada cosa vuelve al estante o sale como merma. */
export function AnularValeDialog({ vale, onCerrar }: { vale: ValeDto | null; onCerrar: () => void }) {
  const router = useRouter();
  const a = useAutorizacion("cobro.anular", vale !== null);
  const [merma, setMerma] = useState<ReadonlySet<number>>(new Set());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  if ((vale?.id ?? null) !== para) {
    setPara(vale?.id ?? null);
    setMerma(new Set());
    setErrores({});
  }

  async function anular() {
    if (!vale || enviando) return;
    const falta = a.falta();
    if (falta) return setErrores(falta);
    setErrores({});
    setEnviando(true);
    const r = await anularValeDelPersonal(
      { idempotencyKey: crypto.randomUUID(), valeId: vale.id, aMerma: [...merma] },
      a.autorizacion(`Anular el vale ${ordenDelVale(vale.orderNumber)} de ${vale.persona.nombre}`),
    ).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) return setErrores(erroresDeRechazo(r.mensaje));
    avisar.ok(`Vale ${ordenDelVale(vale.orderNumber)} anulado`, {
      detalle: merma.size === 0 ? "Todo volvió al estante." : merma.size === vale.lineas.length ? "Todo salió como merma." : `${merma.size} a merma; lo demás, al estante.`,
    });
    router.refresh();
    onCerrar();
  }

  return (
    <Dialog
      abierto={vale !== null}
      onCerrar={onCerrar}
      titulo={`Anular vale ${vale ? ordenDelVale(vale.orderNumber) : ""} · ${vale?.persona.nombre ?? ""}`}
      descripcion="No se lo descuenta. Elige qué vuelve al estante y qué sale como merma (lo que ya se consumió o se dañó)."
      pie={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void anular()} disabled={enviando || a.permiso === "DENEGADO"}>
            Anular vale
          </Button>
        </div>
      }
    >
      <ul className="mb-3 flex flex-col gap-1.5">
        {vale?.lineas.map((l, i) => {
          const aMerma = merma.has(i);
          return (
            <li key={i} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-1.5">
              <span className="min-w-0 truncate text-cuerpo text-ink">
                {l.concepto} <span className="tnum text-detalle text-ink-3">{usd(l.monto.minor)}</span>
              </span>
              <span role="radiogroup" aria-label={`Destino de ${l.concepto}`} className="flex shrink-0 gap-1">
                {([false, true] as const).map((m) => (
                  <button
                    key={String(m)}
                    type="button"
                    role="radio"
                    aria-checked={aMerma === m}
                    onClick={() =>
                      setMerma((s) => {
                        const n = new Set(s);
                        if (m) n.add(i);
                        else n.delete(i);
                        return n;
                      })
                    }
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] border px-2.5 text-detalle",
                      aMerma === m ? "border-brand bg-brand/15 font-semibold text-ink" : "border-line text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {m ? <Trash2 size={13} aria-hidden="true" /> : <Archive size={13} aria-hidden="true" />}
                    {m ? "Merma" : "Estante"}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <CampoAutorizacion a={a} denegado="Lo anula administración." errores={errores} deshabilitado={enviando} onConfirmar={() => void anular()} />
      {errores.general && <p className="mt-2 text-detalle text-state-crit">{errores.general}</p>}
    </Dialog>
  );
}
