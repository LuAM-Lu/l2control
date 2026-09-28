import { CajaScreen } from "../../../src/features/cash/CajaScreen";
import { impuestosDelLocal } from "../../../src/features/cash/impuestos.servidor";
import { turnoDelEquipo } from "../../../src/features/cash/turno.servidor";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";

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
  return (
    <CajaScreen
      cuentaInicial={cuenta ?? null}
      volver={volver ?? null}
      // Las alícuotas, de la base con su vigencia (B2-2): la caja elige las del instante.
      impuestos={await impuestosDelLocal()}
      // El catálogo de productos con sus precios con vigencia (B9-1): la carta de mostrador.
      catalogo={await catalogoDelLocal()}
      // El turno del equipo (B3-1): sin él no se cobra, y su equipo es el punto de cobro.
      turno={await turnoDelEquipo()}
      serverNow={Date.now()}
    />
  );
}
