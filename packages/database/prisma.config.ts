/**
 * Configuración de la CLI de Prisma (migrar, generar). La aplicación NO usa este
 * archivo: se conecta con `crearBase()` y el usuario `l2_app`.
 *
 * Las migraciones corren como `l2_migrator`, dueño de las tablas. Con RLS forzada
 * (ADR-002) ese usuario también la sufre: no es una puerta trasera.
 */
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 ya no lee `.env` solo. Se carga el de la raíz si existe; en CI y en el
// servidor las variables llegan del entorno.
const raiz = new URL("../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Sin URL, `prisma generate` funciona igual (no la necesita); migrar falla, que es lo correcto.
  datasource: { url: process.env.L2_DB_MIGRATOR_URL },
});
