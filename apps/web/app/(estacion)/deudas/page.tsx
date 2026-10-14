import { DeudasScreen } from "../../../src/features/deudas/DeudasScreen";
import { deudasDelLocal } from "../../../src/features/deudas/deudas.servidor";
import { PersonalScreen } from "../../../src/features/personal/PersonalScreen";
import { valesDelPeriodo, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * Caja → Deudas (B3-11, M-33; B3-26, M-39): lo que dejaron sin pagar los clientes, para cobrarlo cuando vuelvan o darlo
 * por perdido, y lo del personal (`?vista=personal`): sus vales y adelantos de la quincena. Lee en el servidor; la
 * pantalla se relee sola cuando algo cambia.
 */
export const dynamic = "force-dynamic";

export default async function DeudasPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion & { vista?: string }> }) {
  const { vista, ...consulta } = await searchParams;
  if (vista === "personal") return <PersonalScreen {...await valesDelPeriodo(consulta)} />;
  return <DeudasScreen datos={await deudasDelLocal()} />;
}
