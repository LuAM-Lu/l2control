import type { Metadata } from "next";
import { DeudasImpreso } from "../../../src/features/reportes/DeudasImpreso";
import { informeDeDeudas, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * La vista de impresión del informe de deudas (B11-4): una hoja A4 sin la cáscara del panel, que el navegador imprime
 * o guarda como PDF. Mismo periodo en la dirección que la pantalla; quién puede verlo lo decide el caso de uso.
 */
export const metadata: Metadata = { title: "Deudas de clientes · L2 Control" };

export default async function InformeDeDeudasPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  return <DeudasImpreso {...await informeDeDeudas(await searchParams)} />;
}
