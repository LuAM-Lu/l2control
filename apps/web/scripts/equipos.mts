/**
 * `pnpm equipos` — la consola del servidor para los equipos del local (F2-02).
 *
 *   pnpm equipos                      lista los equipos y su estado
 *   pnpm equipos aprobar "<nombre>"   aprueba un equipo pendiente
 *   pnpm equipos revocar "<nombre>"   lo revoca y cierra sus sesiones
 *
 * Resuelve el huevo y la gallina de un local nuevo: para aprobar un equipo desde el panel
 * hace falta entrar, y para entrar hace falta un equipo aprobado. El primero se aprueba aquí,
 * desde la máquina del servidor, o desde el propio equipo con las credenciales de administración
 * (M-7); lo demás, desde el panel. Es también la puerta de emergencia si se pierden todos los
 * equipos de administración. Todo queda auditado como «Consola del servidor». Está en el runbook
 * de la instalación (F10-10).
 *
 * Antes de aprobar, compara el código que enseña la lista con el de la pantalla del equipo.
 */
import { existsSync } from "node:fs";
import { conectar, type Contexto } from "@l2/application";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);

const { L2_DB_APP_URL, L2_TENANT_ID, L2_BRANCH_ID } = process.env;
if (!L2_DB_APP_URL || !L2_TENANT_ID || !L2_BRANCH_ID) {
  console.error("Faltan L2_DB_APP_URL, L2_TENANT_ID o L2_BRANCH_ID.");
  process.exit(1);
}

const [orden, nombre] = process.argv.slice(2);
const app = await conectar(L2_DB_APP_URL);
const ctx: Contexto = { tenantId: L2_TENANT_ID, branchId: L2_BRANCH_ID, sistema: true };

try {
  const lista = await app.dispositivos.listar(ctx);
  if (!lista.ok) throw new Error(lista.mensaje);
  const equipos = lista.valor.devices;

  if (!orden) {
    if (equipos.length === 0) console.log("No hay equipos registrados. Abre la app en uno y pide su registro.");
    for (const d of equipos) {
      const quien = d.session ? ` · con sesión de ${d.session.userName}` : "";
      const caducada = d.requestExpiresAt && Date.parse(d.requestExpiresAt) <= Date.now() ? " · SOLICITUD CADUCADA" : "";
      console.log(`${d.status.padEnd(10)} ${d.pairingCode}  ${d.label}${quien}${caducada}`);
    }
  } else if (orden === "aprobar" || orden === "revocar") {
    const d = equipos.find((x) => x.label.toLowerCase() === (nombre ?? "").toLowerCase());
    if (!d) throw new Error(`No hay ningún equipo llamado «${nombre ?? ""}». Usa \`pnpm equipos\` para verlos.`);
    const r = await app.dispositivos.ordenar(ctx, {
      kind: orden === "aprobar" ? "APROBAR" : "REVOCAR",
      deviceId: d.id,
      reason: orden === "aprobar" ? "Aprobado desde la consola del servidor" : "Revocado desde la consola del servidor",
    });
    if (!r.ok) throw new Error(r.mensaje);
    console.log(`✓ ${r.valor.label} (código ${r.valor.pairingCode}): ${r.valor.status}`);
  } else {
    throw new Error(`Orden desconocida «${orden}». Usa: pnpm equipos [aprobar|revocar "<nombre>"]`);
  }
} catch (e) {
  console.error(`✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await app.cerrar();
}
