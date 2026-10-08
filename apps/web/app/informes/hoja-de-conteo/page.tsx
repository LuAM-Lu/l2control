import type { Metadata } from "next";
import { connection } from "next/server";
import { HojaDeConteo } from "../../../src/features/inventario/HojaDeConteo";
import { catalogoDelLocal } from "../../../src/features/inventario/productos.servidor";
import type { ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * La hoja de conteo a ciegas para imprimir (B9-10): los productos que se cuentan, de una categoría (`?categoria=…`) o
 * todos, sin lo que dice el sistema. Una hoja A4 sin la cáscara del panel.
 */
export const metadata: Metadata = { title: "Hoja de conteo · L2 Control" };

export default async function HojaDeConteoPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  await connection();
  const q = await searchParams;
  const categoria = Array.isArray(q.categoria) ? q.categoria[0] : q.categoria;
  return <HojaDeConteo catalogo={await catalogoDelLocal()} categoria={categoria ?? null} generadoEn={new Date().toISOString()} />;
}
