import { TurnoScreen } from "../../../src/features/cash/TurnoScreen";
import { DEMO_EXCEPCIONES, DEMO_SHIFT_MOVEMENTS } from "../../../src/features/cash/shift-fixtures";

/**
 * Turno de caja: arqueo y cortes X/Z (F4-05 a F4-08).
 *
 * Los movimientos vienen del libro de pagos, que es append-only (§5.5): el
 * teórico de la gaveta no es un contador que alguien pueda ajustar, es la
 * suma de asientos que no se pueden editar.
 */
export const dynamic = "force-dynamic";

export default function TurnoPage() {
  return (
    <TurnoScreen
      movements={DEMO_SHIFT_MOVEMENTS}
      excepciones={DEMO_EXCEPCIONES}
      shiftLabel="Turno tarde"
      openedAt="14:00"
      cajero="M. Prieto"
    />
  );
}
