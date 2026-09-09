import { ParkMonitor } from "../../src/features/park/ParkMonitor";
import { DEMO_CAPACITY_LIMIT, DEMO_POLICY, demoSessions } from "../../src/features/park/data";
import { toCardModel } from "../../src/features/park/view-model";

/**
 * Monitor de parque (F5-08).
 *
 * Componente de SERVIDOR a propósito: aquí se establece `serverNow`, que es
 * la fuente de verdad del tiempo (ADR-010). El cliente solo interpola entre
 * latidos; nunca decide cuánto tiempo queda.
 */
export const dynamic = "force-dynamic";

export default function MonitorPage() {
  const serverNow = Date.now();
  const sessions = demoSessions(serverNow);
  const models = sessions.map((s) => toCardModel(s, DEMO_POLICY, serverNow));

  return (
    <ParkMonitor
      models={models}
      serverNow={serverNow}
      capacityLimit={DEMO_CAPACITY_LIMIT}
      rateValue="228,41"
      rateCapturedAt="08:00"
      shiftLabel="Turno tarde · abierto 14:00"
    />
  );
}
