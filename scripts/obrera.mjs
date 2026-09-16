#!/usr/bin/env node
/**
 * La obrera Gemini — orquesta de modelos, ver docs/ORQUESTA.md.
 *
 * La maestra (Claude Code) le pasa una tarea acotada y recibe texto. La obrera
 * corre con la CLI de Antigravity (`agy`) sobre la suscripción Google AI Pro de
 * quien la usa: sin clave de API.
 *
 * TRES CANDADOS, Y NINGUNO ES DECORATIVO
 *
 *  1. **Solo lee.** `--mode plan`, `--sandbox` y, sobre todo, los permisos de
 *     `~/.gemini/antigravity-cli/settings.json`: `read_file` del proyecto y nada
 *     más. En modo sin interfaz, lo que no está permitido se deniega sin
 *     preguntar. Comprobado el 2026-09-16: pedirle que edite un archivo lo deja
 *     intacto, y pedirle `.claude.json` choca con la lista de prohibidos.
 *  2. **No arranca si Google puede entrenar con el código.** Por defecto,
 *     Antigravity usa lo que lee y responde para mejorar sus modelos, y su
 *     personal puede revisarlo. Hasta que quien la usa desactive esa preferencia
 *     y lo declare con `L2_OBRERA_SIN_ENTRENAMIENTO=1`, la obrera se niega.
 *     Fail-closed (regla 4): ante la duda, no se manda nada fuera.
 *  3. **Lo que devuelve es una opinión, no un cambio.** No escribe en disco; la
 *     maestra lee, decide y aplica, y todo pasa `pnpm verify` antes de entrar.
 *
 * Uso:
 *   node scripts/obrera.mjs [--flash] "tarea"
 *
 *   --flash   Gemini 3.8 Flash: rápido, para preguntas cortas.
 *             Sin él, Gemini 3.1 Pro: para revisiones y pruebas.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MODELOS = {
  pro: "gemini-3.1-pro-high",
  flash: "gemini-3.8-flash-medium",
};

/** Lo que la obrera recibe siempre antes de la tarea. */
const ENCARGO = `Eres una obrera de revisión en el repositorio L2 Control (Next.js 16, TypeScript estricto, pnpm).
Trabajas en MODO SOLO LECTURA: puedes leer archivos del proyecto, no puedes modificarlos ni ejecutar comandos.
Antes de opinar, lee CLAUDE.md: sus cinco reglas mandan (dominio puro, @l2/ui sin dominio, dinero en bigint con moneda, fail-closed, nada se borra).
Responde en español, breve y concreto. Cita siempre archivo:línea. No inventes rutas ni APIs: si no lo has leído, dilo.
Si propones código, dalo como fragmento para que otra persona lo revise; no des por hecho que se aplicará.

TAREA:
`;

function salir(mensaje, codigo = 1) {
  process.stderr.write(`obrera: ${mensaje}\n`);
  process.exit(codigo);
}

const args = process.argv.slice(2);
const flash = args[0] === "--flash";
const tarea = (flash ? args.slice(1) : args).join(" ").trim();

if (!tarea) salir('falta la tarea. Uso: node scripts/obrera.mjs [--flash] "tarea"');

// Candado 2: sin la preferencia de entrenamiento desactivada, no sale nada.
if (process.env.L2_OBRERA_SIN_ENTRENAMIENTO !== "1") {
  salir(
    [
      "no arranco: Google puede entrenar con lo que leo mientras no desactives esa preferencia.",
      "  1. Abre Antigravity → Settings → Advanced y desactiva el uso de tus datos para entrenar.",
      '  2. Declara que lo hiciste:  setx L2_OBRERA_SIN_ENTRENAMIENTO 1   (y reabre VS Code).',
      "  Detalles en docs/ORQUESTA.md.",
    ].join("\n"),
  );
}

const agy = [
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"),
  process.env.HOME && join(process.env.HOME, ".local", "bin", "agy"),
].find((p) => p && existsSync(p)) ?? "agy";

const hijo = spawn(
  agy,
  [
    "-p",
    ENCARGO + tarea,
    "--mode",
    "plan",
    "--sandbox",
    "--model",
    flash ? MODELOS.flash : MODELOS.pro,
    "--output-format",
    "text",
  ],
  {
    cwd: RAIZ,
    // Sin entrada: `agy -p` con la entrada abierta se ha colgado en Windows
    // (google-antigravity/antigravity-cli#318).
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let salida = "";
let errores = "";
hijo.stdout.on("data", (d) => (salida += d));
hijo.stderr.on("data", (d) => (errores += d));

hijo.on("error", (e) =>
  salir(`no encuentro la CLI de Antigravity (${e.message}). Instalación en docs/ORQUESTA.md.`),
);

hijo.on("close", (codigo) => {
  // `agy` escribe su registro de arranque por la salida de errores: se filtra
  // para que la maestra vea solo lo que importa.
  const avisos = errores
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.includes("logging before google.Init"))
    .join("\n");

  if (salida.trim()) process.stdout.write(salida.trimEnd() + "\n");
  if (avisos) process.stderr.write(avisos + "\n");

  // Una denegación de permisos sale con código 0 y sin respuesta: para la
  // maestra eso es un fallo, no un silencio.
  if (!salida.trim()) salir("la obrera no devolvió nada (¿un permiso denegado? mira el aviso de arriba).");
  process.exit(codigo ?? 0);
});
