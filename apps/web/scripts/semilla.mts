/**
 * `pnpm db:semilla` — deja la base de DESARROLLO lista para abrir la app: el local (tenant y
 * sucursal de L2_TENANT_ID / L2_BRANCH_ID), su equipo con PIN y, si no tiene, el tarifario de
 * ejemplo como versión 1. Idempotente: correrlo otra vez no cambia nada.
 *
 * Los datos son inventados (scripts/semilla). Los reales llegan con F0-04 y B7-2. El equipo
 * nuevo desde el que se abra la app pide su registro en el acceso; se aprueba con
 * `pnpm equipos aprobar "<nombre>"` (la consola del servidor).
 */
import { existsSync } from "node:fs";
import { conectar, type Contexto } from "@l2/application";
import { TARIFARIO_DESARROLLO } from "./semilla/tarifario.mts";
import { ADMIN_DESARROLLO, EQUIPO_DESARROLLO } from "./semilla/equipo.mts";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID, L2_ENTORNO, L2_CLAVE_CIFRADO } = process.env;
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID o L2_BRANCH_ID (copia .env.example a .env).");
  process.exit(1);
}
if (L2_ENTORNO !== "desarrollo") {
  console.error(`La semilla de ejemplo solo corre en desarrollo, no en «${L2_ENTORNO ?? "sin L2_ENTORNO"}».`);
  process.exit(1);
}

const app = await conectar(L2_DB_APP_URL, { claveCifrado: L2_CLAVE_CIFRADO });
try {
  const ctx: Contexto = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID, sistema: true };
  const { creada } = await app.sucursal.asegurar(ctx, { tenant: "Abby Kingdom", sucursal: "Principal" });
  console.log(creada ? "✓ Local creado: Abby Kingdom · Principal" : "· El local ya existía");

  for (const persona of EQUIPO_DESARROLLO) {
    const r = await app.equipo.asegurar(ctx, persona);
    if (!r.ok) throw new Error(`${persona.nombre}: ${r.mensaje}`);
    console.log(r.creada ? `✓ ${persona.nombre} (${persona.role})` : `· ${persona.nombre} ya existía`);
  }

  // La administración confirma identidad (F2-04) con credenciales fijas de desarrollo.
  const cred = await app.elevacion.credenciales(ctx, ADMIN_DESARROLLO);
  if (!cred.ok) throw new Error(`Credenciales de ${ADMIN_DESARROLLO.nombre}: ${cred.mensaje}`);
  console.log(`✓ ${ADMIN_DESARROLLO.nombre}: contraseña y autenticador de desarrollo`);

  if (await app.tarifario.leer(ctx)) {
    console.log("· Ya hay tarifario publicado: no se toca");
  } else {
    const r = await app.tarifario.publicar(ctx, TARIFARIO_DESARROLLO);
    if (!r.ok) throw new Error(`El tarifario de ejemplo no pasó el contrato: ${r.mensaje}`);
    console.log(`✓ Tarifario de ejemplo publicado (versión ${r.valor.version})`);
  }
  console.log("\nEl PIN de todo el equipo de desarrollo es 1970.");
  console.log(`Para confirmar identidad: contraseña «${ADMIN_DESARROLLO.contrasena}» y el código de \`pnpm totp\`.`);
} finally {
  await app.cerrar();
}
