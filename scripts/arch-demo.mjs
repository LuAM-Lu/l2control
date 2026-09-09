/**
 * Demostración de que la regla de arquitectura MUERDE — F1-03.
 *
 * El criterio de aceptación de F1-03 no es "existe un archivo de reglas",
 * es "una importación deliberadamente prohibida rompe el CI". Un chequeo de
 * arquitectura mal configurado pasa en verde sin haber mirado nada, que es
 * peor que no tenerlo: da una falsa sensación de seguridad.
 *
 * Este script inyecta una violación real, comprueba que depcruise falla, y
 * restaura el archivo. Corre en CI junto al resto.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "packages/ui/src/primitives/Badge.tsx");
const VIOLATION = 'import { formatDuration } from "@l2/domain-park";\n';

function runArch() {
  try {
    execFileSync("pnpm", ["arch"], { cwd: root, stdio: "pipe", shell: true });
    return { failed: false, output: "" };
  } catch (error) {
    return { failed: true, output: String(error.stdout ?? "") };
  }
}

const original = readFileSync(target, "utf8");
let exitCode = 0;

try {
  // 1. El estado limpio debe pasar.
  const clean = runArch();
  if (clean.failed) {
    console.error("✗ El estado limpio ya falla. Arregla eso antes de la demostración.");
    process.exit(1);
  }
  console.log("✓ Estado limpio: sin violaciones.");

  // 2. Con la violación, debe fallar por la regla correcta.
  writeFileSync(target, VIOLATION + original, "utf8");
  const dirty = runArch();

  if (!dirty.failed) {
    console.error(
      "✗ FALLO DE LA DEMOSTRACIÓN: @l2/ui importó el dominio y la regla NO lo detectó.\n" +
        "  El chequeo de arquitectura está mal configurado y no protege nada.",
    );
    exitCode = 1;
  } else if (!dirty.output.includes("ui-no-conoce-el-dominio")) {
    console.error(
      "✗ Falló, pero por otra regla. Se esperaba `ui-no-conoce-el-dominio`.\n" + dirty.output,
    );
    exitCode = 1;
  } else {
    console.log("✓ La violación deliberada rompe la construcción, por la regla esperada.");
    console.log("  F1-03 verificada: las fronteras de §9.2 se imponen con herramientas.");
  }
} finally {
  // 3. Restaurar siempre, incluso si algo explotó.
  writeFileSync(target, original, "utf8");
}

process.exit(exitCode);
