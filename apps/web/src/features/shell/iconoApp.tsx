/**
 * Dibuja el icono de la aplicación para PWA y Apple.
 *
 * Los colores reflejan `packages/config/tokens.css` (base: #0f172a, brand: #eab308, on-brand: #0f172a).
 */
export function dibujarIconoApp(size: number, porcientoCuadrado: number) {
  const cuadrado = (size * porcientoCuadrado) / 100;

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
      <div
        style={{
          background: "#eab308",
          width: cuadrado,
          height: cuadrado,
          borderRadius: cuadrado * 0.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0f172a",
          fontSize: cuadrado * 0.5,
          fontWeight: "bold",
          fontFamily: "sans-serif", // La fuente genérica basta para un icono.
        }}
      >
        L2
      </div>
    </div>
  );
}
