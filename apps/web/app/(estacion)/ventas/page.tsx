import { redirect } from "next/navigation";

/**
 * Ventas del turno vive dentro de Turno desde M-13 (JORNADA.md §1): una sola sección, que se lee de
 * arriba abajo. Esta dirección se queda para que un enlace o una pestaña vieja no se rompan.
 */
export default function VentasPage() {
  redirect("/turno");
}
