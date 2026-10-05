import { PapelScreen } from "../../../src/features/papel/PapelScreen";
import { cargasDePapel } from "../../../src/features/papel/papel.servidor";

/**
 * La carga de lo anotado en papel (B3-7, V-12, ADR-027): lo que se anotó en formularios cuando cayeron los dos
 * enlaces, cargado en el turno de esta caja y revisado por supervisión antes del Z.
 */
export const dynamic = "force-dynamic";

export default async function PapelPage() {
  return <PapelScreen datos={await cargasDePapel()} />;
}
