"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TarifarioSchema, type TarifarioDto } from "@l2/contracts";

/**
 * El tarifario publicado — F5-04, F5-06.
 *
 * Vive por encima de las dos cáscaras: lo escribe el
 * back-office (el editor, solo administración) y lo lee la estación (la entrada).
 * **Solo se guarda lo PUBLICADO**: el borrador del editor no sale de
 * su pantalla.
 *
 * TODO(F5-06/backend): el tarifario vendrá de la configuración, con
 * cada publicación guardada como versión, y llegará al parque por tiempo real.
 * La forma ya es la del contrato: las pantallas piden `tarifario` y llaman a
 * `publicar`.
 */

const CLAVE = "l2:tarifario:v1";

type Valor = Readonly<{
  tarifario: TarifarioDto;
  /** Sustituye el tarifario en servicio. Lanza si no cumple el contrato. */
  publicar: (tarifario: TarifarioDto) => void;
}>;

const Contexto = createContext<Valor | null>(null);

export function TarifarioProvider({ inicial, children }: { inicial: TarifarioDto; children: React.ReactNode }) {
  const [tarifario, setTarifario] = useState<TarifarioDto>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = TarifarioSchema.safeParse(JSON.parse(crudo));
        if (r.success) setTarifario(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con el inicial.
    }
    setCargado(true);
  }, []);

  const publicar = useCallback((nuevo: TarifarioDto) => {
    const valido = TarifarioSchema.parse(nuevo);
    setTarifario(valido);
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(valido));
    } catch {
      // Sin almacenamiento, el tarifario vive en memoria hasta recargar.
    }
  }, []);

  const valor = useMemo(() => ({ tarifario, publicar }), [tarifario, publicar]);
  // `cargado` no cambia lo que se pinta: el inicial y el guardado tienen
  // la misma forma, y así servidor y navegador coinciden al hidratar.
  void cargado;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTarifario(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTarifario se usó fuera de TarifarioProvider");
  return v;
}
