import { VentasScreen } from "../../../src/features/cash/VentasScreen";
import { DEMO_USUARIOS } from "../../../src/demo/usuarios";

/**
 * Ventas del turno — UX-MEJORAS §9 (C12).
 *
 * Los cobros cerrados con la foto de su recibo, para reimprimir (como copia,
 * con rastro) o enviar por WhatsApp. Anular un cobro (DEC-24) llega aquí.
 */
export default function VentasPage() {
  // TODO(F2-11/backend): el directorio de personas sale del servidor.
  return <VentasScreen usuarios={DEMO_USUARIOS} />;
}
