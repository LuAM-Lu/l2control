import { redirect } from "next/navigation";

/**
 * La entrada al parque vive en «Parque» desde B4-12 (M-34): la sala, la entrada y la salida son una pantalla con un solo
 * lector. Un enlace guardado a `/entrada` no se rompe: abre la entrada allí.
 */
export default function EntradaPage(): never {
  redirect("/monitor?entrada=1");
}
