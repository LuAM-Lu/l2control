"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FamilyAccountSchema, type FamilyAccountDto } from "@l2/contracts";
import { DEMO_CUENTAS } from "./cuentas-fixtures.ts";

/**
 * Las cuentas de las familias, compartidas por las estaciones — DEC-21.
 *
 * Entrada abre la cuenta, salida la actualiza y caja la cierra: las tres
 * necesitan ver la misma. Mientras no hay backend, este proveedor hace de
 * servidor de juguete y guarda las cuentas en la sesión del navegador, para
 * que sobrevivan a una recarga y el flujo se pueda enseñar de punta a punta.
 *
 * TODO(F5-14/backend): se sustituye por las llamadas reales. Las pantallas no
 * cambian: siguen pidiendo `cuentas` y llamando a `guardar` (§11.4).
 *
 * Todo lo que entra se valida contra el contrato. Un dato guardado que ya no
 * lo cumple —de una versión anterior, manipulado— se DESCARTA entero: usar
 * una cuenta a medias es peor que empezar de los datos de ejemplo.
 */

const CLAVE = "l2:cuentas:v1";

type Valor = Readonly<{
  cuentas: readonly FamilyAccountDto[];
  /** Crea o sustituye una cuenta. Rechaza la que no cumpla el contrato. */
  guardar: (cuenta: FamilyAccountDto) => void;
}>;

const Contexto = createContext<Valor | null>(null);

export function CuentasProvider({ children }: { children: React.ReactNode }) {
  // Arranca con los datos de ejemplo, que son fijos: servidor y navegador
  // pintan lo mismo al hidratar. Lo guardado se carga después, en el efecto.
  const [cuentas, setCuentas] = useState<readonly FamilyAccountDto[]>(DEMO_CUENTAS);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = FamilyAccountSchema.array().safeParse(JSON.parse(crudo));
        if (r.success) setCuentas(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con los de ejemplo.
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.sessionStorage.setItem(CLAVE, JSON.stringify(cuentas));
    } catch {
      // Sin almacenamiento la sesión sigue funcionando en memoria.
    }
  }, [cuentas, cargado]);

  const guardar = useCallback((cuenta: FamilyAccountDto) => {
    const valida = FamilyAccountSchema.parse(cuenta);
    setCuentas((prev) =>
      prev.some((c) => c.id === valida.id)
        ? prev.map((c) => (c.id === valida.id ? valida : c))
        : [...prev, valida],
    );
  }, []);

  const valor = useMemo(() => ({ cuentas, guardar }), [cuentas, guardar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCuentas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useCuentas se usó fuera de CuentasProvider");
  return v;
}
