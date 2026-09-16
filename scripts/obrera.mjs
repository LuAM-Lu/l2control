#!/usr/bin/env node
/**
 * La obrera Gemini — orquesta de modelos, ver docs/ORQUESTA.md.
 *
 * Claude Code es la maestra: planifica, escribe el encargo, revisa y hace
 * commit. Gemini es la obrera: **programa** lo que se le encarga, o revisa. Corre
 * con la CLI de Antigravity (`agy`) sobre la suscripción Google AI Pro de quien
 * la usa, sin clave de API.
 *
 *   node scripts/obrera.mjs programa <tarea> "encargo"   escribe en una copia aislada
 *   node scripts/obrera.mjs diff <tarea>                 lo que escribió, para revisarlo
 *   node scripts/obrera.mjs limpia <tarea>               borra la copia y su rama
 *   node scripts/obrera.mjs revisa [--flash] "encargo"   solo lee y opina
 *
 * LOS CANDADOS, Y NINGUNO ES DECORATIVO
 *
 *  1. **Escribe en una copia, nunca en el proyecto.** `programa` crea un
 *     `git worktree` hermano (`<proyecto>-obrera`) en la rama `obrera/<tarea>`.
 *     Los permisos de `agy` (`~/.gemini/antigravity-cli/settings.json`) solo le
 *     dejan escribir en `apps/` de esa copia, y le niegan el proyecto, el dominio
 *     y los contratos. Solo puede ejecutar `pnpm typecheck|test|arch|verify`: ni
 *     `git`, ni borrar, ni internet. Comprobado el 2026-09-16, límite por límite.
 *  2. **No arranca si Google puede entrenar con el código.** Por defecto,
 *     Antigravity usa lo que lee y responde para mejorar sus modelos. Hasta que
 *     quien la usa lo desactive y lo declare con `L2_OBRERA_SIN_ENTRENAMIENTO=1`,
 *     la obrera se niega. Fail-closed (regla 4).
 *  3. **Nada de lo suyo entra solo.** La maestra lee el diff, corre `pnpm verify`
 *     y lo aplica ella en `main`. La obrera no tiene `git`: no puede hacer commit.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
/** La copia aislada vive al lado del proyecto: sus permisos la nombran así. */
const COPIA = join(dirname(RAIZ), `${basename(RAIZ)}-obrera`);

const MODELOS = {
  pro: "gemini-3.1-pro-high",
  flash: "gemini-3.8-flash-medium",
};

const REGLAS = `Lee CLAUDE.md antes de nada: sus cinco reglas mandan (dominio puro, @l2/ui sin dominio, dinero en bigint con su moneda, fail-closed, nada se borra), igual que sus reglas de componentes (colores solo de tokens, estado con color + icono + texto, tnum, objetivos táctiles, formato monetario y horario de Venezuela, sin emoji).
Escribe como el código vecino: mismos patrones, mismos nombres, comentarios en español que expliquen el porqué.
No inventes rutas ni APIs: si no lo has leído, léelo o dilo.`;

const ENCARGO_REVISA = `Eres una obrera de revisión en el repositorio L2 Control (Next.js 16, TypeScript estricto, pnpm).
Trabajas en MODO SOLO LECTURA: lees, no modificas ni ejecutas nada.
${REGLAS}
Responde en español, breve y concreto, citando archivo:línea. Si propones código, dalo como fragmento para revisión.

TAREA:
`;

