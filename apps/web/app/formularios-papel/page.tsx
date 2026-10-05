import type { Metadata } from "next";
import { FormulariosDePapel } from "../../src/features/papel/FormulariosDePapel";

/**
 * Los formularios para anotar en papel (B3-7, V-12): dos hojas A4, entradas y cobros, que se imprimen y se guardan
 * junto a la caja. No lleva la cáscara de las estaciones: es una página para imprimir. Sin datos del local más
 * que su nombre, que el acceso ya enseña.
 */
export const metadata: Metadata = { title: "Formularios para anotar en papel · L2 Control" };

export default function FormulariosPapelPage() {
  return <FormulariosDePapel />;
}
