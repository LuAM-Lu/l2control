"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AjustesSucursalSchema, type AjustesSucursalDto } from "@l2/contracts";

/**
 * Los ajustes de la sucursal — F2-03, F5-08b, F4-04c y F6-13 (D8).
 *
 * Vive por encima de las dos cáscaras. Lo escribe el back-office (el editor)
 * y lo lee la estación (caja, monitores).
 * **Solo se guarda lo PUBLICADO**: el borrador del editor no sale de
 * su pantalla.
 *
 * TODO(F2-03/backend): los ajustes vendrán de la base de datos,
 * y llegarán al parque por tiempo real.
 */

const CLAVE = "l2:sucursal:v1";

type Valor = Readonly<{
  ajustes: AjustesSucursalDto;
  /** Sustituye los ajustes en servicio. Lanza si no cumple el contrato. */
  publicar: (ajustes: AjustesSucursalDto) => void;
}>;

const Contexto = createContext<Valor | null>(null);

export function SucursalProvider({ inicial, children }: { inicial: AjustesSucursalDto; children: React.ReactNode }) {
  const [ajustes, setAjustes] = useState<AjustesSucursalDto>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = AjustesSucursalSchema.safeParse(JSON.parse(crudo));
        if (r.success) setAjustes(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con el inicial.
    }
    setCargado(true);
  }, []);

  const publicar = useCallback((nuevo: AjustesSucursalDto) => {
    const valido = AjustesSucursalSchema.parse(nuevo);
    setAjustes(valido);
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(valido));
    } catch {
      // Sin almacenamiento, los ajustes viven en memoria hasta recargar.
    }
  }, []);

  const valor = useMemo(() => ({ ajustes, publicar }), [ajustes, publicar]);
  // `cargado` no cambia lo que se pinta: el inicial y el guardado tienen
  // la misma forma, y así servidor y navegador coinciden al hidratar.
  void cargado;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSucursal(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useSucursal se usó fuera de SucursalProvider");
  return v;
}
