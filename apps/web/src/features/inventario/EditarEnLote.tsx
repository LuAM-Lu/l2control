"use client";

import { useMemo, useState } from "react";
import { ArchiveX, BookOpen, FolderInput, Gauge, Tag, TriangleAlert, X } from "lucide-react";
import type { CatalogoDto, EditarEnLoteCommand, Resultado } from "@l2/contracts";
import { adjustedPrice, periodAt, priceProblem, type AjusteDePrecio, type PricePeriod } from "@l2/domain-inventory";
import { addDays, calendarDay } from "@l2/domain-rates";
import { money, toMajor } from "@l2/domain-money";
import { Button, Input, Sheet, TAMANO_ICONO, avisar, cn, formatMoneyVE } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { importeTecleado } from "../cash/importe.ts";
import { editarEnLote } from "./productos.acciones";

/**
 * Editar en lote (B9-9, M-29). Con varios productos elegidos en la tabla, una barra ofrece lo que se les puede cambiar a
 * la vez: la categoría, el mínimo, la carta, el precio (en % o en monto, desde un día) o apartarlos. Cada cambio abre su
 * hoja, que enseña a quiénes toca y, con el precio, cómo queda cada uno. Una sola confirmación: todo o nada, y cada
 * producto deja su asiento. Quién puede lo decide el servidor (el precio y la carta piden confirmar la identidad).
 */

export type CambioDeLote = EditarEnLoteCommand["cambio"]["kind"];

const ACCIONES: readonly { id: CambioDeLote; nombre: string; Icono: typeof Tag }[] = [
  { id: "CATEGORIA", nombre: "Categoría", Icono: FolderInput },
  { id: "MINIMO", nombre: "Mínimo", Icono: Gauge },
  { id: "EN_CARTA", nombre: "Carta", Icono: BookOpen },
  { id: "PRECIO", nombre: "Precio", Icono: Tag },
  { id: "APARTAR", nombre: "Apartar", Icono: ArchiveX },
];

const usd = (minor: bigint) => formatMoneyVE(toMajor(money(minor, "USD")), "USD");

/** La barra que aparece con productos elegidos. */
export function BarraDeLote({
  cuantos,
  puede,
  onAccion,
  onLimpiar,
}: {
  cuantos: number;
  /** Qué cambios ofrecer: los que el puesto alcanza. */
  puede: Readonly<Record<CambioDeLote, boolean>>;
  onAccion: (c: CambioDeLote) => void;
  onLimpiar: () => void;
}) {
  return (
    <div role="toolbar" aria-label="Editar los elegidos" className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-brand/40 bg-brand/10 px-3 py-2">
      <span className="tnum text-detalle font-semibold text-ink">
        {cuantos} {cuantos === 1 ? "elegido" : "elegidos"}
      </span>
      {ACCIONES.filter((a) => puede[a.id]).map((a) => (
        <Button key={a.id} type="button" surface="admin" variant="neutral" className="gap-1.5" onClick={() => onAccion(a.id)}>
          <a.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
          {a.nombre}
        </Button>
      ))}
      <Button type="button" surface="admin" variant="ghost" className="ml-auto gap-1.5" onClick={onLimpiar}>
        <X size={TAMANO_ICONO.texto} aria-hidden="true" />
        Quitar la selección
      </Button>
    </div>
  );
}

const TITULO: Readonly<Record<CambioDeLote, string>> = {
  CATEGORIA: "Cambiar la categoría",
  MINIMO: "Cambiar el mínimo",
  EN_CARTA: "La carta",
  PRECIO: "Cambiar el precio",
  APARTAR: "Apartar",
};

