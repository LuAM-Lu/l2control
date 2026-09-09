import { CheckInScreen } from "../../src/features/park/CheckInScreen";
import { DEMO_GUARDIANS, DEMO_PACKAGES, demoSnapshot } from "../../src/features/park/fixtures";

/**
 * Registro de entrada al parque (F5-02, F5-03, F5-04).
 *
 * Componente de servidor: aquí se resuelve el estado de sala —cuántos hay y
 * qué pulseras están ocupadas— antes de pintar. El aforo y la reutilización
 * de pulseras se comprueban contra ese estado, no contra lo que el cliente
 * crea recordar.
 */
export const dynamic = "force-dynamic";

export default function EntradaPage() {
  const snapshot = demoSnapshot(Date.now());

  return (
    <CheckInScreen
      packages={DEMO_PACKAGES}
      guardians={DEMO_GUARDIANS}
      activeSessions={snapshot.sessions.length}
      capacityLimit={snapshot.policy.capacityLimit}
      occupiedWristbands={snapshot.sessions.map((s) => s.wristbandCode)}
    />
  );
}
