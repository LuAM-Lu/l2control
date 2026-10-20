"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronUp, Search, Send, StickyNote, Trash2, TrendingUp, TriangleAlert, X } from "lucide-react";
import type { MasPedidosDto } from "@l2/contracts";
import { multiply, toMajor } from "@l2/domain-money";
import { Badge, Button, Cajon, Dialog, Input, MoneyDisplay, Stepper, cn, formatMoneyVE } from "@l2/ui";
import { anadir, totalBorrador, type LineaBorrador } from "./mesas.ts";
import { disponible, type ProductoALaVenta } from "../inventario/catalogo.ts";
import { conNotaRapida } from "@l2/domain-orders";
import { notasRapidas } from "./pedidos.acciones";

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
 *
 * La carta es el catálogo con lo marcado «en la carta» (B6-1), con el precio de hoy. Lo que se cuenta
 * dice cuántos quedan, y sin existencia no se pide (ADR-023): el servidor lo vuelve a comprobar.
 *
 * B6-17 (M-38, W-5), el mesero en tablet: un buscador que recorre toda la carta, las categorías en una tira que se
 * desliza (antes, tres renglones), lo que no se vende al final, y en vertical el ticket como cajón: una barra fija
 * abajo dice cuántos platos y cuánto, abre el ticket y envía.
 */
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** La pestaña de «Lo más pedido» (B6-23): no es una categoría de la carta. */
export const MAS_PEDIDOS = "__lo-mas-pedido__";

