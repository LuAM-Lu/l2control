import { CocinaScreen } from "../../../src/features/cocina/CocinaScreen";

/**
 * Cocina (KDS) — F6-07, DEC-19.
 *
 * Corre en una tablet colgada en cocina (DEC-19: es una página web, no hace
 * falta un tercer equipo fijo). Lo que ve llega por eventos —hoy del
 * simulador, mañana del servidor— y lo que hace sale igual; aquí solo se
 * entrega el umbral de espera.
 *
 * TODO(F6-07/backend): el umbral es configuración de la sucursal. Una cocina
 * de pizzas no espera lo mismo que una de cafés (§8.5).
 */
export default function CocinaPage() {
  return <CocinaScreen umbral={{ avisoMin: 8, gritaMin: 15 }} />;
}
