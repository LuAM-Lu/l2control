import type { MetadataRoute } from "next";

/**
 * Manifiesto de la app instalable (PWA) — F1-21.
 *
 * `standalone` quita la barra del navegador; las estaciones piden además
 * pantalla completa (`pantallaCompleta.ts`). Los colores reflejan tokens.css.
 * Arranca en el acceso: en un equipo compartido, lo primero es decir quién entra.
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "L2 Control · Abby Kingdom",
    short_name: "L2 Control",
    description: "Parque y restaurante: entrada, caja, mesas y cocina.",
    id: "/",
    start_url: "/acceso",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    lang: "es-VE",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/iconos/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