const ENCARGO_PROGRAMA = (tarea) => `Eres una obrera programadora en el repositorio L2 Control (Next.js 16, React 19, TypeScript estricto, Tailwind 4, pnpm).
Trabajas en una COPIA AISLADA: ${COPIA.replaceAll("\\", "/")} (rama obrera/${tarea}). Todas las rutas que escribas deben estar dentro de esa carpeta.
Solo puedes escribir dentro de apps/. No puedes tocar packages/ (contratos, dominio, ui): si la tarea lo necesitara, NO lo hagas y dilo al final.
No puedes usar git ni borrar archivos. Los únicos comandos permitidos son: pnpm typecheck, pnpm test, pnpm arch, pnpm verify.
${REGLAS}
Haz exactamente lo que pide el encargo, ni más ni menos. Si algo no está claro, toma la decisión más conservadora y anótala.
Al terminar, ejecuta "pnpm typecheck" y corrige hasta que pase. Si no lo consigues, detente y explica el error.
Termina con un resumen en español: archivos creados o modificados, decisiones que tomaste y lo que quedó pendiente.

ENCARGO:
`;

function salir(mensaje, codigo = 1) {
  process.stderr.write(`obrera: ${mensaje}\n`);
  process.exit(codigo);
}

function git(args, cwd = RAIZ) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) salir(`git ${args.join(" ")} falló:\n${r.stderr}`);
  return r.stdout;
}

const TAREA_VALIDA = /^[a-z0-9][a-z0-9-]{1,40}$/;
function nombreDeTarea(t) {
  if (!t || !TAREA_VALIDA.test(t)) salir("el nombre de la tarea va en minúsculas, con guiones: p. ej. carta-editor");
  return t;
}

function candadoEntrenamiento() {
  if (process.env.L2_OBRERA_SIN_ENTRENAMIENTO !== "1") {
    salir(
      [
        "no arranco: Google puede entrenar con lo que leo mientras no desactives esa preferencia.",
        "  1. Antigravity → Settings → Account → desactiva «Enable Telemetry».",
        "  2. Declara que lo hiciste:  setx L2_OBRERA_SIN_ENTRENAMIENTO 1   (y reabre el editor).",
        "  Detalles en docs/ORQUESTA.md.",
      ].join("\n"),
    );
  }
}

function agy() {
  return (
    [
      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "agy", "bin", "agy.exe"),
      process.env.HOME && join(process.env.HOME, ".local", "bin", "agy"),
    ].find((p) => p && existsSync(p)) ?? "agy"
  );
}

/** Lanza `agy -p` y devuelve su texto. Una denegación sin respuesta es un fallo. */
function lanzar(argumentos, cwd) {
  return new Promise((resolve) => {
    const hijo = spawn(agy(), argumentos, {
      cwd,
      // Sin entrada: `agy -p` con la entrada abierta se ha colgado en Windows
      // (google-antigravity/antigravity-cli#318).
      stdio: ["ignore", "pipe", "pipe"],
    });
    let salida = "";
    let errores = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (errores += d));
    hijo.on("error", (e) =>
      salir(`no encuentro la CLI de Antigravity (${e.message}). Instalación en docs/ORQUESTA.md.`),
    );
    hijo.on("close", (codigo) => {
      // `agy` escribe su registro de arranque por la salida de errores.
      const avisos = errores
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.includes("logging before google.Init"))
        .join("\n");
      if (salida.trim()) process.stdout.write(salida.trimEnd() + "\n");
      if (avisos) process.stderr.write(avisos + "\n");
      if (!salida.trim()) salir("la obrera no devolvió nada (¿un permiso denegado? mira el aviso de arriba).");
      resolve(codigo ?? 0);
    });
  });
}

