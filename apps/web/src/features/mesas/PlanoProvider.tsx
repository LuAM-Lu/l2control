"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PlanoLocalDto, PlanoPublicadoDto, Resultado } from "@l2/contracts";
import { publicarPlano } from "./plano.acciones";
import { useConElevacion } from "../identity/ElevacionProvider";

/**
 * El plano del local publicado — F6-01, V4, en el servidor desde B6-1.
 *
 * Vive por encima de las dos cáscaras porque lo escribe el back-office (el editor, solo
 * administración) y lo lee la estación (el mesero). El layout lo lee en el servidor; cuando otro
 * equipo publica, el canal en vivo repinta el layout (tema `plano`) y aquí se adopta la versión
 * nueva. El borrador del editor no sale de su pantalla, y nada se guarda en el navegador.
 */

type Valor = Readonly<{
  /** El plano publicado, o `null` si el local todavía no tiene uno. */
  plano: PlanoLocalDto | null;
  /** Versión vigente en el servidor; `null` = nunca se publicó. */
  version: number | null;
  publicadoEn: string | null;
  publicadoPor: string | null;
  /** Publica sobre la versión vigente. Nunca lanza por un rechazo: lo devuelve. */
  publicar: (plano: PlanoLocalDto) => Promise<Resultado<PlanoPublicadoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function PlanoProvider({ inicial, children }: { inicial: PlanoPublicadoDto; children: React.ReactNode }) {
  const [vigente, setVigente] = useState<PlanoPublicadoDto>(inicial);

  // `useState` solo mira su valor inicial una vez: cuando el layout se repinta con otra versión (esta
  // u otra estación publicó), se adopta. La versión identifica el contenido.
  useEffect(() => {
    setVigente(inicial);
  }, [inicial.version]);

  // Publicar exige confirmar identidad (F2-04): si el servidor la pide, se pide y se reintenta.
  const conElevacion = useConElevacion();
  const publicar = useCallback(
    async (plano: PlanoLocalDto) => {
      const r = await conElevacion(() => publicarPlano({ plano, sobre: vigente.version }));
      if (r.ok) setVigente(r.valor);
      return r;
    },
    [conElevacion, vigente.version],
  );

  const valor = useMemo(() => ({ ...vigente, publicar }), [vigente, publicar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePlano(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("usePlano se usó fuera de PlanoProvider");
  return v;
}
