"use client";

import { useEffect, useState } from "react";
import { Baby, Link2, TriangleAlert } from "lucide-react";
import type { DiningTableDto } from "@l2/contracts";
import { Button, Sheet, cn } from "@l2/ui";
import type { EstadoLocal } from "../simulacion/proyeccion.ts";
import { ninosSinMesa } from "../mesas/mesas.ts";
import { nombreDeEstancia } from "./view-model.ts";

/**
 * Vincular a un niño (y sus hermanos) a una mesa desde la sala — DEC-29.
 */
export function VincularAMesa({
  abierto,
  onCerrar,
  sesionId,
  estado,
  plano,
  onVincular,
}: {
  abierto: boolean;
  onCerrar: () => void;
  sesionId: string;
  estado: EstadoLocal;
  plano: readonly DiningTableDto[];
  onVincular: (tableId: string, sessionIds: string[]) => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mesaElegida, setMesaElegida] = useState<string | null>(null);

  const familia = estado.familias[sesionId];
  const sinMesa = ninosSinMesa(estado).find((g) => g.familia === familia)?.ninos ?? [];
  const mesaActual = Object.values(estado.mesas).find((m) => m.sesiones.includes(sesionId));

  // Preseleccionar a todos los hermanos que aún no tienen mesa
  useEffect(() => {
    if (abierto) {
      setElegidos(sinMesa.map((n) => n.id));
      setMesaElegida(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, sesionId, familia]); // Se calcula al abrir, no cambia selecciones del usuario si entra otro niño.

  const alternar = (id: string) =>
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const disponibles = new Set(sinMesa.map((n) => n.id));
  const validos = elegidos.filter((id) => disponibles.has(id));

  const mesasAbiertas = plano
    .map((m) => estado.mesas[m.id])
    .filter((m) => m !== undefined);

  let motivoBoton: string | null = null;
  if (mesaActual) {
    motivoBoton = `Ya está en la mesa ${mesaActual.label}`;
  } else if (validos.length === 0) {
    motivoBoton = "Elige al menos un niño";
  } else if (!mesaElegida) {
    motivoBoton = "Elige una mesa";
  }

  const nombre = (id: string) => {
    const s = estado.sesiones.find((x) => x.id === id);
    return s ? nombreDeEstancia(s) : (estado.nombres[id] ?? "Un niño");
  };

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Vincular a una mesa"
      descripcion="Su tiempo de parque se cobrará con la cuenta de la mesa: la familia paga una sola vez."
      pie={
        <Button
          variant="primary"
          disabled={motivoBoton !== null}
          onClick={() => {
            if (mesaElegida && validos.length > 0) {
              onVincular(mesaElegida, validos);
              onCerrar();
            }
          }}
          className="w-full"
        >
          <Link2 size={17} aria-hidden="true" />
          {motivoBoton ?? `Vincular a la mesa ${mesasAbiertas.find((m) => m.id === mesaElegida)?.label ?? ""}`}
        </Button>
      }
    >
      {mesaActual && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn"
        >
          <TriangleAlert size={15} aria-hidden="true" />
          El niño ya está en la mesa {mesaActual.label}
        </p>
      )}

      {!mesaActual && sinMesa.length > 0 && (
        <fieldset className="mb-6">
          <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
            Niños de la familia {familia}
          </legend>
          <ul className="flex flex-col gap-1.5">
            {sinMesa.map((n) => {
              const marcado = elegidos.includes(n.id);
              return (
                <li key={n.id}>
                  <label
                    className={cn(
                      "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3",
                      "transition-colors duration-[var(--dur-rapida)]",
                      marcado ? "border-brand/60 bg-brand/10" : "border-line bg-base/40 hover:border-line-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(n.id)}
                      className="size-5 accent-[var(--color-brand)]"
                    />
                    <Baby size={16} aria-hidden="true" className="text-ink-3" />
                    <span className="flex-1 text-[14px] font-medium text-ink">{nombre(n.id)}</span>
                    <span className="tnum font-mono text-[12px] text-ink-3">{n.wristbandCode}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {!mesaActual && (
        <fieldset>
          <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
            Mesas abiertas
          </legend>
          {mesasAbiertas.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-2">
              No hay mesas abiertas. El mesero tiene que abrir la mesa primero para que puedas vincular a los niños.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mesasAbiertas.map((m) => {
                const marcado = mesaElegida === m.id;
                return (
                  <li key={m.id}>
                    <label
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3",
                        "transition-colors duration-[var(--dur-rapida)]",
                        marcado ? "border-brand/60 bg-brand/10" : "border-line bg-base/40 hover:border-line-strong",
                      )}
                    >
                      <input
                        type="radio"
                        name="mesa-destino"
                        checked={marcado}
                        onChange={() => setMesaElegida(m.id)}
                        className="size-5 accent-[var(--color-brand)]"
                      />
                      <span className="font-display w-8 text-center text-lg font-bold text-ink">{m.label}</span>
                      <span className="flex-1 text-[13px] text-ink-2">
                        {m.comensales} {m.comensales === 1 ? "persona" : "personas"}
                        {m.sesiones.length > 0 && ` · ${m.sesiones.length} niños`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      )}
    </Sheet>
  );
}
