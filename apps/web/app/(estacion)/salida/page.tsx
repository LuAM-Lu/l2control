import { CheckoutScreen } from "../../../src/features/park/CheckoutScreen";
import { demoSnapshot } from "../../../src/features/park/fixtures";

/**
 * Salida y liquidación del parque (F5-14).
 *
 * `?pulsera=` llega desde la ficha del niño en el monitor y lo deja elegido.
 * Es un dato de la URL: la pantalla lo valida con el mismo contrato que un
 * escaneo antes de usarlo.
 */
export const dynamic = "force-dynamic";

export default async function SalidaPage({
  searchParams,
}: {
  searchParams: Promise<{ pulsera?: string }>;
}) {
  const { pulsera } = await searchParams;
  return <CheckoutScreen snapshot={demoSnapshot(Date.now())} pulseraInicial={pulsera ?? null} />;
}
