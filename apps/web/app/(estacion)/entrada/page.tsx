import { CheckInScreen } from "../../../src/features/park/CheckInScreen";

/**
 * Registro de entrada al parque (F5-02, F5-03, F5-04).
 *
 * El estado de sala —cuántos hay y qué pulseras están en uso— lo lee el layout del servidor
 * (B4-2) y la entrada lo vuelve a comprobar en el servidor al registrar: el aforo y las pulseras
 * activas no se deciden con lo que la pantalla crea recordar.
 */
export const dynamic = "force-dynamic";

export default function EntradaPage() {
  return <CheckInScreen />;
}
