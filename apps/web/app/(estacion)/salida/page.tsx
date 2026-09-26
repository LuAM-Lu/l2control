import { CheckoutScreen } from "../../../src/features/park/CheckoutScreen";
import { demoSnapshot } from "../../../src/demo/parque";
import { tarifarioVigente } from "../../../src/features/park/tarifario.servidor";

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
  return <CheckoutScreen snapshot={demoSnapshot(Date.now(), (await tarifarioVigente()).tarifario.policy)} pulseraInicial={pulsera ?? null} />;
}
