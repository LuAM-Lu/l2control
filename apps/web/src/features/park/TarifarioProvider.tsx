"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Resultado, TarifarioDto, TarifarioPublicadoDto } from "@l2/contracts";
import { publicarTarifario } from "./tarifario.acciones";
import { useConElevacion } from "../identity/ElevacionProvider";

/**
 * El tarifario publicado — F5-04, F5-06, en el servidor desde B0-5.
 *
 * Vive por encima de las dos cáscaras: lo escribe el back-office (el editor, solo
 * administración) y lo lee la estación (la entrada). **Solo se guarda lo PUBLICADO**: el
 * borrador del editor no sale de su pantalla. Publicar crea una versión nueva en la base;
 * otra estación la ve al navegar, y en vivo, sin navegar, con el tiempo real (B5-1).
 */

type Valor = Readonly<{
  tarifario: TarifarioDto;
  /** Versión vigente en el servidor. */
  version: number;
  /** Sustituye el tarifario en servicio. Nunca lanza por un rechazo: lo devuelve. */
  publicar: (tarifario: TarifarioDto) => Promise<Resultado<TarifarioPublicadoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function TarifarioProvider({ inicial, children }: { inicial: TarifarioPublicadoDto; children: React.ReactNode }) {
  const [vigente, setVigente] = useState<TarifarioPublicadoDto>(inicial);

  // Cuando el layout se vuelve a pintar con otra versión (esta u otra estación publicó y se
  // navegó), se adopta: `useState` solo mira su valor inicial una vez. Depende solo de la
  // versión, que identifica el contenido; el objeto cambia en cada pintado.
  useEffect(() => {
    setVigente(inicial);
  }, [inicial.version]);

  // Publicar precios exige confirmar identidad (F2-04): si el servidor la pide, se pide y se reintenta.
  const conElevacion = useConElevacion();
  const publicar = useCallback(
    async (nuevo: TarifarioDto) => {
      const r = await conElevacion(() => publicarTarifario(nuevo));
      if (r.ok) setVigente(r.valor);
      return r;
    },
    [conElevacion],
  );

  const valor = useMemo(
    () => ({ tarifario: vigente.tarifario, version: vigente.version, publicar }),
    [vigente, publicar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTarifario(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTarifario se usó fuera de TarifarioProvider");
  return v;
}
