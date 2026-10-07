import { ImageResponse } from "next/og";
import { dibujarIconoApp } from "../src/features/shell/iconoApp";

/** Icono para «Añadir a la pantalla de inicio» en Safari (convención de Next). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function Icon() {
  // Fondo lleno: Safari pinta de negro lo transparente.
  return new ImageResponse(dibujarIconoApp(180, 80, "claro"), { ...size });
}
