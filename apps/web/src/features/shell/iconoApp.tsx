import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dibuja el icono de la aplicación para PWA y Apple: el logo de L2 sobre el fondo base.
 *
 * `ImageResponse` dibuja en el servidor, sin la hoja de estilos ni acceso a /public por URL: el
 * logo se lee del disco y se incrusta. El fondo copia el token base del tema oscuro (#0f172a),
 * sobre el que el contorno blanco del logo se ve entero.
 */
let logo: string | null = null;
function logoIncrustado(): string {
  logo ??= `data:image/png;base64,${readFileSync(resolve(process.cwd(), "public", "logo-l2-640.png")).toString("base64")}`;
  return logo;
}

/** Proporción del logo (640 × 555). */
const ALTO_POR_ANCHO = 555 / 640;

export function dibujarIconoApp(size: number, porcientoCuadrado: number) {
  const ancho = (size * porcientoCuadrado) / 100;

  return (
    <div
      style={{
        background: "#0f172a",
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
