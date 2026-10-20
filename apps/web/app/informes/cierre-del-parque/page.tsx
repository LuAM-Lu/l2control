import type { Metadata } from "next";
import { CierreDelParqueImpreso } from "../../../src/features/park/CierreDelParque";
import { cierreDelParque } from "../../../src/features/park/parque.servidor";

/**
 * La vista de impresión del cierre del parque (B4-21): una hoja A4 sin la cáscara de la estación, que el navegador imprime
 * o guarda como PDF. Sale con la sala en cero.
 */
export const metadata: Metadata = { title: "Cierre del parque · L2 Control" };
export const dynamic = "force-dynamic";

export default async function CierreDelParqueImpresoPage() {
  return <CierreDelParqueImpreso cierre={await cierreDelParque()} />;
}
