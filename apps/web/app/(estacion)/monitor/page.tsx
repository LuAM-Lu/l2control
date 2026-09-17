import { ParkMonitor } from "../../../src/features/park/ParkMonitor";
import { demoSnapshot } from "../../../src/demo/parque";
import { toMonitorModel } from "../../../src/features/park/view-model";

/**
 * Monitor de parque (F5-08).
 *
 * Componente de SERVIDOR a propósito: aquí se establece `serverNow`, la
 * fuente de verdad del tiempo (ADR-010). El cliente solo interpola entre
 * latidos; nunca decide cuánto tiempo queda.
 *
 * `demoSnapshot` se sustituirá por la consulta real cuando exista el backend.
 * Devuelve exactamente la forma del contrato `MonitorSnapshotDto`, así que
 * ese cambio **no toca ninguna pantalla** (§11.4).
 *
 * TODO(F5-06/backend): la política publicada vendrá en ese mismo snapshot,
 * entregada por el servidor.
 */
export const dynamic = "force-dynamic";

export default function MonitorPage() {
  const snapshot = demoSnapshot(Date.now());
  return <ParkMonitor model={toMonitorModel(snapshot)} />;
}
