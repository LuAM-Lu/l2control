import type { Metadata } from "next";
import { ParqueImpreso } from "../../../src/features/reportes/ParqueImpreso";
import { informeDelParque, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * La vista de impresión del informe del parque (B11-6): una hoja A4 sin la cáscara del panel, que el navegador imprime o
 * guarda como PDF. Mismo periodo en la dirección que la pantalla; quién puede verlo lo decide el caso de uso.
 */
export const metadata: Metadata = { title: "Parque · L2 Control" };

export default async function InformeDelParquePage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  return <ParqueImpreso {...await informeDelParque(await searchParams)} />;
}
