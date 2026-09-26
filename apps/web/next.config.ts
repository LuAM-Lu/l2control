import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// El `.env` vive en la raíz del monorepo (lo comparten Docker, Prisma y la web); Next solo
// mira el de apps/web. En staging y producción las variables llegan del entorno.
const envDeLaRaiz = new URL("../../.env", import.meta.url);
if (existsSync(envDeLaRaiz)) process.loadEnvFile(envDeLaRaiz);

const nextConfig: NextConfig = {
  // Los paquetes del workspace se publican como TypeScript sin compilar:
  // Next los transpila. Evita un paso de build por paquete y mantiene el
  // salto a definición yendo al código real, no a un .d.ts.
  transpilePackages: [
    "@l2/ui",
    "@l2/domain-money",
    "@l2/domain-park",
    "@l2/application",
    "@l2/database",
    "@l2/observability",
  ],
  typedRoutes: true,
  // El indicador de desarrollo se montaba abajo a la izquierda, encima de la
  // operación y de las capturas (hallazgo B1). Los errores de compilación
  // siguen saliendo en su pantalla completa.
  devIndicators: false,
};

export default nextConfig;
