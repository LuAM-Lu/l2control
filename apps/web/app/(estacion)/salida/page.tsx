import { redirect } from "next/navigation";

/**
 * La salida del parque vive en «Parque» desde B4-12 (M-34). Un enlace a `/salida?pulsera=` (la ficha de antes, el cierre
 * del turno) no se rompe: abre la salida de ese niño allí. La pulsera se valida igual que un escaneo.
 */
export default async function SalidaPage({ searchParams }: { searchParams: Promise<{ pulsera?: string }> }): Promise<never> {
  const { pulsera } = await searchParams;
  redirect(pulsera ? `/monitor?salida=${encodeURIComponent(pulsera)}` : "/monitor");
}
