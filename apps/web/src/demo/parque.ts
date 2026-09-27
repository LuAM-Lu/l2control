/**
 * El parque hasta que tenga servidor (B4-1 y B4-2): **vacío**, no inventado.
 *
 * Hasta el 2026-09-26 aquí había niños, pulseras y familias de ejemplo. Se quitaron a pedido del
 * cliente: una sala con niños que no existen confunde más de lo que enseña, y una pantalla vacía
 * dice la verdad (hoy nadie ha entrado por el sistema). La forma se sigue validando contra el
 * contrato, así que las pantallas ya consumen la definitiva y el paso B4-2 solo cambia la fuente
 * y borra este archivo.
 */
import {
  GuardianSchema,
  MonitorSnapshotSchema,
  type GuardianDto,
  type MonitorSnapshotDto,
  type ParkPolicyDto,
} from "@l2/contracts";

/** Representantes conocidos para la búsqueda de la entrada (F5-03). Ninguno hasta B4-1. */
export const DEMO_GUARDIANS: (GuardianDto & { id: string })[] = GuardianSchema.array()
  .parse([])
  .map((g, i) => ({ ...g, id: `g${i}` }));

/**
 * La sala: vacía hasta B4-2. La política YA es la publicada (la pasa la ruta desde el tarifario
 * vigente). `serverNow` entra como argumento, sin leer el reloj aquí (ADR-010).
 */
export function demoSnapshot(serverNow: number, policy: ParkPolicyDto): MonitorSnapshotDto {
  return MonitorSnapshotSchema.parse({
    serverNow: new Date(serverNow).toISOString(),
    // El turno real llega con B3-1; no se inventa uno.
    shiftLabel: "Sin turno abierto",
    policy,
    // La tasa es de la base (B2-1): quien la necesita la lee de `TasasProvider`.
    rate: null,
    sessions: [],
  });
}
