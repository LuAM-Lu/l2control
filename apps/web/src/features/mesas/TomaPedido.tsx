"use client";

import { useState } from "react";
import { ArrowLeft, Send, StickyNote, Trash2, TriangleAlert } from "lucide-react";
import type { MenuDto } from "@l2/contracts";
import { multiply, toMajor } from "@l2/domain-money";
import { Badge, Button, Dialog, Input, MoneyDisplay, Stepper, cn, formatMoneyVE } from "@l2/ui";
import { anadir, precioDe, totalBorrador, type LineaBorrador } from "./mesas.ts";

/**
 * Tomar un pedido — F6-03, pasos B4 y B5.
 *
 * LA REGLA QUE ORGANIZA ESTA PANTALLA: el borrador es del mesero; lo enviado,
 * de la cocina (FLUJOS §2, flujo C). Mientras es borrador se cambia, se
 * descarta y se le ponen notas sin pedir permiso a nadie, y la cocina no ve
 * nada. Al confirmarlo con el cliente se envía, y desde ahí cambiarlo exige
 * motivo y autorización. Por eso el envío pasa por una confirmación que
 * repite el pedido entero: es el momento de leérselo a la mesa.
 *
 * Carta a la izquierda, ticket a la derecha: el patrón de cualquier punto de
 * venta. Un toque añade una unidad; el contador del ticket corrige.
 */
