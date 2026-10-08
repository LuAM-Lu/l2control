import type { Metadata } from "next";
import { InventarioImpreso } from "../../../src/features/reportes/InventarioImpreso";
import { informeDeInventario, type ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";
import type { FiltroDeEstado } from "../../../src/features/reportes/inventario";

/**
 * La vista de impresión del inventario al momento (B11-2): una hoja A4 sin la cáscara del panel, con el filtro de la
 * pantalla en la dirección (`?estado=…&categoria=…`). Quién puede verlo lo decide el caso de uso.
 */
export const metadata: Metadata = { title: "Inventario al momento · L2 Control" };

const ESTADOS: readonly FiltroDeEstado[] = ["AGOTADO", "BAJO_MINIMO", "SIN_INICIAL"];
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InformeDeInventarioPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  const q = await searchParams;
  const estado = ESTADOS.find((e) => e === uno(q.estado)) ?? "TODOS";
  return <InventarioImpreso informe={await informeDeInventario()} filtro={{ estado, categoria: uno(q.categoria) ?? null }} />;
}
