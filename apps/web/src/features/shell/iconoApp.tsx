import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dibuja el icono de la aplicación para PWA y Apple: el logo de L2.
 *
 * `ImageResponse` dibuja en el servidor, sin la hoja de estilos ni acceso a /public por URL: el
 * logo se lee del disco y se incrusta. Dos fondos (M-24):
 *  · `transparente`: el icono de uso general (`purpose: any`). Android lo pone dentro de su propio
 *    círculo blanco cuando la app no se instala como tal (un acceso directo): con un cuadrado oscuro
 *    detrás se veía un cuadro dentro del círculo; transparente, se ve el logo.
 *  · `claro`: el adaptable de Android (`maskable`, que se recorta con la forma del sistema y necesita
 *    fondo lleno) y el de Apple (que pinta de negro lo transparente). Copia el token base del tema
 *    claro (#f0f8ff), el predeterminado.
 */
let logo: string | null = null;
function logoIncrustado(): string {
  logo ??= `data:image/png;base64,${readFileSync(resolve(process.cwd(), "public", "logo-l2-640.png")).toString("base64")}`;
  return logo;
}

/** Proporción del logo (640 × 555). */
const ALTO_POR_ANCHO = 555 / 640;

export type FondoDelIcono = "transparente" | "claro";

const FONDO: Readonly<Record<FondoDelIcono, string>> = {
  transparente: "transparent",
  claro: "#f0f8ff",
};

export function dibujarIconoApp(size: number, porcientoAncho: number, fondo: FondoDelIcono) {
  const ancho = (size * porcientoAncho) / 100;

  return (
    <div
      style={{
        background: FONDO[fondo],
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img src={logoIncrustado()} width={ancho} height={ancho * ALTO_POR_ANCHO} alt="" />
    </div>
  );
}
