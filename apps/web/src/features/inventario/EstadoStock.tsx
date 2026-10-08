import { CircleCheck, ClipboardList, PackageX, TriangleAlert } from "lucide-react";
import type { ProductoDto } from "@l2/contracts";
import { stockStatus, type StockStatus } from "@l2/domain-inventory";
import { TAMANO_ICONO, cn } from "@l2/ui";

/**
 * El estado del stock de un producto (B9-5; sin inventario inicial, B9-7). Color + icono + texto (§8.2),
 * y los colores de estado significan lo mismo que en el resto del sistema: agotado es crítico (no se
 * vende, ADR-023), bajo mínimo es aviso (hay que reponer), bien es bien y sin inventario inicial es «sin
 * datos» (todavía no se contó: tampoco se vende, pero no se acabó nada).
 */
const ESTADO: Readonly<Record<StockStatus, { texto: string; clase: string; Icono: typeof CircleCheck }>> = {
  SIN_INICIAL: { texto: "Sin inventario inicial", clase: "border-line bg-state-idle-bg text-ink-2", Icono: ClipboardList },
  AGOTADO: { texto: "Agotado", clase: "border-state-crit/40 bg-state-crit-bg text-state-crit", Icono: PackageX },
  BAJO_MINIMO: { texto: "Bajo mínimo", clase: "border-state-warn/40 bg-state-warn-bg text-state-warn", Icono: TriangleAlert },
  BIEN: { texto: "Bien", clase: "border-state-ok/30 bg-state-ok-bg text-state-ok", Icono: CircleCheck },
};

/** El estado de un producto del catálogo, o `null` si no se cuenta. */
export function estadoDe(p: Pick<ProductoDto, "existencia" | "minimo" | "inventarioInicialEl">): StockStatus | null {
  return p.existencia === null ? null : stockStatus(p.existencia, p.minimo, p.inventarioInicialEl !== null);
}

export function EstadoStock({ estado, className }: { estado: StockStatus; className?: string }) {
  const { texto, clase, Icono } = ESTADO[estado];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-etiqueta font-semibold tracking-normal whitespace-nowrap", clase, className)}>
      <Icono size={TAMANO_ICONO.etiqueta} aria-hidden="true" />
      {texto}
    </span>
  );
}
