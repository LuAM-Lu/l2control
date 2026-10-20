import { CierreDelParqueScreen } from "../../../../src/features/park/CierreDelParque";
import { cierreDelParque } from "../../../../src/features/park/parque.servidor";

/**
 * El cierre del parque (B4-21, M-40): la jornada de la monitora de hoy, sin montos. Se ve en cualquier momento como un
 * corte del momento; el PDF de cierre, con la sala en cero. Quién puede verlo lo decide el caso de uso (`parque.checkIn`).
 */
export const dynamic = "force-dynamic";

export default async function CierreDelParquePage() {
  return <CierreDelParqueScreen inicial={await cierreDelParque()} />;
}
