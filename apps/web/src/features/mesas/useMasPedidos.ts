"use client";

import { useEffect, useState } from "react";
import type { MasPedidosDto } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerMasPedidos } from "./pedidos.acciones";

/**
 * «Lo más pedido hoy» (B6-23, M-40), para la carta del mesero y la venta directa de la caja: se lee al abrir y cuando
 * entra un pedido. Sin él (sin conexión o sin permiso), `null`: la carta se abre en su primera categoría.
 */
export function useMasPedidos(): MasPedidosDto | null {
  const [mas, setMas] = useState<MasPedidosDto | null>(null);
  const leer = () => {
    void leerMasPedidos()
      .then((r) => r.ok && setMas(r.valor))
      .catch(() => undefined);
  };
  useEffect(leer, []);
  useAlCambiar(["pedidos"], leer);
  return mas;
}
