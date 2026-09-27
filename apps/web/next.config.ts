import { existsSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";

// El `.env` vive en la raíz del monorepo (lo comparten Docker, Prisma y la web); Next solo
// mira el de apps/web. En staging y producción las variables llegan del entorno.
const envDeLaRaiz = new URL("../../.env", import.meta.url);
if (existsSync(envDeLaRaiz)) process.loadEnvFile(envDeLaRaiz);

// La versión del sistema (M-10) sale del package.json raíz y se incrusta al compilar: al
// navegador llegan tres datos, no el package.json entero. `pnpm verify` comprueba que
// CHANGELOG.md la tenga (scripts/version.mjs).
const raiz = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
  l2: { etapa: string; pasos: number };
};

const nextConfig: NextConfig = {
  env: {
    L2_VERSION: raiz.version,
    L2_ETAPA: raiz.l2.etapa,
    L2_PASOS: String(raiz.l2.pasos),
  },
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
