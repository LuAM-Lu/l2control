"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PlanoLocalSchema, type PlanoLocalDto } from "@l2/contracts";

/**
 * El plano del local publicado — V4 (UX-MEJORAS §2.2).
 *
 * Vive por encima de las dos cáscaras porque lo escribe el back-office (el
 * editor, solo administración) y lo lee la estación (el mesero). **Solo se
 * guarda lo PUBLICADO**: el borrador del editor no sale de su pantalla, para
 * que nadie vea media reforma a mitad de servicio.
 *
 * TODO(F6-01/backend): el servidor guardará cada publicación como una versión
 * con fecha, y el servicio recibirá la nueva por tiempo real. La forma ya es
 * la definitiva: las pantallas piden `plano` y llaman a `publicar`.
 */

const CLAVE = "l2:plano:v1";

type Valor = Readonly<{
  plano: PlanoLocalDto;
  /** Sustituye el plano en servicio. Lanza si no cumple el contrato. */
  publicar: (plano: PlanoLocalDto) => void;
}>;

const Contexto = createContext<Valor | null>(null);

export function PlanoProvider({ inicial, children }: { inicial: PlanoLocalDto; children: React.ReactNode }) {
  const [plano, setPlano] = useState<PlanoLocalDto>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = PlanoLocalSchema.safeParse(JSON.parse(crudo));
        if (r.success) setPlano(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con el plano inicial.
    }
    setCargado(true);
  }, []);

  const publicar = useCallback((nuevo: PlanoLocalDto) => {
    const valido = PlanoLocalSchema.parse(nuevo);
    setPlano(valido);
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(valido));
    } catch {
      // Sin almacenamiento, el plano vive en memoria hasta recargar.
    }
  }, []);

  const valor = useMemo(() => ({ plano, publicar }), [plano, publicar]);
  // `cargado` no cambia lo que se pinta: el plano inicial y el guardado tienen
  // la misma forma, y así servidor y navegador coinciden al hidratar.
  void cargado;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function usePlano(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("usePlano se usó fuera de PlanoProvider");
  return v;
}
