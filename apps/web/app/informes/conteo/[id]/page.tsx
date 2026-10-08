import type { Metadata } from "next";
import { InformeDeConteo } from "../../../../src/features/inventario/InformeDeConteo";
import { ajusteDelLocal } from "../../../../src/features/inventario/salidas.servidor";

/**
 * El informe de diferencias de un conteo (B9-10): una hoja A4 sin la cáscara del panel. Quién puede verlo lo decide el
 * caso de uso (`salidas.uno`).
 */
export const metadata: Metadata = { title: "Informe de diferencias · L2 Control" };

export default async function InformeDeConteoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InformeDeConteo ajuste={await ajusteDelLocal(id)} />;
}
