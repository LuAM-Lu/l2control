import type { Metadata } from "next";
import { ProcedimientoDePapel } from "../../src/features/papel/ProcedimientoDePapel";

/**
 * El procedimiento en papel (B8-2, M-30): una hoja A4 para pegar junto a la caja con cuándo se pasa al papel, quién
 * anota qué y cómo se carga al volver. Como los formularios (B3-7), sin la cáscara de las estaciones: es para imprimir.
 */
export const metadata: Metadata = { title: "El procedimiento en papel · L2 Control" };

export default function ProcedimientoPapelPage() {
  return <ProcedimientoDePapel />;
}
