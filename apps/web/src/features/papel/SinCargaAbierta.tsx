import Link from "next/link";
import type { Route } from "next";
import { TriangleAlert } from "lucide-react";
import { Container } from "@l2/ui";

/**
 * La caja de papel no se abre: la carga no existe, ya se terminó o es de otro turno (B3-7). No se ofrece el cobro
 * de ahora en su lugar: quien venía a cargar lo anotado lo dice y vuelve a la carga.
 */
export function SinCargaAbierta() {
  return (
    <Container ancho="operacion" className="flex min-h-0 flex-1 items-start justify-center py-8">
      <section className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <TriangleAlert size={18} className="text-state-warn" aria-hidden="true" />
          Esa carga no está abierta
        </h1>
        <p role="alert" className="text-[13.5px] text-ink-2">
          La carga de lo anotado en papel que quieres usar no existe, ya se terminó o es de otro turno. Abre una desde la carga, o vuelve a la caja
          de siempre.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link href={"/papel" as Route} className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] bg-brand px-4 font-semibold text-on-brand">
            Ir a la carga
          </Link>
          <Link href={"/caja" as Route} className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-line px-4 font-semibold text-ink hover:border-line-strong">
            Caja de ahora
          </Link>
        </div>
      </section>
    </Container>
  );
}
