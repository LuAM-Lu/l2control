/**
 * `pnpm credenciales "<nombre>"` — da (o repone) contraseña y autenticador a una persona, desde la
 * consola del servidor (F2-04, ADR-018). Imprime la contraseña y la URI `otpauth://` UNA vez:
 * la contraseña se entrega en mano y la URI se añade al autenticador (o se convierte en QR).
 * Queda en la auditoría como «Consola del servidor», sin ninguno de los dos valores.
 */
import { existsSync } from "node:fs";
import { conectar, type Contexto } from "@l2/application";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID, L2_CLAVE_CIFRADO } = process.env;
const nombre = process.argv[2];
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID || !L2_CLAVE_CIFRADO) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID o L2_CLAVE_CIFRADO.");
  process.exit(1);
}
if (!nombre) {
  console.error('Uso: pnpm credenciales "<nombre completo>"');
  process.exit(1);
}

const app = await conectar(L2_DB_APP_URL, { claveCifrado: L2_CLAVE_CIFRADO });
try {
  const ctx: Contexto = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID, sistema: true };
  const r = await app.elevacion.credenciales(ctx, { nombre });
  if (!r.ok) throw new Error(r.mensaje);
  console.log(`Credenciales de ${nombre} (se muestran una sola vez):\n`);
  console.log(`  Contraseña:     ${r.valor.contrasena}`);
  console.log(`  Autenticador:   ${r.valor.otpauth}\n`);
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await app.cerrar();
}
