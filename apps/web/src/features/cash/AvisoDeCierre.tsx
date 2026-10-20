"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Clock, DoorClosed } from "lucide-react";
import { Container } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { horaDelDia } from "../eventos/formato.ts";
import { abiertasEnElSalon } from "../mesas/mesas.ts";
import { usePedidos } from "../mesas/PedidosProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSala } from "../park/SalaProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { cierreDelDia, loQueFalta, pasadaLaHoraDeCierre } from "./turno.ts";

/**
 * Lo que falta para cerrar la caja (B5-7, M-40), contado con lo que ya tiene la pantalla: las cuentas en la cola, las del
 * salón que no han pedido la cuenta y los niños en la sala. El cierre lo lista entero (`PendientesDelCierre`).
 */
export function useLoQueFaltaParaCerrar(): Readonly<{ cola: number; salon: number; ninos: number }> {
  const { cuentas } = useCuentas();
  const { pedidos } = usePedidos();
  const { sala } = useSala();
  const { ajustes } = useSucursal();
  const ahora = useAhoraLocal();
  return useMemo(
    () => ({
      cola: cuentas.filter((c) => c.status === "POR_COBRAR").length,
      salon: abiertasEnElSalon(cuentas, pedidos, ahora, ajustes.atencionSinCuentaMin).length,
      ninos: sala?.sessions.length ?? 0,
    }),
    [cuentas, pedidos, sala, ahora, ajustes.atencionSinCuentaMin],
  );
}

/**
 * La caja sigue abierta pasada la hora de cierre del local (B5-7, M-40): desde esa hora y hasta que el día termina, la
 * caja lo dice arriba, con la hora, lo que falta y «Cerrar la caja». La de un día anterior tiene su propio aviso (B3-24).
 */
export function AvisoDeCierre() {
  const { ajustes } = useSucursal();
  const ahora = useAhoraLocal();
  const falta = useLoQueFaltaParaCerrar();
  if (!pasadaLaHoraDeCierre(ajustes, ahora)) return null;
  return (
    <Container ancho="muro" className="pt-3 bajo:pt-2">
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] border border-state-warn/40 bg-state-warn-bg px-4 py-2">
        <Clock className="size-(--icono-texto) shrink-0 text-state-warn" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-detalle text-ink-2">
          <span className="font-semibold text-ink">La caja sigue abierta: ciérrala antes de irte.</span>{" "}
          <span className="tnum">
            Son las {formatClock(ahora, ajustes.formatoHora, ajustes.zonaHoraria)} y el local cierra a las {horaDelDia(cierreDelDia(ajustes, ahora), ajustes.formatoHora)}.
          </span>{" "}
          {loQueFalta(falta)}
        </p>
        <Link
          href={"/turno?cerrar=1" as Route}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
        >
          <DoorClosed className="size-(--icono-texto)" aria-hidden="true" />
          Cerrar la caja
        </Link>
      </div>
    </Container>
  );
}
