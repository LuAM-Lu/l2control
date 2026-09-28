"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Rechazo, Resultado, VentaCerradaDto } from "@l2/contracts";
import { imprimirVenta, leerVentas } from "./ventas.acciones";

/**
 * Las ventas del turno de este equipo — UX-MEJORAS §9 (C12), en el servidor desde B3-4.
 *
 * Cada cobro deja su venta en el servidor, en la misma transacción. Aquí se adopta la que devuelve el
 * cobro o la anulación, y se vuelve a leer al volver el foco. Imprimir se anota en el servidor antes
 * de sacar el papel: la primera impresión es el original y las demás, copias (§5.4). Nada se guarda
 * en el navegador.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se anotó la impresión." };

type Valor = Readonly<{
  /** De la más reciente a la más antigua. */
  ventas: readonly VentaCerradaDto[];
  /** Sustituye o añade la venta que devolvió el servidor (un cobro, una anulación). */
  adoptar: (venta: VentaCerradaDto) => void;
  /** Anota una impresión en el servidor y adopta la venta como quedó. */
  imprimir: (id: string) => Promise<Resultado<VentaCerradaDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

const ordenar = (lista: readonly VentaCerradaDto[]) => [...lista].sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));

export function VentasProvider({ inicial, children }: { inicial: readonly VentaCerradaDto[]; children: React.ReactNode }) {
  const [ventas, setVentas] = useState<readonly VentaCerradaDto[]>(inicial);

  // Cuando el layout se vuelve a pintar con otras ventas (se navegó), se adoptan.
  const huella = JSON.stringify(inicial);
  useEffect(() => {
    setVentas(inicial);
  }, [huella]);

  // Al volver el foco se leen otra vez: otra pestaña de este equipo pudo cobrar o anular.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      void leerVentas()
        .then((r) => {
          if (r.ok) setVentas(r.valor.ventas);
        })
        .catch(() => undefined);
    };
    window.addEventListener("focus", alVolver);
    return () => window.removeEventListener("focus", alVolver);
  }, []);

  const adoptar = useCallback((venta: VentaCerradaDto) => {
    setVentas((prev) => (prev.some((v) => v.id === venta.id) ? prev.map((v) => (v.id === venta.id ? venta : v)) : [venta, ...prev]));
  }, []);

  const imprimir = useCallback(
    async (id: string) => {
      const r = await imprimirVenta({ saleId: id }).catch(() => sinConexion);
      if (r.ok) adoptar(r.valor);
      return r;
    },
    [adoptar],
  );

  const ordenadas = useMemo(() => ordenar(ventas), [ventas]);
  const valor = useMemo(() => ({ ventas: ordenadas, adoptar, imprimir }), [ordenadas, adoptar, imprimir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useVentas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useVentas se usó fuera de VentasProvider");
  return v;
}
