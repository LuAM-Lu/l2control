"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { CatalogoDto, ProductoDto, Resultado, TaxCodeDelCatalogo, TipoProducto } from "@l2/contracts";
import { barcodeProblem, nameKey, nombresConSabores, normalizeBarcode } from "@l2/domain-inventory";
import { Button, Input, Sheet, TAMANO_ICONO, avisar, cn, useLectorDeCodigos } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { altaEnLote } from "./productos.acciones";

/**
 * Duplicar con otros sabores (B9-8, M-28). De un producto («Jugo Naranja 250 ml») salen varios de una vez: se escribe la
 * base («Jugo») y los sabores («Manzana, Pera»), y cada copia lleva la ficha del original (categoría, presentación,
 * precio, IVA, mínimo y carta) con su propio nombre, su SKU y, si se escribe o se lee, su código de barras. Cada copia es
 * un producto propio: nace sin inventario inicial. Todo o nada, por el alta en lote (B9-7).
 */

/** Lo que una copia toma del original. */
export type Plantilla = Readonly<{
  nombre: string;
  categoria: string;
  taxCode: TaxCodeDelCatalogo;
  tipo: TipoProducto;
  presentacion: string | null;
  precioMinor: string | null;
  minimo: number | null;
  enCarta: boolean;
}>;

/** La ficha de un producto como plantilla de sus copias, con el precio que rige ahora. */
export function plantillaDe(p: ProductoDto, precioMinor: bigint | null): Plantilla {
  return {
    nombre: p.nombre,
    categoria: p.categoria,
    taxCode: p.taxCode === "REDUCIDA" ? "GENERAL" : p.taxCode,
    tipo: p.tipo,
    presentacion: p.presentacion,
    precioMinor: precioMinor === null ? null : String(precioMinor),
    minimo: p.minimo,
    enCarta: p.enCarta,
  };
}

/** Lo que va en el alta de cada copia. */
export function productoDeCopia(t: Plantilla, nombre: string, codigo: string | null) {
  return {
    nombre,
    categoria: t.categoria,
    taxCode: t.taxCode,
    tipo: t.tipo,
    precioMinor: t.precioMinor ?? "0",
    ...(t.presentacion ? { presentacion: t.presentacion } : {}),
    ...(t.tipo === "PRODUCTO" && codigo ? { codigoBarras: codigo } : {}),
    ...(t.tipo === "PRODUCTO" && t.minimo !== null ? { minimo: t.minimo } : {}),
    enCarta: t.enCarta,
  };
}

/** La base de un nombre: sin su última palabra, si tiene más de una («Jugo Naranja» → «Jugo»). */
const baseDe = (nombre: string) => {
  const partes = nombre.trim().split(/\s+/);
  return partes.length > 1 ? partes.slice(0, -1).join(" ") : nombre.trim();
};

export function DuplicarConSabores({
  plantilla,
  catalogo,
  onCerrar,
  onCreados,
}: {
  plantilla: Plantilla;
  catalogo: CatalogoDto;
  onCerrar: () => void;
  onCreados: (c: CatalogoDto) => void;
}) {
  const conElevacion = useConElevacion();
  const [base, setBase] = useState(() => baseDe(plantilla.nombre));
  const [sabores, setSabores] = useState("");
  const [codigos, setCodigos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const nombres = useMemo(() => nombresConSabores(base, sabores), [base, sabores]);
  const existentes = useMemo(() => new Set(catalogo.productos.map((p) => nameKey(p.nombre))), [catalogo]);
  const lleva = plantilla.tipo === "PRODUCTO";

  // Lo que se lee va al primero que todavía no tiene código.
  useLectorDeCodigos((leido) => {
    if (!lleva) return;
    const libre = nombres.find((n) => !codigos[n]?.trim());
    if (!libre) {
      avisar.info("Todos tienen su código: borra uno para leerlo otra vez");
      return;
    }
    setCodigos((c) => ({ ...c, [libre]: normalizeBarcode(leido) }));
  });

  const problemaDe = (n: string): string | null => {
    if (existentes.has(nameKey(n))) return "Ya hay un producto con ese nombre";
    const c = codigos[n]?.trim();
    if (c && barcodeProblem(normalizeBarcode(c))) return "Código no válido";
    return null;
  };
  const hayProblema = nombres.some((n) => problemaDe(n) !== null);

  async function crear() {
    if (nombres.length === 0) {
      setError("Escribe al menos un sabor.");
      return;
    }
    if (plantilla.precioMinor === null) {
      setError("El original no tiene precio hoy: ponle precio antes de duplicarlo.");
      return;
    }
    setEnviando(true);
    setError(null);
    const productos = nombres.map((n) => productoDeCopia(plantilla, n, codigos[n]?.trim() ? normalizeBarcode(codigos[n]!) : null));
    const r: Resultado<CatalogoDto> | null = await conElevacion(() => altaEnLote({ productos })).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("No se pudo hablar con el servidor. No se creó nada.");
      return;
    }
    if (!r.ok) {
      setError(r.problemas?.[0]?.message ? `${r.mensaje} ${r.problemas[0].message}.` : r.mensaje);
      return;
    }
    avisar.ok(`${nombres.length} ${nombres.length === 1 ? "producto nuevo" : "productos nuevos"} a la venta, sin inventario inicial.`);
    onCreados(r.valor);
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={`Con otros sabores · ${plantilla.nombre}`}
      descripcion="Cada uno con la ficha del original (categoría, presentación, precio, IVA, mínimo y carta), su nombre, su SKU y su código si lo lleva. Nacen sin inventario inicial."
      pie={
        <div className="flex w-full flex-col gap-2">
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-detalle font-medium text-state-crit">
              <TriangleAlert size={TAMANO_ICONO.texto} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <Button type="button" surface="admin" variant="primary" disabled={enviando || nombres.length === 0 || hayProblema} onClick={() => void crear()}>
            {enviando ? "Creando…" : `Crear ${nombres.length || ""} ${nombres.length === 1 ? "producto" : "productos"}`.replace("  ", " ")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Nombre base" surface="admin" value={base} maxLength={60} onChange={(e) => setBase(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sabores" className="text-etiqueta font-semibold tracking-[0.07em] text-ink-2 uppercase">
            Sabores
          </label>
          <textarea
            id="sabores"
            rows={3}
            value={sabores}
            onChange={(e) => setSabores(e.target.value)}
            placeholder="Naranja, Manzana y Pera"
            autoFocus
            className="w-full resize-none rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-cuerpo text-ink outline-none placeholder:text-ink-3 focus:border-brand"
          />
          <p className="text-nota text-ink-3">Separados por comas, por «y» o uno por renglón.{lleva ? " Pasa cada empaque por el lector: su código va al primero que no lo tenga." : ""}</p>
        </div>
        {nombres.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {nombres.map((n) => {
              const problema = problemaDe(n);
              return (
                <li key={n} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <span className={cn("min-w-0 flex-1 truncate text-detalle font-semibold", problema ? "text-state-crit" : "text-ink")}>{n}</span>
                  {lleva && (
                    <input
                      type="text"
                      aria-label={`Código de barras de ${n}`}
                      placeholder="Código (opcional)"
                      value={codigos[n] ?? ""}
                      onChange={(e) => setCodigos((c) => ({ ...c, [n]: e.target.value }))}
                      className="tnum min-h-9 w-40 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 font-mono text-detalle text-ink focus-visible:outline-2 focus-visible:outline-brand"
                    />
                  )}
                  {problema && <span className="w-full text-nota text-state-crit">{problema}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