export function TomaPedido({
  rotulo,
  carta,
  lineas,
  onCambiar,
  onEnviar,
  enviando = false,
  onVolver,
  bloqueo,
  vertical = false,
  masPedidos = null,
}: {
  /** B6-23: «Lo más pedido hoy» (o de la semana, temprano): la primera pestaña de la carta. */
  masPedidos?: MasPedidosDto | null;
  /** A quién va: «Mesa 3», «Mesa 3 · Familia Pérez» o «De pie · Sr. Luis» (B6-7). */
  rotulo: string;
  carta: readonly ProductoALaVenta[];
  lineas: readonly LineaBorrador[];
  onCambiar: (lineas: LineaBorrador[]) => void;
  onEnviar: () => void;
  /** Mientras el servidor responde: no se envía dos veces. */
  enviando?: boolean;
  onVolver: () => void;
  /** Por qué no se puede enviar ahora, si hay algo que lo impide. */
  bloqueo: string | null;
  /** La tablet en vertical (B6-17): el ticket es un cajón con su barra fija abajo. */
  vertical?: boolean;
}) {
  const enVenta = carta;
  // B6-23: lo más pedido, en su orden, de lo que hoy se vende. Si hay, es la primera pestaña y la que se abre.
  const destacados = (masPedidos?.productos ?? []).flatMap((id) => enVenta.find((i) => i.id === id) ?? []);
  const categorias = [...(destacados.length > 0 ? [MAS_PEDIDOS] : []), ...new Set(enVenta.map((i) => i.categoria))];
  const [elegidaAMano, setCategoria] = useState<string | null>(null);
  // Hasta que se toque una, la primera: lo más pedido, si llegó; si no, la primera de la carta.
  const categoria = elegidaAMano ?? categorias[0] ?? "";
  // B6-17: lo escrito busca en toda la carta, sin mirar la categoría.
  const [buscado, setBuscado] = useState("");
  const [notaDe, setNotaDe] = useState<number | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  // B6-12: las notas más escritas para el plato (y su categoría), al abrir su nota. `null` mientras llegan.
  const [frecuentes, setFrecuentes] = useState<{ notas: readonly string[]; error: boolean } | null>(null);
  const productoDeLaNota = notaDe !== null ? (lineas[notaDe]?.itemId ?? null) : null;
  useEffect(() => {
    if (!productoDeLaNota) return;
    let vivo = true;
    setFrecuentes(null);
    notasRapidas(productoDeLaNota)
      .then((r) => vivo && setFrecuentes(r.ok ? { notas: r.valor.notas, error: false } : { notas: [], error: true }))
      .catch(() => vivo && setFrecuentes({ notas: [], error: true }));
    return () => {
      vivo = false;
    };
  }, [productoDeLaNota]);
  const [confirmar, setConfirmar] = useState(false);
  const [descartar, setDescartar] = useState(false);
  /** En vertical: el ticket abierto en su cajón. */
  const [verTicket, setVerTicket] = useState(false);
  // La barra fija va al `body` (MAESTRO §5): dentro de la región del panel, `fixed` no se sostiene.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const item = (id: string) => carta.find((i) => i.id === id);
  const total = totalBorrador(lineas, carta);
  const cantidadEn = (id: string) => lineas.filter((l) => l.itemId === id).reduce((n, l) => n + l.cantidad, 0);
  /** Cuántas más se pueden pedir de un plato: sin límite si no lleva existencia. */
  const quedanDe = (i: ProductoALaVenta) => (i.existencia === null ? Number.POSITIVE_INFINITY : i.existencia - cantidadEn(i.id));
  // Lo que ya no está en la carta, o se pide más de lo que queda, no se envía.
  const agotados = lineas.filter((l) => {
    const it = item(l.itemId);
    return !it || quedanDe(it) < 0;
  });
  const unidades = lineas.reduce((n, l) => n + l.cantidad, 0);
  const impedimento =
    bloqueo ??
    (agotados.length > 0
      ? `No queda lo suficiente o ya no está en la carta: ${agotados.map((l) => item(l.itemId)?.nombre ?? "un plato").join(", ")}`
      : null);
  const puedeEnviar = lineas.length > 0 && impedimento === null && !enviando;

  const fijarCantidad = (i: number, n: number) =>
    onCambiar(n === 0 ? lineas.filter((_, j) => j !== i) : lineas.map((l, j) => (j === i ? { ...l, cantidad: n } : l)));

  // Lo que se ve: lo buscado en toda la carta, o la categoría; lo que se vende primero y lo agotado al final.
  const q = sinAcentos(buscado.trim());
  const visibles = useMemo(() => {
    const base = q ? enVenta.filter((i) => sinAcentos(i.nombre).includes(q)) : categoria === MAS_PEDIDOS ? destacados : enVenta.filter((i) => i.categoria === categoria);
    const hay = (i: ProductoALaVenta) => disponible(i) && quedanDe(i) > 0;
    return [...base.filter(hay), ...base.filter((i) => !hay(i))];
    // `quedanDe` depende de las líneas: se recalcula con ellas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enVenta, categoria, q, lineas, masPedidos]);

  const lista = (
    <>
      {lineas.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-3">Toca los platos de la carta para añadirlos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {lineas.map((l, i) => {
            const it = item(l.itemId);
            return (
              // Una fila por plato: lo que es y lo que cuesta a la izquierda, el
              // contador a la derecha. En dos filas, cinco platos ya no cabían.
              <li key={`${l.itemId}-${i}`} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[14px] leading-snug font-medium", it && quedanDe(it) >= 0 ? "text-ink" : "text-state-warn")}>
                    {it?.nombre ?? "Plato fuera de carta"}
                    {it && quedanDe(it) < 0 && (
                      <span className="ml-1.5 text-[12px]">· {it.sinInventarioInicial ? "sin contar" : it.existencia === 0 ? "agotado" : `quedan ${it.existencia}`}</span>
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-[12.5px]">
                    {it && <span className="tnum text-ink-2">{formatMoneyVE(toMajor(multiply(it.precio, BigInt(l.cantidad))), "USD")}</span>}
                    <button
                      type="button"
                      onClick={() => {
                        setNotaDe(i);
                        setNotaTexto(l.nota);
                      }}
                      aria-label={l.nota ? `Nota: ${l.nota}. Cambiarla` : `Añadir nota a ${it?.nombre ?? "este plato"}`}
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
                <Stepper value={l.cantidad} onChange={(n) => fijarCantidad(i, n)} label={it?.nombre ?? "Plato"} min={0} max={50} />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const pieDelTicket = (
    <div className="flex flex-col gap-2">
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
        disabled={!puedeEnviar}
        onClick={() => {
          setVerTicket(false);
          setConfirmar(true);
        }}
        className="w-full"
      >
        <Send size={17} aria-hidden="true" />
        {enviando ? "Enviando…" : "Revisar y enviar a cocina"}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="neutral"
          onClick={() => {
            setVerTicket(false);
            onVolver();
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Volver
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
    </div>
  );

  return (
    <>
      {/* ── la carta ── */}
      <section aria-label="Carta" className={cn("flex min-w-0 flex-col gap-3 apaisado:min-h-0", vertical && "min-h-0 pb-24")}>
        {/* B6-17: el buscador recorre toda la carta. */}
        <label className="flex min-h-12 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 focus-within:border-brand">
          <Search className="size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
          <span className="sr-only">Buscar en la carta</span>
          <input
            type="search"
            value={buscado}
            onChange={(e) => setBuscado(e.target.value)}
            placeholder="Buscar en la carta"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {buscado && (
            <button
              type="button"
              onClick={() => setBuscado("")}
              aria-label="Borrar la búsqueda"
              className="-mr-2 grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:text-ink"
            >
              <X className="size-(--icono-texto)" aria-hidden="true" />
            </button>
          )}
        </label>

        {/* Las categorías en una tira que se desliza (antes, en tres renglones). Buscando, ninguna manda. */}
        <div
          role="group"
          aria-label="Categorías"
          className="-mx-1 flex shrink-0 snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          {categorias.map((c) => {
            const elegida = !q && c === categoria;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={elegida}
                onClick={() => {
                  setCategoria(c);
                  setBuscado("");
                }}
                className={cn(
                  "min-h-12 shrink-0 cursor-pointer snap-start rounded-[var(--radius-control)] border px-4 text-[14px] whitespace-nowrap",
                  "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  elegida ? "border-brand bg-brand font-semibold text-on-brand" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {c === MAS_PEDIDOS ? (
                  <span className="inline-flex items-center gap-1.5">
                    <TrendingUp className="size-(--icono-texto)" aria-hidden="true" />
                    {masPedidos?.periodo === "SEMANA" ? "Lo más pedido de la semana" : "Lo más pedido hoy"}
                  </span>
                ) : (
                  c
                )}
              </button>
            );
          })}
        </div>

        {enVenta.length === 0 && (
          <p role="status" className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13.5px] text-ink-2">
            La carta está vacía: administración la arma en Inventario → Productos → En la carta.
          </p>
        )}
        {q && visibles.length === 0 && (
          <p role="status" className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-ink-2">
            Nada en la carta con «{buscado.trim()}».
          </p>
        )}
        <ul className={cn("grid grid-cols-2 content-start gap-2 sm:grid-cols-3 apaisado:min-h-0 apaisado:overflow-y-auto xl:grid-cols-4", vertical && "min-h-0 overflow-y-auto")}>
          {visibles.map((i) => {
            const n = cantidadEn(i.id);
            const hay = disponible(i) && quedanDe(i) > 0;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  disabled={!hay}
                  onClick={() => onCambiar(anadir(lineas, i.id))}
                  aria-label={`Añadir ${i.nombre}, ${formatMoneyVE(toMajor(i.precio), "USD")}${n > 0 ? `, van ${n}` : ""}`}
                  className={cn(
                    "relative flex min-h-[5.5rem] w-full cursor-pointer flex-col justify-between rounded-[var(--radius-card)] border p-3 text-left",
                    "transition-[border-color,background-color,transform] duration-[var(--dur-rapida)] active:scale-[0.98]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    "disabled:cursor-not-allowed disabled:active:scale-100",
                    !hay ? "border-dashed border-line bg-base/40 text-ink-3" : n > 0 ? "border-brand/60 bg-surface" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <span className={cn("pr-7 text-[14px] leading-snug font-semibold", hay ? "text-ink" : "line-through")}>{i.nombre}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="tnum text-[13px] text-ink-2">{formatMoneyVE(toMajor(i.precio), "USD")}</span>
                    {i.sinInventarioInicial ? (
                      <Badge tone="idle">Sin contar</Badge>
                    ) : !disponible(i) ? (
                      <Badge tone="idle">Agotado</Badge>
                    ) : i.existencia !== null ? (
                      <span className="tnum text-[12px] text-ink-3">{hay ? `Quedan ${quedanDe(i)}` : "No quedan más"}</span>
                    ) : null}
                  </span>
                  {n > 0 && (
                    <span aria-hidden="true" className="tnum absolute top-2 right-2 grid size-7 place-content-center rounded-full bg-brand text-[13px] font-bold text-on-brand">
                      {n}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── el ticket del borrador: al lado, o en vertical un cajón con su barra abajo ── */}
      {vertical ? (
        <>
          {montado &&
            createPortal(
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
                <div className="mx-auto flex max-w-3xl items-center gap-2">
                  <Button variant="neutral" onClick={onVolver} aria-label="Volver a la mesa">
                    <ArrowLeft size={17} aria-hidden="true" />
                  </Button>
                  <button
                    type="button"
                    onClick={() => setVerTicket(true)}
                    aria-haspopup="dialog"
                    className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 text-left focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <ChevronUp className="size-(--icono-texto) shrink-0 text-ink-3" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-cuerpo font-semibold text-ink">{unidades === 1 ? "1 plato" : `${unidades} platos`}</span>
                    <MoneyDisplay value={toMajor(total)} currency="USD" size="md" />
                  </button>
                  <Button variant="primary" disabled={!puedeEnviar} onClick={() => setConfirmar(true)}>
                    <Send size={17} aria-hidden="true" />
                    {enviando ? "Enviando…" : "Enviar"}
                  </Button>
                </div>
              </div>,
              document.body,
            )}
          <Cajon abierto={verTicket} onCerrar={() => setVerTicket(false)} titulo={rotulo} descripcion="Borrador: la cocina todavía no lo ve" pie={pieDelTicket}>
            {lista}
          </Cajon>
        </>
      ) : (
        <aside aria-label={`Borrador · ${rotulo}`} className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface apaisado:min-h-0">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-display text-lg leading-tight font-bold text-ink">{rotulo}</h2>
              <p className="text-[12px] text-ink-3">Borrador: la cocina todavía no lo ve</p>
            </div>
            <Badge tone="idle">{unidades === 1 ? "1 plato" : `${unidades} platos`}</Badge>
          </header>
          <div className="flex-1 px-4 py-2 apaisado:min-h-0 apaisado:overflow-y-auto">{lista}</div>
          <footer className="border-t border-line px-4 py-3">{pieDelTicket}</footer>
        </aside>
      )}

      {/* ── nota de una línea ── */}
      <Dialog
        abierto={notaDe !== null}
        onCerrar={() => setNotaDe(null)}
        titulo={`Nota · ${notaDe !== null ? (item(lineas[notaDe]?.itemId ?? "")?.nombre ?? "") : ""}`}
        descripcion="La cocina la lee en la comanda. Corta y concreta."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={() => setNotaDe(null)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="nota-del-plato">
              Guardar nota
            </Button>
          </div>
        }
      >
        <form
          id="nota-del-plato"
          onSubmit={(e) => {
            e.preventDefault();
            if (notaDe !== null) onCambiar(lineas.map((l, j) => (j === notaDe ? { ...l, nota: notaTexto.trim().slice(0, 80) } : l)));
            setNotaDe(null);
          }}
          className="flex flex-col gap-3"
        >
          {/* B6-12: un toque la añade; lo escrito se queda. */}
          <section aria-label="Notas frecuentes" className="flex flex-col gap-1.5">
            <span className="text-etiqueta font-semibold tracking-[0.07em] text-ink-3 uppercase">Las más pedidas</span>
            {frecuentes === null ? (
              <p className="text-detalle text-ink-3">Buscando las notas de este plato…</p>
            ) : frecuentes.error ? (
              <p role="alert" className="text-detalle text-state-warn">No se pudieron traer las notas frecuentes: escríbela.</p>
            ) : frecuentes.notas.length === 0 ? (
              <p className="text-detalle text-ink-3">Todavía no hay notas para este plato: las que escribas aparecerán aquí.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {frecuentes.notas.map((n) => (
                  <Button key={n} type="button" variant="neutral" surface="tablet" onClick={() => setNotaTexto((t) => conNotaRapida(t, n))}>
                    {n}
                  </Button>
                ))}
              </div>
            )}
          </section>
          {/* B6-17: las reglas de teclado de B4-18: mayúscula al empezar, Intro «Listo» (guarda), 16 px. */}
          <Input
            label="Nota para cocina"
            surface="tablet"
            maxLength={80}
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            autoCapitalize="sentences"
            enterKeyHint="done"
            autoComplete="off"
            hint={`${notaTexto.length} de 80 caracteres`}
          />
        </form>
      </Dialog>

      {/* ── confirmación: se le lee el pedido a la mesa ── */}
      <Dialog
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo={`Enviar a cocina · ${rotulo}`}
        descripcion="Léeselo a la mesa. Una vez enviado, cambiarlo o anularlo exige motivo y autorización."
        pie={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="neutral" onClick={() => setConfirmar(false)}>
              Seguir editando
            </Button>
            <Button
              variant="primary"
              disabled={impedimento !== null || enviando}
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
                <span className="text-ink">{item(l.itemId)?.nombre}</span>
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
