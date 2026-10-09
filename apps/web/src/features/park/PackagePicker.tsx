"use client";

import type { CSSProperties } from "react";
import { Infinity as SinLimite } from "lucide-react";
import type { DurationDto, PricePackageDto } from "@l2/contracts";
import { cn, MoneyDisplay } from "@l2/ui";
import { toMajor } from "@l2/domain-money";
import { toMoney } from "./mappers.ts";

/**
 * Nivel 3 — funcionalidad (§9.4). Conoce lo que es un paquete de tarifa.
 *
 * Botones grandes en lugar de un desplegable, y no por gusto: un `<select>`
 * en una tablet abre una lista nativa, obliga a apuntar y añade dos toques.
 * Con cuatro tarifas, verlas todas y tocar una es más rápido — y los 90
 * segundos de F5-02 se ganan justo aquí.
 */
export function PackagePicker({
  packages,
  selectedId,
  onSelect,
  compact = false,
}: {
  packages: readonly PricePackageDto[];
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  // Cuatro en fila solo si cabe donde está, no según la pantalla: en la hoja de la caja (480 px, en una laptop) cuatro
  // columnas partían los nombres letra por letra (v0.90.1, M-34).
  return (
    <div className="@container">
      <div
        role="radiogroup"
        aria-label="Paquete de tiempo"
        className={cn("grid grid-cols-2 gap-2", compact ? "@xl:grid-cols-4" : "@lg:grid-cols-4")}
      >
        {packages.map((p) => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(p.id)}
              className={cn(
                // §8.4: superficie POS, objetivo mínimo de 56 px. El reloj a la izquierda; el nombre entero, sin cortar.
                "flex min-h-14 cursor-pointer items-center gap-2.5",
                "rounded-[var(--radius-control)] border px-2.5 py-2 text-left transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                active
                  ? "border-brand bg-brand/20 text-ink"
                  : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <RelojDelPaquete duracion={p.duration} activo={active} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-[13px] leading-tight font-semibold break-words text-balance", active && "text-brand")}>
                  {p.name}
                </span>
                <MoneyDisplay
                  value={toMajor(toMoney(p.price))}
                  currency={p.price.currency}
                  size="sm"
                  tone={active ? "default" : "muted"}
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Con dos horas el anillo se llena: más allá, ya se lee en la cifra. */
const ANILLO_LLENO_MIN = 120;
const RADIO = 15;
const LARGO = 2 * Math.PI * RADIO;

/** «30'», «1 h», «1,5 h»: la cifra del tiempo, corta, para dentro del anillo. */
function cifraDe(minutos: number): string {
  if (minutos < 60) return `${minutos}'`;
  const horas = Math.round((minutos / 60) * 10) / 10;
  return `${String(horas).replace(".", ",")}h`;
}

/**
 * El tiempo del paquete de un vistazo (T-15, M-27, P-7): un anillo que se llena según lo que dura, con la cifra
 * dentro; el pase libre, el infinito. Al elegirlo se dibuja hasta su tiempo. Es decorado del botón: el nombre y el
 * precio siguen diciéndolo todo con texto.
 */
function RelojDelPaquete({ duracion, activo }: { duracion: DurationDto; activo: boolean }) {
  const libre = duracion.kind === "openEnded";
  const fraccion = libre ? 1 : Math.min(duracion.minutes / ANILLO_LLENO_MIN, 1);
  return (
    <span aria-hidden="true" className={cn("relative grid size-9 shrink-0 place-content-center", activo ? "text-brand" : "text-ink-3")}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 size-9 -rotate-90">
        <circle cx="18" cy="18" r={RADIO} fill="none" strokeWidth="3" className="stroke-line" />
        <circle
          // Al elegirlo se monta de nuevo y se dibuja.
          key={activo ? "elegido" : "quieto"}
          cx="18"
          cy="18"
          r={RADIO}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={LARGO}
          strokeDashoffset={LARGO * (1 - fraccion)}
          className={cn(activo && "l2-anillo")}
          style={{ "--l2-anillo-largo": LARGO } as CSSProperties}
        />
      </svg>
      {libre ? <SinLimite size={15} /> : <span className="tnum relative text-[10.5px] font-bold">{cifraDe(duracion.minutes)}</span>}
    </span>
  );
}
