import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los paquetes del workspace se publican como TypeScript sin compilar:
  // Next los transpila. Evita un paso de build por paquete y mantiene el
  // salto a definición yendo al código real, no a un .d.ts.
  transpilePackages: ["@l2/ui", "@l2/domain-money", "@l2/domain-park"],
  typedRoutes: true,
};

export default nextConfig;
