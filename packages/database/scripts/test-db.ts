/**
 * Pruebas de integración contra la base de PRUEBAS (l2control_test), nunca la de
 * desarrollo: primero le aplica las migraciones pendientes y luego corre
 * `src/*.test-db.ts`. Necesita `pnpm infra:up`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const migrador = process.env.L2_DB_TEST_MIGRATOR_URL;
if (!migrador || !process.env.L2_DB_TEST_APP_URL) {
  console.error("Faltan L2_DB_TEST_MIGRATOR_URL y L2_DB_TEST_APP_URL (copia .env.example a .env).");
  process.exit(1);
}

/** `pnpm` en Windows es un .cmd y necesita shell; node no, y su ruta lleva espacios. */
const correr = (orden: string, args: string[], env: NodeJS.ProcessEnv = process.env, shell = false) =>
  spawnSync(orden, args, { stdio: "inherit", shell, env }).status ?? 1;

const migrar = correr("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  ...process.env,
  L2_DB_MIGRATOR_URL: migrador,
}, process.platform === "win32");
if (migrar !== 0) {
  console.error("No se pudieron aplicar las migraciones a la base de pruebas. ¿Está `pnpm infra:up`?");
  process.exit(migrar);
}

const pruebas = readdirSync("src").filter((f) => f.endsWith(".test-db.ts")).map((f) => `src/${f}`);
process.exit(
  correr(process.execPath, ["--test", "--test-concurrency=1", "--experimental-strip-types", ...pruebas]),
);
