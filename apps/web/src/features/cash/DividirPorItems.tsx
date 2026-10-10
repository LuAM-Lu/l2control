"use client";

import { useState } from "react";
import { Minus, Plus, Scissors, Undo2, Users } from "lucide-react";
import type { FamilyAccountDto } from "@l2/contracts";
import { chargeableLines } from "@l2/domain-cash";
import { money, sum, toMajor, type Money } from "@l2/domain-money";
import { Button, Dialog, MoneyDisplay, avisar, cn } from "@l2/ui";
import { nombreDeCuenta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import { dividirPorItems, partirLinea, unirDivision } from "./dividir.acciones.ts";

const MAX_PERSONAS = 12;
const aDinero = (l: FamilyAccountDto["lines"][number]): Money => money(BigInt(l.amount.minor), "USD");

/**
 * Dividir por ítems — B3-20 (M-37, U-13).
 *
 * En la caja, rápido y sin protocolo: «Persona 1, 2, +»; se elige la persona y un toque en cada ítem lo pasa a ella.
 * «Partir» reparte un ítem compartido en partes iguales entre las personas que se marquen. «Separar y cobrar» deja lo
 * de cada persona en su cuenta y abre la elegida: cada una se cobra con el cobro de siempre. Lo que no se toca es de la
 * persona 1, que es esta cuenta. Si ya está dividida, dice sus personas y ofrece «Unir de nuevo» (lo cobrado no vuelve).
 */
export function DividirPorItems({
  cuentaId,
  cuentas,
  adoptar,
  onCerrar,
  onCobrar,
}: {
  /** La cuenta que se divide; `null`, el diálogo está cerrado. */
  cuentaId: string | null;
  cuentas: readonly FamilyAccountDto[];
  adoptar: (c: FamilyAccountDto) => void;
  onCerrar: () => void;
  /** Abre esta cuenta para cobrarla. */
  onCobrar: (id: string) => void;
}) {
  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? null;
  const [personas, setPersonas] = useState(2);
  const [elegida, setElegida] = useState(2);
  /** De qué persona es cada ítem; lo que no está, de la 1. */
  const [deQuien, setDeQuien] = useState<ReadonlyMap<string, number>>(new Map());
  /** El ítem que se está partiendo y entre quiénes. */
  const [partiendo, setPartiendo] = useState<{ lineId: string; entre: number[] } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eraDe, setEraDe] = useState<string | null>(null);

  // Cada cuenta empieza de cero.
  if (cuentaId !== eraDe) {
    setEraDe(cuentaId);
    setPersonas(2);
    setElegida(2);
    setDeQuien(new Map());
    setPartiendo(null);
  }

  if (!cuenta) return <Dialog abierto={false} onCerrar={onCerrar} titulo="Dividir por ítems">{null}</Dialog>;

  const yaDivididas = cuentas.filter((c) => c.divididaDe?.cuentaId === cuenta.id && c.status === "POR_COBRAR");
  const items = chargeableLines(cuenta);
  const persona = (lineId: string) => deQuien.get(lineId) ?? 1;
  const totalDe = (k: number) => sum(items.filter((l) => persona(l.id) === k).map(aDinero), "USD");
  const conAlgo = Array.from({ length: personas }, (_, i) => i + 1).filter((k) => items.some((l) => persona(l.id) === k));

  function asignar(lineId: string) {
    setDeQuien((m) => new Map(m).set(lineId, elegida));
  }

  async function partir() {
    if (!partiendo || !cuenta) return;
    setEnviando(true);
    const r = await partirLinea({
      idempotencyKey: globalThis.crypto.randomUUID(),
      accountId: cuenta.id,
      version: cuenta.version,
      lineId: partiendo.lineId,
      partes: partiendo.entre.length,
    }).catch(() => null);
    setEnviando(false);
    if (!r) return avisar.error("Sin conexión con el servidor: no se partió. Vuelve a intentarlo.");
    if (!r.ok) return avisar.error(r.mensaje);
    adoptar(r.valor.cuenta);
    // Cada parte, a una de las personas elegidas, en orden.
    const partes = r.valor.cuenta.lines.filter((l) => l.parteDe?.lineId === partiendo.lineId).sort((a, b) => a.parteDe!.parte - b.parteDe!.parte);
    setDeQuien((m) => {
      const n = new Map(m);
      partes.forEach((l, i) => n.set(l.id, partiendo.entre[i] ?? 1));
      return n;
    });
    setPartiendo(null);
  }

  async function separarYCobrar(k: number) {
    if (!cuenta) return;
    // Las personas de la 2 en adelante con algo, renumeradas en orden: la cuenta es la persona 1.
    const otras = conAlgo.filter((x) => x !== 1);
    if (otras.length === 0) return onCobrar(cuenta.id);
    setEnviando(true);
    const r = await dividirPorItems({
      idempotencyKey: globalThis.crypto.randomUUID(),
      accountId: cuenta.id,
      version: cuenta.version,
      personas: otras.map((x) => ({ lineIds: items.filter((l) => persona(l.id) === x).map((l) => l.id) })),
    }).catch(() => null);
    setEnviando(false);
    if (!r) return avisar.error("Sin conexión con el servidor: no se dividió. Vuelve a intentarlo.");
    if (!r.ok) return avisar.error(r.mensaje);
    adoptar(r.valor.cuenta);
    for (const p of r.valor.personas) adoptar(p);
    avisar.ok(`Dividida entre ${r.valor.personas.length + 1}`, { detalle: "Cada persona tiene su cuenta en la cola: se cobra con el cobro de siempre." });
    const i = otras.indexOf(k);
    onCobrar(k === 1 || i < 0 ? r.valor.cuenta.id : r.valor.personas[i]!.id);
  }

  async function unir() {
    if (!cuenta) return;
    setEnviando(true);
    const r = await unirDivision({ idempotencyKey: globalThis.crypto.randomUUID(), accountId: cuenta.id }).catch(() => null);
    setEnviando(false);
    if (!r) return avisar.error("Sin conexión con el servidor: no se unió. Vuelve a intentarlo.");
    if (!r.ok) return avisar.error(r.mensaje);
    adoptar(r.valor.cuenta);
    for (const p of r.valor.personas) adoptar(p);
    avisar.ok("Unida de nuevo", { detalle: "Lo que no se cobró volvió a la cuenta." });
    onCobrar(r.valor.cuenta.id);
  }

  const etiquetaPersona = (k: number) => (
    <span className="flex flex-col items-start leading-tight">
      <span className="text-[13px] font-semibold">Persona {k}</span>
      <MoneyDisplay value={toMajor(totalDe(k))} currency="USD" size="sm" />
    </span>
  );

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={`Dividir por ítems · ${numeroDeOrden(cuenta)}`}
      descripcion="Elige la persona y toca sus ítems. Lo que no toques es de la persona 1. Cada una se cobra aparte, con su recibo; el IVA, al cobrar."
      className="w-[min(46rem,calc(100vw-2rem))]"
      pie={
        yaDivididas.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button surface="pos" variant="neutral" onClick={onCerrar} disabled={enviando}>
              Cerrar
            </Button>
            <Button surface="pos" variant="primary" onClick={() => void unir()} disabled={enviando}>
              <Undo2 size={17} aria-hidden="true" />
              Unir de nuevo
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button surface="pos" variant="neutral" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button surface="pos" variant="primary" onClick={() => void separarYCobrar(elegida)} disabled={enviando || conAlgo.length < 2 || partiendo !== null}>
              <Users size={17} aria-hidden="true" />
              {enviando ? "Separando…" : `Separar y cobrar · Persona ${elegida}`}
            </Button>
          </div>
        )
      }
    >
      {yaDivididas.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">Ya está dividida. Lo de cada persona espera en la cola:</p>
          <ul className="flex flex-col gap-1.5">
            <li className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3">
              <span className="text-[14px] font-semibold text-ink">Persona 1 · {numeroDeOrden(cuenta)}</span>
              <MoneyDisplay value={toMajor(pendiente(cuenta))} currency="USD" size="sm" />
              <Button surface="pos" variant="neutral" onClick={() => onCobrar(cuenta.id)} disabled={items.length === 0}>
                Cobrar
              </Button>
            </li>
            {yaDivididas
              .slice()
              .sort((a, b) => (a.divididaDe?.persona ?? 0) - (b.divididaDe?.persona ?? 0))
              .map((p) => (
                <li key={p.id} className="flex min-h-14 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-3">
                  <span className="text-[14px] font-semibold text-ink">
                    Persona {p.divididaDe?.persona} · {numeroDeOrden(p)}
                  </span>
                  <MoneyDisplay value={toMajor(pendiente(p))} currency="USD" size="sm" />
                  <Button surface="pos" variant="neutral" onClick={() => onCobrar(p.id)}>
                    Cobrar
                  </Button>
                </li>
              ))}
          </ul>
          <p className="text-[12.5px] text-ink-3">«Unir de nuevo» devuelve a {nombreDeCuenta(cuenta)} lo que las personas no han cobrado; lo cobrado se queda.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Persona" className="flex flex-wrap items-stretch gap-1.5">
            {Array.from({ length: personas }, (_, i) => i + 1).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={elegida === k}
                onClick={() => setElegida(k)}
                className={cn(
                  "min-h-14 min-w-24 cursor-pointer rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                  elegida === k ? "border-brand bg-brand/15 text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                {etiquetaPersona(k)}
              </button>
            ))}
            <Button
              surface="pos"
              variant="neutral"
              aria-label="Otra persona"
              disabled={personas >= MAX_PERSONAS}
              onClick={() => {
                setPersonas(personas + 1);
                setElegida(personas + 1);
              }}
            >
              <Plus size={17} aria-hidden="true" />
            </Button>
            {personas > 2 && !items.some((l) => persona(l.id) === personas) && (
              <Button
                surface="pos"
                variant="ghost"
                aria-label={`Quitar la persona ${personas}`}
                onClick={() => {
                  setPersonas(personas - 1);
                  if (elegida === personas) setElegida(personas - 1);
                }}
              >
                <Minus size={17} aria-hidden="true" />
              </Button>
            )}
          </div>

          <ul className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto">
            {items.map((l) => {
              const k = persona(l.id);
              const abierto = partiendo?.lineId === l.id;
              return (
                <li key={l.id} className={cn("rounded-[var(--radius-control)] border", k === elegida ? "border-brand/60 bg-brand/10" : "border-line bg-base/40")}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => asignar(l.id)}
                      className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 text-left"
                      aria-label={`${l.concept}: pasarlo a la persona ${elegida}`}
                    >
                      <span className="tnum grid size-8 shrink-0 place-content-center rounded-full border border-line-strong text-[12px] font-bold text-ink">P{k}</span>
                      <span className="min-w-0 flex-1 text-[14px] text-ink">{l.concept}</span>
                      <MoneyDisplay value={toMajor(aDinero(l))} currency="USD" size="sm" />
                    </button>
                    {!l.parteDe && (
                      <Button
                        surface="pos"
                        variant="ghost"
                        className="mr-1 shrink-0 text-[13px]"
                        aria-expanded={abierto}
                        onClick={() => setPartiendo(abierto ? null : { lineId: l.id, entre: Array.from({ length: personas }, (_, i) => i + 1) })}
                      >
                        <Scissors size={15} aria-hidden="true" />
                        Partir
                      </Button>
                    )}
                  </div>
                  {abierto && partiendo && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
                      <span className="text-[12.5px] text-ink-2">Entre:</span>
                      {Array.from({ length: personas }, (_, i) => i + 1).map((x) => {
                        const marcada = partiendo.entre.includes(x);
                        return (
                          <button
                            key={x}
                            type="button"
                            aria-pressed={marcada}
                            onClick={() =>
                              setPartiendo({ lineId: l.id, entre: marcada ? partiendo.entre.filter((y) => y !== x) : [...partiendo.entre, x].sort((a, b) => a - b) })
                            }
                            className={cn(
                              "min-h-12 min-w-12 cursor-pointer rounded-[var(--radius-control)] border px-2 text-[13px] font-semibold",
                              marcada ? "border-brand bg-brand/15 text-ink" : "border-line text-ink-3",
                            )}
                          >
                            P{x}
                          </button>
                        );
                      })}
                      <Button surface="pos" variant="primary" className="ml-auto" disabled={partiendo.entre.length < 2 || enviando} onClick={() => void partir()}>
                        Partir entre {partiendo.entre.length}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Dialog>
  );
}
