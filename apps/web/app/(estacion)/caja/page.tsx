import { CajaScreen } from "../../../src/features/cash/CajaScreen";
import { demoSnapshot } from "../../../src/demo/parque";
import { DEMO_USUARIOS } from "../../../src/demo/usuarios";
import { tarifarioVigente } from "../../../src/features/park/tarifario.servidor";
import { impuestosDelLocal } from "../../../src/features/cash/impuestos.servidor";

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
  const pulseras = Object.fromEntries(demoSnapshot(Date.now(), (await tarifarioVigente()).tarifario.policy).sessions.map((s) => [s.wristbandCode, s.id]));
  return (
    <CajaScreen
      cuentaInicial={cuenta ?? null}
      volver={volver ?? null}
      pulseras={pulseras}
      // Las alícuotas, de la base con su vigencia (B2-2): la caja elige las del instante.
      impuestos={await impuestosDelLocal()}
      // TODO(F2-12/backend): el punto sale del registro del dispositivo. El
      // equipo de caja es el del mostrador.
      puntoDeCobro="MOSTRADOR"
      serverNow={Date.now()}
      usuarios={DEMO_USUARIOS}
    />
  );
}
