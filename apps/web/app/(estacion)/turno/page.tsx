import { TurnoScreen } from "../../../src/features/cash/TurnoScreen";
import { DEMO_EXCEPCIONES, DEMO_SHIFT_MOVEMENTS } from "../../../src/demo/turno";
import { turnoDelEquipo } from "../../../src/features/cash/turno.servidor";

/**
 * Turno de caja: arqueo y cortes X/Z (F4-05 a F4-08).
 *
 * Los movimientos vienen del libro de pagos, que es append-only (§5.5): el
 * teórico de la gaveta no es un contador que alguien pueda ajustar, es la
 * suma de asientos que no se pueden editar.
 */
export const dynamic = "force-dynamic";

export default async function TurnoPage() {
  return (
    <TurnoScreen
      // El turno del equipo, del servidor (B3-1). Lo cobrado sale del libro con B3-5.
      turno={await turnoDelEquipo()}
      movements={DEMO_SHIFT_MOVEMENTS}
      excepciones={DEMO_EXCEPCIONES}
    />
  );
}
