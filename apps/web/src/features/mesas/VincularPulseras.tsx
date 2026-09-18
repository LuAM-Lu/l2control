"use client";

import { useCallback, useState } from "react";
import { Baby, Link2, TriangleAlert } from "lucide-react";
import { WristbandCodeSchema, type DiningTableDto } from "@l2/contracts";
import { Button, ScannerField, Sheet, cn } from "@l2/ui";
import type { EstadoLocal } from "../simulacion/proyeccion.ts";
import { ninosSinMesa } from "./mesas.ts";
import { nombreDeEstancia } from "../park/view-model.ts";

/**
 * Vincular las pulseras de los niños a una mesa — F6-05, R3, paso B3.
 *
 * El parque de un niño vinculado se cobra con la cuenta de la mesa: la
 * familia paga una vez. Por eso un niño que ya está en otra mesa no se ofrece,
 * y si se escanea su pulsera se dice dónde está en vez de moverlo en silencio.
 *
 * Dos formas de elegir, porque en la mesa pasan las dos: pasar las pulseras
 * por el lector, o tocar a los niños de la familia en la lista.
 */
export function VincularPulseras({
  abierto,
  onCerrar,
  mesa,
  estado,
  onVincular,
}: {
  abierto: boolean;
  onCerrar: () => void;
  mesa: DiningTableDto;
  estado: EstadoLocal;
  onVincular: (sessionIds: string[]) => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);

  const grupos = ninosSinMesa(estado);
  const yaAqui = estado.mesas[mesa.id]?.sesiones ?? [];
  const nombre = (id: string) => {
    const s = estado.sesiones.find((x) => x.id === id);
    return s ? nombreDeEstancia(s) : (estado.nombres[id] ?? "un niño");
  };

  const alternar = (id: string) =>
    setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const alEscanear = useCallback(
    (codigo: string) => {
      const r = WristbandCodeSchema.safeParse(codigo);
      const sesion = r.success ? estado.sesiones.find((s) => s.wristbandCode === r.data) : undefined;
      if (!sesion) {
        setAviso(`La pulsera ${codigo} no es de ningún niño en sala`);
        return;
      }
      const otra = Object.values(estado.mesas).find((m) => m.sesiones.includes(sesion.id));
      const quien = nombreDeEstancia(sesion);
      if (otra) {
        setAviso(otra.id === mesa.id ? `${quien} ya está en esta mesa` : `${quien} ya está en la mesa ${otra.label}`);
        return;
      }
      setElegidos((prev) => (prev.includes(sesion.id) ? prev : [...prev, sesion.id]));
      setAviso(null);
    },
    [estado.sesiones, estado.mesas, mesa.id],
  );

  const cerrar = () => {
    setElegidos([]);
    setAviso(null);
    onCerrar();
  };

  // Solo cuentan los que siguen disponibles: mientras la hoja está abierta,
  // un niño puede salir del parque o vincularse desde otra tablet.
  const disponibles = new Set(grupos.flatMap((g) => g.ninos.map((n) => n.id)));
  const validos = elegidos.filter((id) => disponibles.has(id));

  return (
    <Sheet
      abierto={abierto}
      onCerrar={cerrar}
      titulo={`Vincular niños a la mesa ${mesa.label}`}
      descripcion="Su tiempo de parque se cobrará con la cuenta de la mesa: la familia paga una sola vez."
      pie={
        <Button
          variant="primary"
          disabled={validos.length === 0}
          onClick={() => {
            onVincular(validos);
            cerrar();
          }}
          className="w-full"
        >
          <Link2 size={17} aria-hidden="true" />
          {validos.length === 0
            ? "Elige a los niños"
            : `Vincular ${validos.length === 1 ? "1 niño" : `${validos.length} niños`}`}
        </Button>
      }
    >
      {abierto && (
        <ScannerField
          onScan={alEscanear}
          validate={(c) => WristbandCodeSchema.safeParse(c).success}
          placeholder="Pasa las pulseras o toca a los niños…"
        />
      )}

      {aviso && (
        <p
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn"
        >
          <TriangleAlert size={15} aria-hidden="true" />
          {aviso}
        </p>
      )}

      {yaAqui.length > 0 && (
        <p className="mt-4 text-[13px] text-ink-2">
          Ya en esta mesa: <span className="font-medium text-ink">{yaAqui.map(nombre).join(", ")}</span>
        </p>
      )}

      {grupos.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius-control)] border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-2">
          No hay niños en sala sin mesa. Si la familia tiene niños jugando, primero se registran en la
          entrada del parque.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {grupos.map((g) => (
            <fieldset key={g.familia}>
              <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
                {g.familia}
              </legend>
              <ul className="flex flex-col gap-1.5">
                {g.ninos.map((n) => {
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
                        <span className="flex-1 text-[14px] font-medium text-ink">{nombreDeEstancia(n)}</span>
                        <span className="tnum font-mono text-[12px] text-ink-3">{n.wristbandCode}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ))}
        </div>
      )}
    </Sheet>
  );
}
