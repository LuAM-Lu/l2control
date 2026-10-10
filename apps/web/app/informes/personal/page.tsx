import type { Metadata } from "next";
import { PersonalImpreso } from "../../../src/features/reportes/PersonalImpreso";
import { valesDelPeriodo, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * La vista de impresión del consumo del personal (B3-17): una hoja A4 sin la cáscara del panel, que el navegador imprime
 * o guarda como PDF. Mismo periodo en la dirección que la pantalla; quién puede verlo lo decide el caso de uso.
 */
export const metadata: Metadata = { title: "Consumo del personal · L2 Control" };

export default async function InformeDelPersonalPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  return <PersonalImpreso {...await valesDelPeriodo(await searchParams)} />;
}
