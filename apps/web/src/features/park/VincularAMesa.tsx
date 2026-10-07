"use client";

import { useEffect, useState } from "react";
import { Baby, Link2, TriangleAlert } from "lucide-react";
import type { FamilyAccountDto } from "@l2/contracts";
import { Button, Sheet, cn } from "@l2/ui";
import type { EstadoLocal } from "../operacion/proyeccion.ts";
import { cuentasDeMesaAbiertas, ninosSinMesa } from "../mesas/mesas.ts";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";
import { nombreDeEstancia } from "./view-model.ts";

/**
 * Vincular a un niño (y sus hermanos) a una mesa desde la sala — DEC-29.
 *
 * Se elige la CUENTA de la mesa (B6-7): en una mesa compartida cada familia tiene la suya, y el parque del
 * niño va a la de su familia. Las mesas que se ofrecen son las que tienen cuenta abierta en el servidor.
 */
export function VincularAMesa({
  abierto,
  onCerrar,
  sesionId,
  estado,
  cuentas,
  onVincular,
}: {
  abierto: boolean;
  onCerrar: () => void;
  sesionId: string;
  estado: EstadoLocal;
  cuentas: readonly FamilyAccountDto[];
  /** Vincula en el servidor (B6-3, B6-7) a esa cuenta de mesa; `true` si quedó hecho. */
  onVincular: (cuenta: FamilyAccountDto, sessionIds: string[]) => Promise<boolean>;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [mesaElegida, setMesaElegida] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState(false);

  const familia = estado.familias[sesionId];
  const sinMesa = ninosSinMesa(estado, cuentas).find((g) => g.familia === familia)?.ninos ?? [];
  const mesaActual = cuentas.find((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR") && c.sessionIds.includes(sesionId));

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

  // Las cuentas de mesa abiertas en el servidor: una por familia en una mesa compartida (B6-7).
  const mesasAbiertas = cuentasDeMesaAbiertas(cuentas);
  const destino = mesasAbiertas.find((c) => c.id === mesaElegida) ?? null;

  let motivoBoton: string | null = null;
  if (mesaActual) {
    motivoBoton = `Ya está en ${nombreDeCuenta(mesaActual)}`;
  } else if (validos.length === 0) {
    motivoBoton = "Elige al menos un niño";
  } else if (!mesaElegida) {
    motivoBoton = "Elige una mesa";
  } else if (vinculando) {
    motivoBoton = "Vinculando…";
  }

  const nombre = (id: string) => {
    const s = estado.sesiones.find((x) => x.id === id);
    return s ? nombreDeEstancia(s) : (estado.nombres[id] ?? "Un niño");
  };

  const confirmar = async () => {
    if (!destino || validos.length === 0) return;
    setVinculando(true);
    const hecho = await onVincular(destino, validos);
    setVinculando(false);
    if (hecho) onCerrar();
  };

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Vincular a una mesa"
      descripcion="Su tiempo de parque se cobrará con la cuenta de la mesa: la familia paga una sola vez."
      pie={
        <Button variant="primary" disabled={motivoBoton !== null} onClick={() => void confirmar()} className="w-full">
          <Link2 size={17} aria-hidden="true" />
          {motivoBoton ?? `Vincular · ${destino ? nombreDeCuenta(destino) : ""}`}
        </Button>
      }
    >
      {mesaActual && (
        <p
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn"
        >
          <TriangleAlert size={15} aria-hidden="true" />
          El niño ya está en {nombreDeCuenta(mesaActual)}
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
              No hay mesas abiertas. El mesero tiene que sentar a la familia primero para que puedas vincular a los niños.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {mesasAbiertas.map((m) => {
                const marcado = mesaElegida === m.id;
                const ninosAqui = m.sessionIds.length;
                const propio = m.family !== `Mesa ${m.tableLabel ?? ""}` ? m.family : null;
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
                      <span className="font-display w-8 text-center text-lg font-bold text-ink">{m.tableLabel}</span>
                      <span className="min-w-0 flex-1">
                        {propio && <span className="block truncate text-[13.5px] font-semibold text-ink">{propio}</span>}
                        <span className="block text-[12.5px] text-ink-2">
                          {m.comensales ? `${m.comensales} ${m.comensales === 1 ? "persona" : "personas"}` : "Sin contar personas"}
                          {ninosAqui > 0 && ` · ${ninosAqui} niños`}
                        </span>
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
