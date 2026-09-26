/**
 * `pnpm lint` — las reglas de la casa (scripts/lint-reglas.mjs) sobre todo el código de
 * apps/ y packages/, incluidos los archivos nuevos que aún no están en git.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REGLAS, revisar } from "./lint-reglas.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

const archivos = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "apps", "packages"],
  { cwd: raiz, encoding: "utf8" },
)
  .split("\n")
  .filter((f) => /\.(ts|tsx|mjs|js|css)$/.test(f) && !f.includes("/generated/"));

const explicacion = Object.fromEntries(REGLAS.map((r) => [r.nombre, r.explica]));
let total = 0;
for (const ruta of archivos) {
  let texto;
  try {
    texto = readFileSync(join(raiz, ruta), "utf8");
  } catch {
    continue; // borrado en el árbol de trabajo pero aún en el índice
  }
  for (const h of revisar(ruta, texto)) {
    total++;
    console.error(`${ruta}:${h.linea}  ${h.regla}\n    ${h.texto}\n    → ${explicacion[h.regla]}`);
  }
}

if (total > 0) {
  console.error(
    `\n✗ ${total} ${total === 1 ? "violación" : "violaciones"}. Si una es legítima: ` +
      "`lint-permitido: <regla> — <motivo>` en esa línea o en la anterior.",
  );
  process.exit(1);
}
console.log(`✓ lint: ${archivos.length} archivos, ${REGLAS.length} reglas, sin violaciones.`);
