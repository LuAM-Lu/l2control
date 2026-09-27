/**
 * `pnpm version:comprobar` — la versión del package.json raíz y CHANGELOG.md van juntos (M-10).
 * Forma parte de `pnpm verify`: si no cuadran, no entra en `main`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comprobarVersion } from "./version-reglas.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = comprobarVersion(
  JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")),
  readFileSync(join(raiz, "CHANGELOG.md"), "utf8"),
);

if (!r.ok) {
  for (const p of r.problemas) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ versión: v${r.version} · ${r.etapa} · ${r.entregados} de ${r.pasos} pasos, con su entrada en CHANGELOG.md.`);
