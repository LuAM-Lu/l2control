import { DeudasScreen } from "../../../src/features/deudas/DeudasScreen";
import { deudasDelLocal } from "../../../src/features/deudas/deudas.servidor";

/**
 * Caja → Deudas (B3-11, M-33): lo que dejaron sin pagar quienes se fueron, para cobrarlo cuando vuelvan o darlo por
 * perdido. Lee en el servidor; la pantalla se relee sola cuando algo cambia.
 */
export const dynamic = "force-dynamic";

export default async function DeudasPage() {
  return <DeudasScreen datos={await deudasDelLocal()} />;
}
