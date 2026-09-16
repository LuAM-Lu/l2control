import { MesasScreen } from "../../../src/features/mesas/MesasScreen";

/**
 * Estación del mesero: plano de mesas y pedidos (F6-01…F6-05, DEC-22).
 *
 * El estado vivo —qué mesa está ocupada, qué pidió— llega por eventos (hoy
 * del simulador).
 */
export default function MesasPage() {
  return <MesasScreen />;
}