/** La hoja de un cambio en lote. */
export function EditarEnLote({
  cambio,
  ids,
  catalogo,
  periodos,
  ahora,
  onCerrar,
  onHecho,
}: {
  cambio: CambioDeLote;
  ids: readonly string[];
  catalogo: CatalogoDto;
  periodos: readonly PricePeriod[];
  ahora: number;
  onCerrar: () => void;
  onHecho: (c: CatalogoDto) => void;
}) {
  const conElevacion = useConElevacion();
  const hoy = calendarDay(new Date(ahora).toISOString(), catalogo.zonaHoraria);
  const productos = useMemo(() => ids.flatMap((id) => catalogo.productos.filter((p) => p.id === id)), [ids, catalogo]);
  const [categoria, setCategoria] = useState("");
  const [minimo, setMinimo] = useState("");
  const [enCarta, setEnCarta] = useState(true);
  const [modo, setModo] = useState<"PORCENTAJE" | "MONTO">("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // El ajuste tecleado: «10» o «-5» por ciento (con decimales, en puntos básicos), o «0,50» / «-0,25» dólares.
  const ajuste = useMemo((): AjusteDePrecio | null => {
    const limpio = valor.trim().replace(",", ".");
    if (!/^[+-]?\d+(\.\d{1,2})?$/.test(limpio)) return null;
    const negativo = limpio.startsWith("-");
    const abs = limpio.replace(/^[+-]/, "");
    const [entero = "0", dec = ""] = abs.split(".");
    const centesimas = BigInt(entero) * 100n + BigInt(dec.padEnd(2, "0") || "0");
    if (centesimas === 0n) return null;
    if (modo === "PORCENTAJE") return { modo, puntosBasicos: Number(negativo ? -centesimas : centesimas) };
    const m = importeTecleado(abs, "USD");
    return m === null || m.amount === 0n ? null : { modo, minor: negativo ? -m.amount : m.amount };
  }, [valor, modo]);

  // Con el precio, cómo queda cada uno ese día.
  const instante = dia === hoy ? ahora : Date.parse(`${dia}T12:00:00Z`);
  const vista = productos.map((p) => {
    const actual = periodAt(periodos, p.id, instante)?.amountMinor ?? null;
    const nuevo = actual !== null && ajuste ? adjustedPrice(actual, ajuste) : null;
    const problema = nuevo !== null ? priceProblem({ amountMinor: nuevo, effectiveFrom: ahora + 1 }, ahora) : null;
    return { p, actual, nuevo, problema };
  });
  const hayProblema = cambio === "PRECIO" && vista.some((v) => v.actual === null || v.problema !== null);

  const comando = (): EditarEnLoteCommand["cambio"] | string => {
    switch (cambio) {
      case "CATEGORIA":
        return categoria.trim().length >= 2 ? { kind: "CATEGORIA", categoria: categoria.trim() } : "Escribe la categoría.";
      case "MINIMO": {
        if (minimo.trim() === "") return { kind: "MINIMO", minimo: null };
        const n = Number(minimo);
        return Number.isInteger(n) && n >= 0 ? { kind: "MINIMO", minimo: n } : "El mínimo es un número entero, o vacío para quitarlo.";
      }
      case "EN_CARTA":
        return { kind: "EN_CARTA", enCarta };
      case "PRECIO":
        if (!ajuste) return modo === "PORCENTAJE" ? "Escribe el por ciento, por ejemplo 10 o -5." : "Escribe el monto, por ejemplo 0,50 o -0,25.";
        if (hayProblema) return "Algún precio no queda bien: revisa la lista.";
        return {
          kind: "PRECIO",
          ajuste: ajuste.modo === "PORCENTAJE" ? { modo: "PORCENTAJE", puntosBasicos: ajuste.puntosBasicos } : { modo: "MONTO", minor: String(ajuste.minor) },
          dia,
        };
      case "APARTAR":
        return { kind: "APARTAR" };
    }
  };

  async function confirmar() {
    const c = comando();
    if (typeof c === "string") {
      setError(c);
      return;
    }
    setEnviando(true);
    setError(null);
    const r: Resultado<CatalogoDto> | null = await conElevacion(() => editarEnLote({ productIds: [...ids], cambio: c })).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("No se pudo hablar con el servidor. No se guardó nada.");
      return;
    }
    if (!r.ok) {
      setError(r.problemas?.[0]?.message && r.motivo === "INVALIDO" && !r.mensaje.includes(":") ? `${r.mensaje} ${r.problemas[0].message}` : r.mensaje);
      return;
    }
    avisar.ok(`${productos.length} ${productos.length === 1 ? "producto cambiado" : "productos cambiados"}.`);
    onHecho(r.valor);
  }

  const categorias = [...new Set(catalogo.productos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={`${TITULO[cambio]} · ${productos.length} ${productos.length === 1 ? "producto" : "productos"}`}
      descripcion="Todo o nada: si uno no puede, no cambia ninguno. Cada producto queda en la auditoría como si se hubiera cambiado solo."
      pie={
        <div className="flex w-full flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-detalle font-medium text-state-crit">
              <TriangleAlert size={TAMANO_ICONO.texto} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <Button type="button" surface="admin" variant={cambio === "APARTAR" ? "danger" : "primary"} disabled={enviando || hayProblema} onClick={() => void confirmar()}>
            {enviando ? "Guardando…" : `Aplicar a ${productos.length} ${productos.length === 1 ? "producto" : "productos"}`}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {cambio === "CATEGORIA" && (
          <>
            <Input label="Categoría nueva" surface="admin" value={categoria} list="categorias-del-lote" maxLength={40} onChange={(e) => setCategoria(e.target.value)} autoFocus />
            <datalist id="categorias-del-lote">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-nota text-ink-3">Si no está en la lista, entra en ella al guardar. El SKU de cada producto no cambia.</p>
          </>
        )}
        {cambio === "MINIMO" && (
          <>
            <Input label="Mínimo" surface="admin" inputMode="numeric" value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ""))} placeholder="Vacío: sin mínimo" autoFocus />
            <p className="text-nota text-ink-3">Con la existencia en el mínimo o por debajo, Inicio y Productos avisan. Solo para lo que se cuenta.</p>
          </>
        )}
        {cambio === "EN_CARTA" && (
          <div role="radiogroup" aria-label="La carta" className="grid grid-cols-2 gap-2">
            {[
              [true, "En la carta", "El mesero los ofrece en las mesas"],
              [false, "Fuera de la carta", "Solo la caja los vende"],
            ].map(([v, t, d]) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={enCarta === v}
                onClick={() => setEnCarta(v as boolean)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-[var(--radius-control)] border px-3 py-2 text-left",
                  enCarta === v ? "border-brand bg-brand/10" : "border-line hover:border-line-strong",
                )}
              >
                <span className="text-detalle font-semibold text-ink">{t as string}</span>
                <span className="text-nota text-ink-3">{d as string}</span>
              </button>
            ))}
          </div>
        )}
        {cambio === "PRECIO" && (
          <>
            <div role="radiogroup" aria-label="Cómo se ajusta" className="flex gap-1 rounded-[var(--radius-control)] bg-surface-2 p-1">
              {(["PORCENTAJE", "MONTO"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modo === m}
                  onClick={() => setModo(m)}
                  className={cn("min-h-8 flex-1 rounded-[var(--radius-control)] px-3 text-detalle", modo === m ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2")}
                >
                  {m === "PORCENTAJE" ? "En por ciento" : "En dólares"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label={modo === "PORCENTAJE" ? "Por ciento (−5 baja)" : "Dólares (−0,25 baja)"}
                surface="admin"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={modo === "PORCENTAJE" ? "10" : "0,50"}
                autoFocus
              />
              <Input label="Desde el día" surface="admin" type="date" value={dia} min={hoy} max={addDays(hoy, 30)} onChange={(e) => setDia(e.target.value || hoy)} />
            </div>
          </>
        )}
        {cambio === "APARTAR" && <p className="text-detalle text-ink-2">Dejan de venderse y de salir en la carta. No se borran: su historia y su existencia se quedan, y se vuelven a poner a la venta desde su ficha.</p>}

        <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
          {vista.map(({ p, actual, nuevo, problema }) => (
            <li key={p.id} className="tnum flex items-center gap-3 px-3 py-1.5 text-detalle">
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.nombre}</span>
              {cambio === "PRECIO" ? (
                actual === null ? (
                  <span className="text-state-warn">Sin precio ese día</span>
                ) : (
                  <span className={cn("whitespace-nowrap", problema ? "font-semibold text-state-crit" : "text-ink-2")}>
                    {usd(actual)} → {nuevo === null ? "—" : problema ? (nuevo <= 0n ? "no queda positivo" : "demasiado alto") : usd(nuevo)}
                  </span>
                )
              ) : (
                <span className="text-nota text-ink-3">{cambio === "MINIMO" ? `Mínimo ${p.minimo ?? "—"}` : cambio === "CATEGORIA" ? p.categoria : cambio === "EN_CARTA" ? (p.enCarta ? "En la carta" : "Fuera") : p.sku}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
