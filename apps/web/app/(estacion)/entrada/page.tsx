import { CheckInScreen } from "../../../src/features/park/CheckInScreen";
import { eventosDeHoy } from "../../../src/features/eventos/eventos.servidor";
import { RECIBEN_INVITADOS } from "../../../src/features/eventos/formato";
import { RefrescarAlCambiar } from "../../../src/features/operacion/RefrescarAlCambiar";

/**
 * Registro de entrada al parque (F5-02, F5-03, F5-04).
 *
 * El estado de sala —cuántos hay y qué pulseras están en uso— lo lee el layout del servidor
 * (B4-2) y la entrada lo vuelve a comprobar en el servidor al registrar: el aforo y las pulseras
 * activas no se deciden con lo que la pantalla crea recordar.
 */
export const dynamic = "force-dynamic";

export default async function EntradaPage() {
  // Los cumpleaños de hoy con el anticipo cobrado: sus invitados entran por aquí, sin paquete (B10-2).
  const eventos = await eventosDeHoy();
  return (
    <>
      <RefrescarAlCambiar temas={["eventos"]} />
      {/* Los que reciben invitados y no han terminado: uno que ya acabó no se ofrece. */}
      <CheckInScreen cumpleanos={(eventos?.reservas ?? []).filter((r) => RECIBEN_INVITADOS.includes(r.estado) && r.fin > eventos!.ahora)} />
    </>
  );
}
