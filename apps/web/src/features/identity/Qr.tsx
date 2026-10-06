import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { cn } from "@l2/ui";

/**
 * Un código QR dibujado en SVG, sin pedir nada a ningún servicio: lo que codifica (un enlace de
 * alta, ADR-020) no sale del navegador. Siempre negro sobre blanco (`l2-qr`), con su margen de
 * cuatro módulos, que es lo que una cámara necesita para encontrarlo.
 */
const MARGEN = 4;

export function Qr({ valor, titulo, className }: { valor: string; titulo: string; className?: string }) {
  const { lado, trazo } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(valor);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let f = 0; f < n; f++) {
      for (let c = 0; c < n; c++) if (qr.isDark(f, c)) d += `M${c + MARGEN} ${f + MARGEN}h1v1h-1z`;
    }
    return { lado: n + MARGEN * 2, trazo: d };
  }, [valor]);

  return (
    <svg
      role="img"
      aria-label={titulo}
      viewBox={`0 0 ${lado} ${lado}`}
      shapeRendering="crispEdges"
      className={cn("l2-qr rounded-[var(--radius-control)]", className)}
    >
      <path d={trazo} fill="currentColor" />
    </svg>
  );
}
