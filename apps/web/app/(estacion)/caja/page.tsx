import { CajaScreen } from "../../../src/features/cash/CajaScreen";
import { impuestosDelLocal } from "../../../src/features/cash/impuestos.servidor";
import { turnoDelEquipo } from "../../../src/features/cash/turno.servidor";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";
import { ModoPapel } from "../../../src/features/papel/ModoPapel";
import { SinCargaAbierta } from "../../../src/features/papel/SinCargaAbierta";
import { cargaParaCargar } from "../../../src/features/papel/papel.servidor";

/**
 * Caja: cola de cuentas por cobrar y cobro mixto (F4-03, F4-04b, DEC-21).
 *
 * `?cuenta=` elige la cuenta que llega desde la entrada o la salida, y
 * `?volver=` dice a qué pantalla regresar al cobrar. La caja solo acepta
 * rutas de vuelta que conoce: nada de redirecciones abiertas.
 *
 * `?papel=` es la carga de lo anotado en papel en la que se cobra (B3-7, ADR-027): la misma caja, con la hora
 * real del formulario en cada cobro. Si esa carga no existe, ya se terminó o es de otro turno, la caja de
 * papel no se abre: nunca se cae al cobro de ahora por descuido.
 *
 * La tasa se fija AQUÍ, en el servidor, y se congela para toda la
 * transacción (ADR-005). Sin tasa confirmada se pasaría `null` y la pantalla
 * bloquearía el cobro en bolívares — fail-closed.
 */
export const dynamic = "force-dynamic";

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string; volver?: string; papel?: string }>;
}) {
  const { cuenta, volver, papel } = await searchParams;
  const carga = papel ? await cargaParaCargar(papel) : null;
  if (papel && !carga) return <SinCargaAbierta />;

  const caja = (
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
  return carga ? <ModoPapel carga={carga}>{caja}</ModoPapel> : caja;
}
