import { MesasScreen } from "../../../src/features/mesas/MesasScreen";
import { CARTA_DEMO, PLANO_DEMO } from "../../../src/features/mesas/plano";

/**
 * Estación del mesero: plano de mesas y pedidos (F6-01…F6-05, DEC-22).
 *
 * El estado vivo —qué mesa está ocupada, qué pidió— llega por eventos (hoy
 * del simulador). Aquí solo se entregan el plano y la carta.
 * TODO(F6-01/F6-03, backend): vendrán de la configuración de la sucursal; la
 * forma ya es la del contrato.
 */
export default function MesasPage() {
  return <MesasScreen plano={PLANO_DEMO} carta={CARTA_DEMO} />;
}
