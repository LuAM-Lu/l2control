"use client";

import { ChefHat, CupSoda, FileX } from "lucide-react";
import type { AreaDeProductoDto, TipoProducto } from "@l2/contracts";
import { areaDe } from "@l2/domain-orders";
import { TAMANO_ICONO, cn } from "@l2/ui";

/**
 * En qué comanda sale un producto (B6-10): la de cocina, la de barra o ninguna. Lo usan la ficha, el alta, la edición en
 * lote y la carta. Sin elegir, la de su tipo (lo preparado, cocina; lo de nevera, barra; un servicio, sin papel).
 */
export const AREAS: readonly { id: AreaDeProductoDto; nombre: string; detalle: string; Icono: typeof ChefHat }[] = [
  { id: "COCINA", nombre: "Cocina", detalle: "Sale en la comanda de cocina", Icono: ChefHat },
  { id: "BARRA", nombre: "Barra", detalle: "Sale en la comanda de barra", Icono: CupSoda },
  { id: "SIN_PAPEL", nombre: "Sin papel", detalle: "Se sirve sin comanda", Icono: FileX },
];

export const NOMBRE_DE_AREA: Readonly<Record<AreaDeProductoDto, string>> = { COCINA: "Cocina", BARRA: "Barra", SIN_PAPEL: "Sin papel" };

/**
 * Las tres áreas para elegir. `valor: null` es «la de su tipo»: se marca la de su tipo y, si el tipo cambia, el área lo
 * sigue. Elegir la de su tipo vuelve a `null`.
 */
export function ElegirArea({
  tipo,
  valor,
  onCambio,
  deshabilitado,
  compacto,
}: {
  tipo: TipoProducto;
  valor: AreaDeProductoDto | null;
  onCambio: (a: AreaDeProductoDto | null) => void;
  deshabilitado?: boolean | undefined;
  /** Sin la explicación de cada una (en una fila de la carta). */
  compacto?: boolean | undefined;
}) {
  const deSuTipo = areaDe(tipo, null);
  const elegida = valor ?? deSuTipo;
  return (
    <div role="radiogroup" aria-label="Dónde se prepara" className="grid grid-cols-3 gap-1.5">
      {AREAS.map((a) => (
        <button
          key={a.id}
          type="button"
          role="radio"
          aria-checked={elegida === a.id}
          disabled={deshabilitado}
          onClick={() => onCambio(a.id === deSuTipo ? null : a.id)}
          className={cn(
            "flex cursor-pointer flex-col items-start justify-center gap-0.5 rounded-[var(--radius-control)] border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            compacto ? "min-h-8" : "min-h-14",
            elegida === a.id ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
          )}
        >
          <span className="flex items-center gap-1.5 text-detalle font-semibold">
            <a.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
            {a.nombre}
          </span>
          {!compacto && <span className="text-nota leading-tight text-ink-3">{a.id === deSuTipo ? "La de su tipo" : a.detalle}</span>}
        </button>
      ))}
    </div>
  );
}