/** Deja la copia aislada lista en `obrera/<tarea>`, desde el `HEAD` del proyecto. */
function prepararCopia(tarea) {
  const rama = `obrera/${tarea}`;
  const copias = git(["worktree", "list", "--porcelain"]);
  const yaEsta = copias.includes(`worktree ${COPIA.replaceAll("\\", "/")}`);

  if (yaEsta) {
    const actual = git(["rev-parse", "--abbrev-ref", "HEAD"], COPIA).trim();
    if (actual !== rama) {
      salir(
        `la copia está ocupada con «${actual.replace("obrera/", "")}». Revísala y límpiala antes:\n` +
          `  node scripts/obrera.mjs diff ${actual.replace("obrera/", "")}\n` +
          `  node scripts/obrera.mjs limpia ${actual.replace("obrera/", "")}`,
      );
    }
    process.stderr.write(`obrera: sigo en la copia de «${tarea}», con lo que ya había escrito.\n`);
  } else {
    const head = git(["rev-parse", "--short", "HEAD"]).trim();
    git(["worktree", "add", "-q", "-b", rama, COPIA, "HEAD"]);
    process.stderr.write(`obrera: copia aislada creada en ${COPIA} (rama ${rama}, desde ${head}).\n`);
  }

  if (!existsSync(join(COPIA, "node_modules"))) {
    process.stderr.write("obrera: instalando dependencias en la copia…\n");
    const r = spawnSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], {
      cwd: COPIA,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) salir(`pnpm install falló en la copia:\n${r.stderr || r.stdout}`);
  }
}

/** Lo escrito por la obrera, incluidos los archivos nuevos. */
function diferencias(completo) {
  if (!existsSync(COPIA)) salir("no hay copia aislada: la obrera no ha escrito nada.");
  // `-N` marca los archivos nuevos para que aparezcan en el diff sin añadirlos.
  git(["add", "-A", "-N"], COPIA);
  const resumen = git(["diff", "--stat"], COPIA);
  process.stdout.write(resumen.trim() ? resumen : "La obrera no cambió nada.\n");
  if (completo) process.stdout.write(git(["diff"], COPIA));
}

const [oficio, ...resto] = process.argv.slice(2);

switch (oficio) {
  case "revisa": {
    const flash = resto[0] === "--flash";
    const encargo = (flash ? resto.slice(1) : resto).join(" ").trim();
    if (!encargo) salir('falta el encargo. Uso: node scripts/obrera.mjs revisa [--flash] "encargo"');
    candadoEntrenamiento();
    const codigo = await lanzar(
      [
        "-p",
        ENCARGO_REVISA + encargo,
        "--mode",
        "plan",
        "--sandbox",
        "--model",
        flash ? MODELOS.flash : MODELOS.pro,
      ],
      RAIZ,
    );
    process.exit(codigo);
  }

  case "programa": {
    const tarea = nombreDeTarea(resto[0]);
    const encargo = resto.slice(1).join(" ").trim();
    if (!encargo) salir('falta el encargo. Uso: node scripts/obrera.mjs programa <tarea> "encargo"');
    candadoEntrenamiento();
    prepararCopia(tarea);
    const codigo = await lanzar(
      ["-p", ENCARGO_PROGRAMA(tarea) + encargo, "--model", MODELOS.pro, "--print-timeout", "40m"],
      COPIA,
    );
    process.stdout.write("\n── lo que cambió en la copia ──\n");
    diferencias(false);
    process.stdout.write(`\nPara revisarlo entero: node scripts/obrera.mjs diff ${tarea} --completo\n`);
    process.exit(codigo);
  }

  case "diff": {
    nombreDeTarea(resto[0]);
    diferencias(resto.includes("--completo"));
    break;
  }

  case "limpia": {
    const tarea = nombreDeTarea(resto[0]);
    if (existsSync(COPIA)) git(["worktree", "remove", "--force", COPIA]);
    spawnSync("git", ["branch", "-D", `obrera/${tarea}`], { cwd: RAIZ });
    process.stdout.write(`Copia y rama de «${tarea}» borradas.\n`);
    break;
  }

  default:
    salir(
      [
        "oficio desconocido. Uso:",
        '  node scripts/obrera.mjs programa <tarea> "encargo"',
        "  node scripts/obrera.mjs diff <tarea> [--completo]",
        "  node scripts/obrera.mjs limpia <tarea>",
        '  node scripts/obrera.mjs revisa [--flash] "encargo"',
      ].join("\n"),
    );
}
