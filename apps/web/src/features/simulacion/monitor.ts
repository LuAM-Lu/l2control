/**
 * El monitor de sala alimentado por el simulador — F1-19.
 *
 * Construye la misma instantánea que devolverá el servidor
 * (`MonitorSnapshotDto`) a partir del estado simulado, y la pasa por el mismo
 * traductor que usa el monitor con datos reales. Por eso el monitor no
 * distingue una fuente de otra, que es el criterio de F1-19.
 */
import { toMonitorModel, type MonitorModel } from "../park/view-model.ts";
import type { Simulacion } from "./SimulacionProvider.tsx";

export function monitorSimulado(sim: Simulacion): MonitorModel | null {
  const esc = sim.escenario;
  if (!sim.activa || !esc) return null;
  return toMonitorModel({
    serverNow: new Date(sim.simNow).toISOString(),
    policy: esc.politica,
    rate: esc.tasa,
    sessions: [...sim.estado.sesiones],
    shiftLabel: `Simulación · ${esc.nombre}`,
  });
}
