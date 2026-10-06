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
  /** El publicado; sin ninguno, el borrador de partida: sin paquetes, así que nada se vende con él. */
  tarifario: TarifarioDto;
  /** Versión vigente en el servidor; 0 si todavía no se publicó ninguna. */
  version: number;
  /** `false` en un local recién instalado (T-4): la entrada no vende hasta publicar el primero. */
  publicado: boolean;
  /** Sustituye el tarifario en servicio. Nunca lanza por un rechazo: lo devuelve. */
  publicar: (tarifario: TarifarioDto) => Promise<Resultado<TarifarioPublicadoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

/**
 * De dónde parte el editor en un local sin tarifario: ningún paquete y unas reglas que NO cobran
 * nada por su cuenta (sin gracia y tiempo de más a $ 0,00) hasta que administración las fije. El
 * aforo es el del piloto (DEC-7). No es un tarifario: no pasa el contrato (pide un paquete a la
 * venta) y el servidor no lo conoce.
 */
const BORRADOR_DE_PARTIDA: TarifarioDto = {
  packages: [],
  policy: {
    graceMinutes: 0,
    penaltyBlockMinutes: 15,
    penaltyPricePerBlock: { minor: "0", currency: "USD" },
    warnBeforeMinutes: 5,
    capacityLimit: 30,
  },
};

export function TarifarioProvider({ inicial, children }: { inicial: TarifarioPublicadoDto | null; children: React.ReactNode }) {
  const [vigente, setVigente] = useState<TarifarioPublicadoDto | null>(inicial);

  // Cuando el layout se vuelve a pintar con otra versión (esta u otra estación publicó y se
  // navegó), se adopta: `useState` solo mira su valor inicial una vez. Depende solo de la
  // versión, que identifica el contenido; el objeto cambia en cada pintado.
  useEffect(() => {
    setVigente(inicial);
  }, [inicial?.version]);

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
    () => ({ tarifario: vigente?.tarifario ?? BORRADOR_DE_PARTIDA, version: vigente?.version ?? 0, publicado: vigente !== null, publicar }),
    [vigente, publicar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTarifario(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTarifario se usó fuera de TarifarioProvider");
  return v;
}
