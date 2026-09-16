"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MenuSchema, type MenuDto } from "@l2/contracts";

/**
 * La carta publicada — F6-03.
 *
 * Vive por encima de las dos cáscaras, igual que el plano: la escribe el
 * back-office (el editor, solo administración) y la lee la estación (el
 * mesero). **Solo se guarda lo PUBLICADO**: el borrador del editor no sale de
 * su pantalla, para que nadie vea un precio a medio cambiar.
 *
 * TODO(F6-03/backend): la carta vendrá de la configuración de la sucursal, con
 * cada publicación guardada como versión, y llegará al salón por tiempo real.
 * La forma ya es la del contrato: las pantallas piden `carta` y llaman a
 * `publicar`.
 */

const CLAVE = "l2:carta:v1";

type Valor = Readonly<{
  carta: MenuDto;
  /** Sustituye la carta en servicio. Lanza si no cumple el contrato. */
  publicar: (carta: MenuDto) => void;
}>;

const Contexto = createContext<Valor | null>(null);

export function CartaProvider({ inicial, children }: { inicial: MenuDto; children: React.ReactNode }) {
  const [carta, setCarta] = useState<MenuDto>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = MenuSchema.safeParse(JSON.parse(crudo));
        if (r.success) setCarta(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con la inicial.
    }
    setCargado(true);
  }, []);

  const publicar = useCallback((nuevo: MenuDto) => {
    const valido = MenuSchema.parse(nuevo);
    setCarta(valido);
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(valido));
    } catch {
      // Sin almacenamiento, la carta vive en memoria hasta recargar.
    }
  }, []);

  const valor = useMemo(() => ({ carta, publicar }), [carta, publicar]);
  // `cargado` no cambia lo que se pinta: la carta inicial y la guardada tienen
  // la misma forma, y así servidor y navegador coinciden al hidratar.
  void cargado;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarta(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useCarta se usó fuera de CartaProvider");
  return v;
}
