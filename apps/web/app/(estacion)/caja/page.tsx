import { CajaScreen } from "../../../src/features/cash/CajaScreen";
import {
  DEMO_IGTF_BASIS_POINTS,
  DEMO_MAX_RETAINED,
  DEMO_TAX_RULES,
  DEMO_TENDERS,
  DEMO_TERMINALES,
} from "../../../src/demo/caja";
import { demoSnapshot } from "../../../src/demo/parque";

/**
 * Caja: cola de cuentas por cobrar y cobro mixto (F4-03, F4-04b, DEC-21).
 *
 * `?cuenta=` elige la cuenta que llega desde la entrada o la salida, y
 * `?volver=` dice a qué pantalla regresar al cobrar. La caja solo acepta
 * rutas de vuelta que conoce: nada de redirecciones abiertas.
 *
 * La tasa se fija AQUÍ, en el servidor, y se congela para toda la
 * transacción (ADR-005). Sin tasa confirmada se pasaría `null` y la pantalla
 * bloquearía el cobro en bolívares — fail-closed.
 */
export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; volver?: string }>;
}) {
  const { cuenta, volver } = await searchParams;
  // Pulsera → estancia, para abrir una cuenta pasando la pulsera por el lector.
  // TODO(F4-03/backend): lo resuelve el servidor a partir del código.
  const pulseras = Object.fromEntries(demoSnapshot(Date.now()).sessions.map((s) => [s.wristbandCode, s.id]));
  return (
    <CajaScreen
      cuentaInicial={cuenta ?? null}
      volver={volver ?? null}
      pulseras={pulseras}
      rules={DEMO_TAX_RULES}
      tenders={DEMO_TENDERS}
      terminales={DEMO_TERMINALES}
      igtfBasisPoints={DEMO_IGTF_BASIS_POINTS}
      maxRetained={DEMO_MAX_RETAINED}
      rate={{ from: "VES", to: "USD", numerator: 22841n, denominator: 100n }}
      // TODO(F2-12/backend): el punto sale del registro del dispositivo. El
      // equipo de caja es el del mostrador.
      puntoDeCobro="MOSTRADOR"
      serverNow={Date.now()}
    />
  );
}
