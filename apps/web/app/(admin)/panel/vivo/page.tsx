import { VivoScreen } from "../../../../src/features/shell/VivoScreen";
import { demoSnapshot } from "../../../../src/demo/parque";

/**
 * El local ahora mismo — F9-08, paso 5 de DEC-22.
 *
 * Solo lee: lo que ve llega por los eventos de la operación, así que aquí solo
 * se entregan la política del parque y el umbral de espera de cocina.
 *
 * TODO(F9-08/backend): política, umbral y estado del turno vendrán de la
 * configuración de la sucursal y del servidor, por tiempo real (ADR-008).
 */
export const dynamic = "force-dynamic";

export default function VivoPage() {
  return (
    <VivoScreen
      politica={demoSnapshot(Date.now()).policy}
      umbral={{ avisoMin: 8, gritaMin: 15 }}
      enServicio
    />
  );
}
