"use client";

import { useEffect, useRef } from "react";
import { avisar } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { avisosDelSalon } from "./mesas.ts";
import { usePedidos } from "./PedidosProvider.tsx";
import { usePlano } from "./PlanoProvider.tsx";

/**
 * Los avisos suaves del salón (B6-14, M-35): sin sonido, uno por mesa y por umbral, a quien le toca (`para`). Lo que ya
 * pasaba al abrir la pantalla se da por visto: está en «Atender» y en la cola. Los umbrales, en Ajustes → Sucursal.
 * No pinta nada.
 */
export function AvisosDelSalon({ para, porLimpiar }: { para: "SALON" | "CAJA"; porLimpiar: ReadonlyMap<string, string> }) {
  const { cuentas } = useCuentas();
  const { pedidos } = usePedidos();
  const { plano } = usePlano();
  const { atencionSinPedirMin, atencionEsperaMin, atencionCuentaMin, atencionLimpiarMin } = useSucursal().ajustes;
  const ahora = useAhoraLocal();
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (ahora <= 0) return;
    const avisos = avisosDelSalon(para, { cuentas, pedidos, plano: plano?.tables ?? [], porLimpiar }, ahora, {
      sinPedirMin: atencionSinPedirMin,
      esperaMin: atencionEsperaMin,
      cuentaMin: atencionCuentaMin,
      limpiarMin: atencionLimpiarMin,
    });
    if (vistos.current === null) {
      vistos.current = new Set(avisos.map((a) => a.clave));
      return;
    }
    for (const a of avisos) {
      if (vistos.current.has(a.clave)) continue;
      vistos.current.add(a.clave);
      avisar.info(a.texto, { detalle: a.detalle });
    }
  }, [para, cuentas, pedidos, plano, porLimpiar, ahora, atencionSinPedirMin, atencionEsperaMin, atencionCuentaMin, atencionLimpiarMin]);
  return null;
}
