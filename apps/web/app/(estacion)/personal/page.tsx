import { PersonalScreen } from "../../../src/features/personal/PersonalScreen";
import { valesDelPeriodo, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * Caja → Personal (B3-17, M-37): los vales del consumo del personal de la quincena de la dirección. Lee en el servidor;
 * a quien no ve los de todos, la pantalla le ofrece ver los suyos con su PIN.
 */
export const dynamic = "force-dynamic";

export default async function PersonalPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  return <PersonalScreen {...await valesDelPeriodo(await searchParams)} />;
}
