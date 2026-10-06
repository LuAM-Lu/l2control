"use client";

import { useState } from "react";
import { Check, Printer, TriangleAlert } from "lucide-react";
import { Button } from "@l2/ui";

/**
 * Los diez códigos de recuperación (ADR-020), que se enseñan UNA vez: al terminar la instalación
 * o un alta de credenciales. Son lo que queda cuando se pierde la llave de acceso, así que la
 * pantalla no deja seguir hasta que la persona dice que los tiene en papel. El servidor solo
 * guarda su huella: si se pierden, se reponen con un enlace de alta nuevo.
 */
export function CodigosDeRecuperacion({
  nombre,
  codigos,
  continuar,
  onContinuar,
}: {
  nombre: string;
  codigos: readonly string[];
  /** El texto del botón que cierra el paso: «Entrar», «Terminar»… */
  continuar: string;
  onContinuar: () => void;
}) {
  const [guardados, setGuardados] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Guarda tus códigos de recuperación</h1>
        <p className="mt-1.5 text-[14.5px] text-ink-2">
          Si pierdes tu llave de acceso, cada código la sustituye una vez. No se vuelven a enseñar.
        </p>
      </div>

      <section aria-label="Códigos de recuperación" className="l2-codigos rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <p className="text-[12px] font-semibold tracking-[0.07em] text-ink-2 uppercase">L2 Control · códigos de recuperación de {nombre}</p>
        <ol className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2">
          {codigos.map((c, i) => (
            <li key={c} className="tnum flex items-baseline gap-2 font-mono text-[15px] font-semibold tracking-[0.08em] text-ink">
              <span className="w-5 text-right text-[12px] font-normal text-ink-3">{i + 1}.</span>
              {c}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-ink-3">Cada código vale una sola vez. Guárdalos donde no los vea nadie más.</p>
      </section>

      <Button type="button" surface="tablet" variant="ghost" onClick={() => window.print()}>
        <Printer size={16} aria-hidden="true" />
        Imprimir los códigos
      </Button>

      <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-state-warn-bg p-3 text-[13px] text-state-warn">
        <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        Sin tu llave y sin estos códigos no podrás confirmar tu identidad: habría que darte credenciales nuevas.
      </p>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-[14px] text-ink">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-[var(--color-brand)]"
          checked={guardados}
          onChange={(e) => setGuardados(e.target.checked)}
        />
        Ya los imprimí o los copié en un lugar seguro
      </label>

      <Button type="button" surface="tablet" variant="primary" disabled={!guardados} onClick={onContinuar}>
        <Check size={16} aria-hidden="true" />
        {continuar}
      </Button>
    </div>
  );
}
