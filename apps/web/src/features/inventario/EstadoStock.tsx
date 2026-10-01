import { CircleCheck, PackageX, TriangleAlert } from "lucide-react";
import type { StockStatus } from "@l2/domain-inventory";
import { cn } from "@l2/ui";

/**
 * El estado del stock de un producto (B9-5): agotado, bajo su mínimo o bien. Color + icono + texto
 * (§8.2), y los colores de estado significan lo mismo que en el resto del sistema: agotado es crítico
 * (no se vende, ADR-023), bajo mínimo es aviso (hay que reponer) y bien es bien.
 */
const ESTADO: Readonly<Record<StockStatus, { texto: string; clase: string; Icono: typeof CircleCheck }>> = {
  AGOTADO: { texto: "Agotado", clase: "border-state-crit/40 bg-state-crit-bg text-state-crit", Icono: PackageX },
  BAJO_MINIMO: { texto: "Bajo mínimo", clase: "border-state-warn/40 bg-state-warn-bg text-state-warn", Icono: TriangleAlert },
  BIEN: { texto: "Bien", clase: "border-state-ok/30 bg-state-ok-bg text-state-ok", Icono: CircleCheck },
};

export function EstadoStock({ estado, className }: { estado: StockStatus; className?: string }) {
  const { texto, clase, Icono } = ESTADO[estado];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", clase, className)}>
      <Icono size={12} aria-hidden="true" />
      {texto}
    </span>
  );
}
