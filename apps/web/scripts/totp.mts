/**
 * `pnpm totp` — el código TOTP vigente de la administración de DESARROLLO, para confirmar
 * identidad (F2-04) sin autenticador. Se niega fuera de desarrollo.
 */
import { existsSync } from "node:fs";
import { Secret, TOTP } from "otpauth";
import { ADMIN_DESARROLLO } from "./semilla/equipo.mts";

const raiz = new URL("../../../.env", import.meta.url);
if (existsSync(raiz)) process.loadEnvFile(raiz);
if (process.env.L2_ENTORNO !== "desarrollo") {
  console.error("`pnpm totp` solo existe en desarrollo.");
  process.exit(1);
}
const totp = new TOTP({ secret: Secret.fromBase32(ADMIN_DESARROLLO.secretoBase32) });
const restante = 30 - Math.floor(Date.now() / 1000) % 30;
console.log(`${totp.generate()}  (${ADMIN_DESARROLLO.nombre}, contraseña «${ADMIN_DESARROLLO.contrasena}», vale ${restante} s más)`);
