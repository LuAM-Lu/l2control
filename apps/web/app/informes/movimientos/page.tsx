import type { Metadata } from "next";
import { MovimientosImpreso } from "../../../src/features/reportes/MovimientosImpreso";
import { informeDeMovimientos, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * La vista de impresión del kárdex (B11-3): una hoja A4 sin la cáscara del panel, que el navegador imprime o guarda como
 * PDF. Mismo periodo, producto o categoría en la dirección que la pantalla; quién puede verlo lo decide el caso de uso.
 */
export const metadata: Metadata = { title: "Movimientos de inventario · L2 Control" };

export default async function InformeDeMovimientosPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  return <MovimientosImpreso {...await informeDeMovimientos(await searchParams)} />;
}
