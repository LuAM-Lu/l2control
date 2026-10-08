/**
 * Empaqueta el agente de impresión en UN ejecutable de Windows (`dist/l2-impresion.exe`) — ADR-026.
 *
 *  1. esbuild junta el agente y lo que usa (contratos, ESC/POS, Socket.io) en un solo archivo.
 *  2. Node lo convierte en un «single executable application» (SEA): el `node.exe` de esta máquina con
 *     el agente dentro. La laptop de caja no necesita Node ni el proyecto.
 *  3. Se anota su huella SHA-256, para comprobar que el que se instala es este, y su versión: el servidor las
 *     publica y el agente instalado las usa para actualizarse solo (T-8c).
 *
 * Se corre en Windows con Node 24: `pnpm agente:empaquetar`.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(raiz, "dist");
const version = JSON.parse(readFileSync(join(raiz, "..", "..", "package.json"), "utf8")).version;
if (process.platform !== "win32") {
  console.error("El ejecutable es para la laptop de caja (Windows): empaqueta en Windows.");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

console.log(`1/3 Juntando el agente ${version}…`);
await build({
  entryPoints: [join(raiz, "src", "main.ts")],
  outfile: join(dist, "l2-impresion.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  define: { __VERSION__: JSON.stringify(version) },
  // Aceleradores opcionales de `ws`: si no están, usa su versión en JavaScript.
  external: ["bufferutil", "utf-8-validate"],
  legalComments: "none",
  logLevel: "warning",
});

console.log("2/3 Haciendo el ejecutable…");
const config = join(dist, "sea-config.json");
writeFileSync(config, JSON.stringify({ main: join(dist, "l2-impresion.cjs"), output: join(dist, "sea.blob"), disableExperimentalSEAWarning: true }));
execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });
const exe = join(dist, "l2-impresion.exe");
copyFileSync(process.execPath, exe);
execFileSync(
  process.execPath,
  [join(raiz, "node_modules", "postject", "dist", "cli.js"), exe, "NODE_SEA_BLOB", join(dist, "sea.blob"), "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
for (const f of ["sea.blob", "sea-config.json"]) rmSync(join(dist, f));

console.log("3/3 Anotando su huella…");
const huella = createHash("sha256").update(readFileSync(exe)).digest("hex");
writeFileSync(join(dist, "l2-impresion.exe.sha256"), `${huella}  l2-impresion.exe\n`);
writeFileSync(join(dist, "l2-impresion.exe.version"), `${version}\n`);
const mb = Math.round(statSync(exe).size / 1_048_576);
console.log(`\nListo: ${exe} (${mb} MB, v${version})\nSHA-256 ${huella}`);
