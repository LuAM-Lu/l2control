import { ParkMonitor } from "../../../src/features/park/ParkMonitor";

/**
 * Monitor de parque (F5-08).
 *
 * La sala es del servidor (B4-2): el layout la lee con su hora (`serverNow`, ADR-010) y
 * `SalaProvider` la vuelve a preguntar cada 5 s. El cliente solo interpola entre latidos; nunca
 * decide cuánto tiempo queda.
 */
export const dynamic = "force-dynamic";

export default function MonitorPage() {
  return <ParkMonitor />;
}
