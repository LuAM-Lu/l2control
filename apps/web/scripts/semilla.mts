/**
 * `pnpm db:semilla` — deja la base de DESARROLLO lista para abrir la app en modo servidor:
 * el local (tenant y sucursal de L2_TENANT_ID / L2_BRANCH_ID) y, si no tiene, el tarifario de
 * ejemplo como versión 1. Idempotente: correrlo otra vez no cambia nada.
 *
 * Los datos son inventados (scripts/semilla). Los reales llegan con F0-04 y B7-2.
 */
import { existsSync } from "node:fs";
import { conectar } from "@l2/application";
import { TARIFARIO_DESARROLLO } from "./semilla/tarifario.mts";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID, L2_ENTORNO } = process.env;
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID o L2_BRANCH_ID (copia .env.example a .env).");
  process.exit(1);
}
if (L2_ENTORNO !== "desarrollo") {
  console.error(`La semilla de ejemplo solo corre en desarrollo, no en «${L2_ENTORNO ?? "sin L2_ENTORNO"}».`);
  process.exit(1);
}

const app = await conectar(L2_DB_APP_URL);
try {
  const ctx = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID };
  const { creada } = await app.sucursal.asegurar(ctx, { tenant: "Abby Kingdom", sucursal: "Principal" });
  console.log(creada ? "✓ Local creado: Abby Kingdom · Principal" : "· El local ya existía");

  if (await app.tarifario.leer(ctx)) {
    console.log("· Ya hay tarifario publicado: no se toca");
  } else {
    const r = await app.tarifario.publicar(ctx, TARIFARIO_DESARROLLO);
    if (!r.ok) throw new Error(`El tarifario de ejemplo no pasó el contrato: ${r.mensaje}`);
    console.log(`✓ Tarifario de ejemplo publicado (versión ${r.valor.version})`);
  }
} finally {
  await app.cerrar();
}
