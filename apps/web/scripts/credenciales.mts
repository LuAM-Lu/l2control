/**
 * `pnpm credenciales "<nombre>" [llave]` — la puerta de emergencia de las credenciales de
 * administración (ADR-020): genera, desde la consola del servidor, un enlace de alta de 24 h y de
 * un solo uso para esa persona, y lo imprime UNA vez. Ella lo abre en SU equipo, pone su
 * contraseña, registra su llave de acceso y recibe sus códigos de recuperación: la consola nunca
 * ve la contraseña ni toca la llave.
 *
 * Sin segundo argumento el enlace es de ALTA (da o REPONE contraseña, llave y códigos: sirve a
 * quien lo perdió todo). Con `llave`, añade otra llave a quien ya tiene contraseña.
 * Queda en la auditoría como «Consola del servidor», sin el secreto del enlace.
 */
import { existsSync } from "node:fs";
import { conectar, type Contexto } from "@l2/application";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID, L2_CLAVE_CIFRADO, L2_URL_PUBLICA } = process.env;
const [nombre, tipo] = process.argv.slice(2);
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID || !L2_URL_PUBLICA) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID o L2_URL_PUBLICA.");
  process.exit(1);
}
if (!nombre || (tipo !== undefined && tipo !== "llave")) {
  console.error('Uso: pnpm credenciales "<nombre completo>" [llave]');
  process.exit(1);
}

const app = await conectar(L2_DB_APP_URL, { claveCifrado: L2_CLAVE_CIFRADO, urlPublica: L2_URL_PUBLICA });
try {
  const ctx: Contexto = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID, sistema: true };
  const directorio = await app.equipo.directorio(ctx);
  if (!directorio.ok) throw new Error(directorio.mensaje);
  const buscado = nombre.trim().toLocaleLowerCase("es");
  const persona = directorio.valor.users.find((u) => u.fullName.toLocaleLowerCase("es") === buscado);
  if (!persona) throw new Error(`No hay nadie llamado «${nombre}» en esta sucursal.`);

  const r = await app.enlaces.crear(ctx, { userId: persona.id, kind: tipo === "llave" ? "LLAVE" : "ALTA" }, Date.now());
  if (!r.ok) throw new Error(r.mensaje);
  console.log(
    r.valor.kind === "ALTA"
      ? `Enlace de alta de ${r.valor.nombre} (contraseña, llave de acceso y códigos de recuperación):\n`
      : `Enlace para que ${r.valor.nombre} añada otra llave de acceso:\n`,
  );
  console.log(`  ${r.valor.url}\n`);
  console.log("Vale 24 horas y una sola vez; se muestra solo ahora. Se abre en el equipo de esa persona.");
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await app.cerrar();
}
