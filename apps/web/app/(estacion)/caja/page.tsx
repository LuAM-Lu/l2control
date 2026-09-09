import { CajaScreen } from "../../../src/features/cash/CajaScreen";
import {
  DEMO_IGTF_BASIS_POINTS,
  DEMO_LINES,
  DEMO_MAX_RETAINED,
  DEMO_TAX_RULES,
  DEMO_TENDERS,
} from "../../../src/features/cash/fixtures";

/**
 * Caja: cobro mixto, IGTF y vuelto (F4-03, F4-04b).
 *
 * La tasa se fija AQUÍ, en el servidor, y se congela para toda la
 * transacción (ADR-005). Si no hubiera tasa confirmada del día, se pasaría
 * `null` y la pantalla bloquearía el cobro en bolívares — fail-closed.
 */
export const dynamic = "force-dynamic";

export default function CajaPage() {
  return (
    <CajaScreen
      lines={DEMO_LINES}
      rules={DEMO_TAX_RULES}
      tenders={DEMO_TENDERS}
      igtfBasisPoints={DEMO_IGTF_BASIS_POINTS}
      maxRetained={DEMO_MAX_RETAINED}
      rate={{ from: "VES", to: "USD", numerator: 22841n, denominator: 100n }}
      serverNow={Date.now()}
    />
  );
}
