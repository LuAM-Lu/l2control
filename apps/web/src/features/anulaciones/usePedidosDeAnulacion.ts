"use client";

import { useEffect, useState } from "react";
import type { AnulacionPedidaDto } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerAnulacionesPedidas } from "./anulaciones.acciones";

/**
 * Los pedidos de anulación de la sucursal (B3-30, M-40), en vivo: se leen al abrir y cuando cambian las ventas (pedir,
 * aprobar, rechazar o hacer una anulación). `porVenta`: el más reciente de cada venta. Sin permiso, ninguno.
 */
export function usePedidosDeAnulacion(activo = true): Readonly<{ pedidas: readonly AnulacionPedidaDto[]; porVenta: ReadonlyMap<string, AnulacionPedidaDto>; releer: () => void }> {
  const [pedidas, setPedidas] = useState<readonly AnulacionPedidaDto[]>([]);
  const releer = () => {
    if (!activo) return;
    void leerAnulacionesPedidas()
      .then((r) => r.ok && setPedidas(r.valor.pedidas))
      .catch(() => undefined);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(releer, [activo]);
  useAlCambiar(["ventas"], releer);
  const porVenta = new Map<string, AnulacionPedidaDto>();
  // Vienen del más reciente al más viejo: el primero de cada venta es el que vale.
  for (const p of pedidas) if (!porVenta.has(p.ventaId)) porVenta.set(p.ventaId, p);
  return { pedidas, porVenta, releer };
}
