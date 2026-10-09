"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MesasPorLimpiarDto, Rechazo, Resultado } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerMesasPorLimpiar, marcarMesaLimpia } from "./mesas.acciones.ts";

/**
 * Las mesas por limpiar (B6-14, M-35), del servidor: se leen al abrir la pantalla y otra vez cuando el canal dice que
 * cambiaron las mesas o las cuentas (una cuenta que se cierra deja su mesa por limpiar). Nada de sondeos.
 */
export function usePorLimpiar(): {
  mesas: MesasPorLimpiarDto["mesas"];
  /** Por mesa, desde cuándo está por limpiar. */
  porId: ReadonlyMap<string, string>;
  marcarLimpia: (tableId: string) => Promise<Resultado<MesasPorLimpiarDto>>;
} {
  const [mesas, setMesas] = useState<MesasPorLimpiarDto["mesas"]>([]);
  const leer = useCallback(() => {
    void leerMesasPorLimpiar()
      .then((r) => {
        if (r.ok) setMesas(r.valor.mesas);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => leer(), [leer]);
  useAlCambiar(["mesas", "cuentas"], leer);
  const marcarLimpia = useCallback(async (tableId: string) => {
    const r = await marcarMesaLimpia({ tableId }).catch((): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la mesa sigue por limpiar." }));
    if (r.ok) setMesas(r.valor.mesas);
    return r;
  }, []);
  const porId = useMemo(() => new Map(mesas.map((m) => [m.tableId, m.desde])), [mesas]);
  return { mesas, porId, marcarLimpia };
}
