import { CheckoutScreen } from "../../../src/features/park/CheckoutScreen";
import { demoSnapshot } from "../../../src/features/park/fixtures";

/**
 * Salida y liquidación del parque (F5-14).
 *
 * Componente de servidor: el instante del cierre lo fija el servidor
 * (ADR-010), no el dispositivo. Un reloj adelantado en la tablet de taquilla
 * no puede inventar minutos de excedente.
 */
export const dynamic = "force-dynamic";

export default function SalidaPage() {
  return <CheckoutScreen snapshot={demoSnapshot(Date.now())} />;
}
