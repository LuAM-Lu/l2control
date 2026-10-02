"use client";

import { useCallback, useRef, useState } from "react";
import type { Resultado } from "@l2/contracts";

/**
 * Una lista que se lee por páginas del servidor (M-17): la consulta (página, cuántas por página y los
 * filtros), lo último que respondió el servidor, si está leyendo y el error, que se enseña (nunca una
 * lista vacía en su lugar). Cambiar un filtro vuelve a la primera página; cambiar de página, no. Solo
 * cuenta la última lectura: dos cambios seguidos no se pisan.
 */
export function usePaginas<Q extends { pagina: number }, D extends { pagina: number }>(
  leer: (q: Q) => Promise<Resultado<D>>,
  inicial: D | null,
  consultaInicial: Q,
) {
  const [datos, setDatos] = useState<D | null>(inicial);
  const [consulta, setConsulta] = useState<Q>(consultaInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(inicial ? null : "No se pudo leer la lista.");
  const turno = useRef(0);
  const actual = useRef(consulta);
  actual.current = consulta;

  const ir = useCallback(
    async (q: Q) => {
      const mio = ++turno.current;
      setCargando(true);
      const r = await leer(q).catch(() => null);
      if (mio !== turno.current) return;
      setCargando(false);
      if (!r) setError("Sin conexión con el servidor.");
      else if (!r.ok) setError(r.mensaje);
      else {
        setError(null);
        setDatos(r.valor);
        // El servidor ajusta la página si ya no existe.
        if (r.valor.pagina !== q.pagina) setConsulta((c) => ({ ...c, pagina: r.valor.pagina }));
      }
    },
    [leer],
  );

  const cambiar = useCallback(
    (cambio: Partial<Q>) => {
      const q = { ...actual.current, ...("pagina" in cambio ? {} : { pagina: 1 }), ...cambio } as Q;
      setConsulta(q);
      void ir(q);
    },
    [ir],
  );
  const releer = useCallback(() => ir(actual.current), [ir]);

  return { datos, consulta, cargando, error, cambiar, releer } as const;
}