export function TomaPedido({
  mesaLabel,
  carta,
  lineas,
  onCambiar,
  onEnviar,
  onVolver,
  bloqueo,
}: {
  mesaLabel: string;
  carta: MenuDto;
  lineas: readonly LineaBorrador[];
  onCambiar: (lineas: LineaBorrador[]) => void;
  onEnviar: () => void;
  onVolver: () => void;
  /** Por qué no se puede enviar ahora, si hay algo que lo impide. */
  bloqueo: string | null;
}) {
  const enVenta = carta.filter((i) => !i.retiredAt);
  const categorias = [...new Set(enVenta.map((i) => i.category))];
  const [categoria, setCategoria] = useState<string>(categorias[0] ?? "");
  const [notaDe, setNotaDe] = useState<number | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [descartar, setDescartar] = useState(false);

  const item = (id: string) => carta.find((i) => i.id === id);
  const total = totalBorrador(lineas, carta);
  const agotados = lineas.filter((l) => !item(l.itemId)?.available);
  const unidades = lineas.reduce((n, l) => n + l.cantidad, 0);
  const impedimento =
    bloqueo ??
    (agotados.length > 0
      ? `Hay platos agotados en el borrador: ${agotados.map((l) => item(l.itemId)?.name ?? "?").join(", ")}`
      : null);

  const cantidadEn = (id: string) => lineas.filter((l) => l.itemId === id).reduce((n, l) => n + l.cantidad, 0);

  const fijarCantidad = (i: number, n: number) =>
    onCambiar(n === 0 ? lineas.filter((_, j) => j !== i) : lineas.map((l, j) => (j === i ? { ...l, cantidad: n } : l)));

  return (
    <>
      {/* ── la carta ── */}
      <section aria-label="Carta" className="flex min-w-0 flex-col gap-3 lg:min-h-0">
        <div role="group" aria-label="Categorías" className="flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === categoria}
              onClick={() => setCategoria(c)}
              className={cn(
                "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-4 text-[14px] whitespace-nowrap",
                "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                c === categoria
                  ? "border-brand bg-brand font-semibold text-on-brand"
                  : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <ul className="grid grid-cols-2 content-start gap-2 sm:grid-cols-3 lg:min-h-0 lg:overflow-y-auto xl:grid-cols-4">
          {enVenta
            .filter((i) => i.category === categoria)
            .map((i) => {
              const n = cantidadEn(i.id);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={!i.available}
                    onClick={() => onCambiar(anadir(lineas, i.id))}
                    aria-label={`Añadir ${i.name}, ${formatMoneyVE(toMajor(precioDe(i)), "USD")}${n > 0 ? `, van ${n}` : ""}`}
                    className={cn(
                      "relative flex min-h-[5.5rem] w-full cursor-pointer flex-col justify-between rounded-[var(--radius-card)] border p-3 text-left",
                      "transition-[border-color,background-color,transform] duration-[var(--dur-rapida)] active:scale-[0.98]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      "disabled:cursor-not-allowed disabled:active:scale-100",
                      !i.available
                        ? "border-dashed border-line bg-base/40 text-ink-3"
                        : n > 0
                          ? "border-brand/60 bg-surface"
                          : "border-line bg-surface hover:border-line-strong",
                    )}
                  >
                    <span className={cn("pr-7 text-[14px] leading-snug font-semibold", i.available ? "text-ink" : "line-through")}>
                      {i.name}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="tnum text-[13px] text-ink-2">{formatMoneyVE(toMajor(precioDe(i)), "USD")}</span>
                      {!i.available && <Badge tone="idle">Agotado</Badge>}
                    </span>
                    {n > 0 && (
                      <span
                        aria-hidden="true"
                        className="tnum absolute top-2 right-2 grid size-7 place-content-center rounded-full bg-brand text-[13px] font-bold text-on-brand"
                      >
                        {n}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        </ul>
      </section>

      {/* ── el ticket del borrador ── */}
      <aside
        aria-label={`Borrador de la mesa ${mesaLabel}`}
        className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface lg:min-h-0"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg leading-tight font-bold text-ink">Mesa {mesaLabel}</h2>
            <p className="text-[12px] text-ink-3">Borrador: la cocina todavía no lo ve</p>
          </div>
          <Badge tone="idle">{unidades === 1 ? "1 plato" : `${unidades} platos`}</Badge>
        </header>

        <div className="flex-1 px-4 py-2 lg:min-h-0 lg:overflow-y-auto">
          {lineas.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-ink-3">
              Toca los platos de la carta para añadirlos.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {lineas.map((l, i) => {
                const it = item(l.itemId);
                return (
                  // Una fila por plato: lo que es y lo que cuesta a la izquierda, el
                  // contador a la derecha. En dos filas, cinco platos ya no cabían.
                  <li key={`${l.itemId}-${i}`} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-[14px] leading-snug font-medium", it?.available ? "text-ink" : "text-state-warn")}>
                        {it?.name ?? "Plato fuera de carta"}
                        {!it?.available && <span className="ml-1.5 text-[12px]">· agotado</span>}
                      </p>
                      <p className="flex items-center gap-2 text-[12.5px]">
                        {it && (
                          <span className="tnum text-ink-2">{formatMoneyVE(toMajor(multiply(precioDe(it), BigInt(l.cantidad))), "USD")}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setNotaDe(i);
                            setNotaTexto(l.nota);
                          }}
                          aria-label={l.nota ? `Nota: ${l.nota}. Cambiarla` : `Añadir nota a ${it?.name ?? "este plato"}`}
                          className={cn(
                            // El objetivo táctil crece hacia fuera sin engordar la fila.
                            "relative -my-2 flex min-h-8 min-w-0 cursor-pointer items-center gap-1 rounded px-1 py-2",
                            "after:absolute after:-inset-y-2 after:inset-x-0 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
                            l.nota ? "text-ink" : "text-ink-3",
                          )}
                        >
                          <StickyNote size={13} aria-hidden="true" className="shrink-0" />
                          <span className="truncate">{l.nota || "Nota"}</span>
                        </button>
                      </p>
                    </div>
                    <Stepper
                      value={l.cantidad}
                      onChange={(n) => fijarCantidad(i, n)}
                      label={it?.name ?? "Plato"}
                      min={0}
                      max={50}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Total del pedido</span>
            <MoneyDisplay value={toMajor(total)} currency="USD" size="lg" />
          </div>
          {impedimento && (
            <p role="alert" className="flex items-start gap-2 text-[12.5px] text-state-warn">
              <TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              {impedimento}
            </p>
          )}
          <Button
            variant="primary"
            disabled={lineas.length === 0 || impedimento !== null}
            onClick={() => setConfirmar(true)}
            className="w-full"
          >
            <Send size={17} aria-hidden="true" />
            Revisar y enviar a cocina
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={onVolver}>
              <ArrowLeft size={16} aria-hidden="true" />
              Mesa
            </Button>
            <Button
              variant="ghost"
              disabled={lineas.length === 0}
              onClick={() => (descartar ? (onCambiar([]), setDescartar(false)) : setDescartar(true))}
              onBlur={() => setDescartar(false)}
              className={descartar ? "text-state-crit" : undefined}
            >
              <Trash2 size={16} aria-hidden="true" />
              {descartar ? "¿Seguro?" : "Descartar"}
            </Button>
          </div>
        </footer>
      </aside>

      {/* ── nota de una línea ── */}
      <Dialog
        abierto={notaDe !== null}
        onCerrar={() => setNotaDe(null)}
        titulo={`Nota · ${notaDe !== null ? (item(lineas[notaDe]?.itemId ?? "")?.name ?? "") : ""}`}
        descripcion="La cocina la lee en la comanda. Corta y concreta."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={() => setNotaDe(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (notaDe !== null) {
                  onCambiar(lineas.map((l, j) => (j === notaDe ? { ...l, nota: notaTexto.trim().slice(0, 80) } : l)));
                }
                setNotaDe(null);
              }}
            >
              Guardar nota
            </Button>
          </div>
        }
      >
        <Input
          label="Nota para cocina"
          surface="tablet"
          maxLength={80}
          value={notaTexto}
          onChange={(e) => setNotaTexto(e.target.value)}
          hint={`${notaTexto.length} de 80 caracteres`}
        />
      </Dialog>

      {/* ── confirmación: se le lee el pedido a la mesa ── */}
      <Dialog
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo={`Enviar a cocina · Mesa ${mesaLabel}`}
        descripcion="Léeselo a la mesa. Una vez enviado, cambiarlo o anularlo exige motivo y autorización."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={() => setConfirmar(false)}>
              Seguir editando
            </Button>
            <Button
              variant="primary"
              disabled={impedimento !== null}
              onClick={() => {
                setConfirmar(false);
                onEnviar();
              }}
            >
              <Send size={16} aria-hidden="true" />
              Enviar
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-2">
          {lineas.map((l, i) => (
            <li key={`${l.itemId}-${i}`} className="flex items-baseline gap-3 text-[14px]">
              <span className="tnum w-8 shrink-0 text-right font-bold text-ink">{l.cantidad}×</span>
              <span className="min-w-0 flex-1">
                <span className="text-ink">{item(l.itemId)?.name}</span>
                {l.nota && <span className="block text-[12.5px] text-ink-2">«{l.nota}»</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[13px] text-ink-2">Total</span>
          <MoneyDisplay value={toMajor(total)} currency="USD" size="md" />
        </p>
      </Dialog>
    </>
  );
}
