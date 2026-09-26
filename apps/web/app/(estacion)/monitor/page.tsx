import { ParkMonitor } from "../../../src/features/park/ParkMonitor";
import { demoSnapshot } from "../../../src/demo/parque";
import { toMonitorModel } from "../../../src/features/park/view-model";
import { tarifarioVigente } from "../../../src/features/park/tarifario.servidor";

/**
 * Monitor de parque (F5-08).
 *
 * Componente de SERVIDOR a propósito: aquí se establece `serverNow`, la
 * fuente de verdad del tiempo (ADR-010). El cliente solo interpola entre
 * latidos; nunca decide cuánto tiempo queda.
 *
 * Las estancias son todavía de ejemplo (`demoSnapshot`) y se van con B4; la
 * política ya es la publicada en el tarifario vigente. Tiene exactamente la
 * forma del contrato `MonitorSnapshotDto`, así que ese cambio **no toca
 * ninguna pantalla** (§11.4).
 */
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const { tarifario } = await tarifarioVigente();
  const snapshot = demoSnapshot(Date.now(), tarifario.policy);
  return <ParkMonitor model={toMonitorModel(snapshot)} />;
}
