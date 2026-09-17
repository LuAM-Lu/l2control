import { CheckInScreen } from "../../../src/features/park/CheckInScreen";
import { DEMO_GUARDIANS, demoSnapshot } from "../../../src/demo/parque";

/**
 * Registro de entrada al parque (F5-02, F5-03, F5-04).
 *
 * Componente de servidor: aquí se resuelve el estado de sala —cuántos hay y
 * qué códigos de pulsera están en uso— antes de pintar. El aforo y el
 * rechazo de códigos ya activos se comprueban contra ese estado, no contra lo
 * que el cliente crea recordar.
 */
export const dynamic = "force-dynamic";

export default function EntradaPage() {
  const snapshot = demoSnapshot(Date.now());

  return (
    <CheckInScreen
      guardians={DEMO_GUARDIANS}
      activeSessions={snapshot.sessions.length}
      occupiedWristbands={snapshot.sessions.map((s) => s.wristbandCode)}
    />
  );
}
