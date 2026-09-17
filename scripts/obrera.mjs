#!/usr/bin/env node
/**
 * Las obreras Gemini — orquesta de modelos, ver docs/ORQUESTA.md.
 *
 * Claude Code es la maestra: planifica, escribe el encargo, revisa y hace
 * commit. Gemini es la obrera: **programa** lo que se le encarga, o revisa. Corre
 * con la CLI de Antigravity (`agy`) sobre la suscripción Google AI Pro de quien
 * la usa, sin clave de API, con el modelo más capaz y el máximo esfuerzo.
 *
 *   node scripts/obrera.mjs programa <tarea> --encargo docs/encargos/<tarea>.md [--otra]
 *   node scripts/obrera.mjs programa <tarea> "encargo" [--otra]
 *   node scripts/obrera.mjs diff <tarea> [--completo]    lo que escribió, para revisarlo
 *   node scripts/obrera.mjs limpia <tarea>               borra su copia, su rama y sus permisos
 *   node scripts/obrera.mjs copias                       qué obreras hay abiertas
 *   node scripts/obrera.mjs revisa [--flash] "encargo"   solo lee y opina
 *   node scripts/obrera.mjs revisa --encargo <archivo>   ídem, con el encargo en un archivo
 *
 * LOS CANDADOS, Y NINGUNO ES DECORATIVO
 *
 *  1. **Escribe en una copia, nunca en el proyecto.** Cada tarea tiene su
 *     `git worktree` en `<proyecto>-obreras/<tarea>`, rama `obrera/<tarea>`. El
 *     permiso de escribir en `apps/` de ESA copia lo añade este script al abrirla
 *     y lo quita al limpiarla (`~/.gemini/antigravity-cli/settings.json`); el
 *     proyecto está negado siempre. Solo puede ejecutar
 *     `pnpm typecheck|test|arch|verify`: ni `git`, ni borrar, ni internet.
 *  2. **Una obrera a la vez, salvo que se pida otra.** Abrir una segunda copia
 *     exige `--otra`, y la maestra solo lo pasa después de preguntar a quien la
 *     usa (acuerdo del 2026-09-16).
 *  3. **No arranca si Google puede entrenar con el código.** Hasta que quien la
 *     usa desactive la telemetría y lo declare con `L2_OBRERA_SIN_ENTRENAMIENTO=1`,
 *     la obrera se niega. Fail-closed (regla 4).
 *  4. **Nada de lo suyo entra solo.** La maestra lee el diff, corre `pnpm verify`,
 *     lo prueba y lo aplica ella en `main`. La obrera no tiene `git`.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");
/** Las copias aisladas viven al lado del proyecto, una carpeta por tarea. */
const OBRERAS = join(dirname(RAIZ), `${basename(RAIZ)}-obreras`);
const copiaDe = (tarea) => join(OBRERAS, tarea);
const barras = (p) => p.replaceAll("\\", "/");

const AJUSTES_AGY = join(homedir(), ".gemini", "antigravity-cli", "settings.json");

/** El modelo más capaz y el máximo esfuerzo (pedido del 2026-09-16). */
const MODELOS = {
  pro: "gemini-3.1-pro-high",
  flash: "gemini-3.8-flash-high",
};
const ESFUERZO = "high";

const REGLAS = `Lee CLAUDE.md antes de nada: sus cinco reglas mandan (dominio puro, @l2/ui sin dominio, dinero en bigint con su moneda, fail-closed, nada se borra), igual que sus reglas de componentes (colores solo de tokens, estado con color + icono + texto, tnum, objetivos táctiles, formato monetario y horario de Venezuela, sin emoji).
Aplica tus skills cuando correspondan: web-design-guidelines (interfaz y accesibilidad), vercel-react-best-practices (React y Next.js), frontend-design (dirección visual). design-taste-frontend solo como criterio de calidad visual: L2 Control es un producto de operación (POS, KDS, panel), no una landing. Las skills ya están cargadas: no las busques en el disco.
Solo puedes leer la carpeta del proyecto (y tu copia, si la tienes). No explores otras carpetas del equipo: te lo van a negar.
Escribe como el código vecino: mismos patrones, mismos nombres, comentarios en español que expliquen el porqué.
No inventes rutas ni APIs: si no lo has leído, léelo o dilo.`;

const ENCARGO_REVISA = `Eres una obrera de revisión en el repositorio L2 Control (Next.js 16, React 19, TypeScript estricto, Tailwind 4, pnpm).
La raíz del proyecto es ${barras(RAIZ)}: toda ruta relativa del encargo es desde ahí. No busques archivos fuera de esa carpeta.
Trabajas en MODO SOLO LECTURA: lees, no modificas ni ejecutas nada. No ejecutes comandos de terminal (ni siquiera echo): usa tus herramientas de lectura y búsqueda de archivos. Un comando negado termina tu trabajo sin entregar nada.
${REGLAS}
Responde en español, concreto, citando archivo:línea. Si propones código, dalo como fragmento para revisión.

TAREA:
`;

const ENCARGO_PROGRAMA = (tarea) => {
  const copia = barras(copiaDe(tarea));
  return `Eres una obrera programadora en el repositorio L2 Control (Next.js 16, React 19, TypeScript estricto, Tailwind 4, pnpm).
Trabajas en una COPIA AISLADA: ${copia} (rama obrera/${tarea}). Todas las rutas que escribas deben estar dentro de esa carpeta.
Solo puedes escribir dentro de ${copia}/apps/. No puedes tocar packages/ (contratos, dominio, ui): si la tarea lo necesitara, NO lo hagas y dilo al final.
No puedes usar git ni borrar archivos. Los únicos comandos permitidos son: pnpm typecheck, pnpm test, pnpm arch, pnpm verify, escritos exactamente así y con el directorio de trabajo ${copia} (la raíz, donde está pnpm-workspace.yaml).
Para leer y buscar usa SOLO tus herramientas de archivos (ver archivo, buscar en archivos). NUNCA la terminal (Select-String, findstr, grep, cat, type, Get-Content, dir, ls…): está bloqueada, y un comando negado aborta TODO tu trabajo sin entregar nada. Si la búsqueda no encuentra algo, lee el archivo por tramos (línea inicial y final).
${REGLAS}
Haz exactamente lo que pide el encargo, ni más ni menos. Si algo no está claro, toma la decisión más conservadora y anótala.
Al terminar, ejecuta "pnpm typecheck" y corrige hasta que pase. Si no lo consigues, detente y explica el error. No digas que pasa si no lo ejecutaste.
Termina con un resumen en español: archivos creados o modificados, decisiones que tomaste y lo que quedó pendiente.

ENCARGO:
`;
};

function salir(mensaje, codigo = 1) {
  process.stderr.write(`obrera: ${mensaje}\n`);
  process.exit(codigo);
}

function git(args, cwd = RAIZ) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) salir(`git ${args.join(" ")} falló:\n${r.stderr}`);
  return r.stdout;
}

function leerEncargo(ruta) {
  if (!ruta) salir("falta la ruta del archivo después de --encargo.");
  const completa = isAbsolute(ruta) ? ruta : join(RAIZ, ruta);
  if (!existsSync(completa)) salir(`no encuentro el encargo: ${completa}`);
  return readFileSync(completa, "utf8").trim();
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
      join(homedir(), ".local", "bin", "agy"),
    ].find((p) => p && existsSync(p)) ?? "agy"
  );
}

/* ── permisos de cada copia ─────────────────────────────────────────────── */

/**
 * Las reglas que este script gestiona son las que nombran la carpeta de las
 * copias. Así se pueden quitar sin tocar las que puso una persona.
 */
function reglasDeCopia(tarea) {
  const copia = barras(copiaDe(tarea));
  return [`read_file(${copia}/)`, `write_file(${copia}/apps/)`];
}

function ajustarPermisos(tarea, poner) {
  if (!existsSync(AJUSTES_AGY)) salir(`no encuentro los permisos de agy en ${AJUSTES_AGY}. Ver docs/ORQUESTA.md.`);
  const ajustes = JSON.parse(readFileSync(AJUSTES_AGY, "utf8"));
  const allow = ajustes.permissions?.allow;
  if (!Array.isArray(allow)) salir("los permisos de agy no tienen la forma esperada (permissions.allow).");
  const suyas = reglasDeCopia(tarea);
  const resto = allow.filter((r) => !suyas.includes(r));
  ajustes.permissions.allow = poner ? [...resto, ...suyas] : resto;
  writeFileSync(AJUSTES_AGY, JSON.stringify(ajustes, null, 2) + "\n", "utf8");
}

/* ── copias ─────────────────────────────────────────────────────────────── */

function copiasAbiertas() {
  const lista = git(["worktree", "list", "--porcelain"]);
  const prefijo = `worktree ${barras(OBRERAS)}/`;
  return lista
    .split(/\r?\n/)
    .filter((l) => l.startsWith(prefijo))
    .map((l) => l.slice(prefijo.length));
}

/** Deja lista la copia de `obrera/<tarea>`, desde el `HEAD` del proyecto. */
function prepararCopia(tarea, permiteOtra) {
  const copia = copiaDe(tarea);
  const abiertas = copiasAbiertas();

  if (abiertas.includes(tarea)) {
    process.stderr.write(`obrera: sigo en la copia de «${tarea}», con lo que ya había escrito.\n`);
  } else {
    // Candado 2: una segunda obrera se pide, no se abre sola.
    if (abiertas.length > 0 && !permiteOtra) {
      salir(
        `ya hay ${abiertas.length === 1 ? "una obrera abierta" : `${abiertas.length} obreras abiertas`} (${abiertas.join(", ")}).\n` +
          "  Abrir otra en paralelo exige preguntarlo antes y pasar --otra.",
      );
    }
    const head = git(["rev-parse", "--short", "HEAD"]).trim();
    git(["worktree", "add", "-q", "-b", `obrera/${tarea}`, copia, "HEAD"]);
    process.stderr.write(`obrera: copia aislada creada en ${copia} (rama obrera/${tarea}, desde ${head}).\n`);
  }

  ajustarPermisos(tarea, true);

  if (!existsSync(join(copia, "node_modules"))) {
    process.stderr.write("obrera: instalando dependencias en la copia…\n");
    // Un texto fijo, sin nada que venga de fuera: en Windows `pnpm` es un .cmd
    // y necesita shell, y pasarle una lista de argumentos con shell está
    // desaconsejado (DEP0190).
    const r = spawnSync("pnpm install --frozen-lockfile --prefer-offline", {
      cwd: copia,
      encoding: "utf8",
      shell: true,
    });
    if (r.status !== 0) salir(`pnpm install falló en la copia:\n${r.stderr || r.stdout}`);
  }
  return copia;
}

/** Lo escrito por la obrera, incluidos los archivos nuevos. */
function diferencias(tarea, completo) {
  const copia = copiaDe(tarea);
  if (!existsSync(copia)) salir(`no hay copia de «${tarea}»: la obrera no ha escrito nada.`);
  // `-N` marca los archivos nuevos para que aparezcan en el diff sin añadirlos.
  git(["add", "-A", "-N"], copia);
  const resumen = git(["diff", "--stat"], copia);
  process.stdout.write(resumen.trim() ? resumen : "La obrera no cambió nada.\n");
  if (completo) process.stdout.write(git(["diff"], copia));
}

/* ── lanzar a Gemini ────────────────────────────────────────────────────── */

/** Lanza `agy -p` y devuelve su código. Una denegación sin respuesta es un fallo. */
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

const [oficio, ...resto] = process.argv.slice(2);
const bandera = (b) => resto.includes(b);
const sinBanderas = resto.filter((x) => !["--otra", "--flash", "--completo"].includes(x));

switch (oficio) {
  case "revisa": {
    const encargo =
      sinBanderas[0] === "--encargo" ? leerEncargo(sinBanderas[1]) : sinBanderas.join(" ").trim();
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
        bandera("--flash") ? MODELOS.flash : MODELOS.pro,
        "--effort",
        ESFUERZO,
        "--print-timeout",
        "40m",
      ],
      RAIZ,
    );
    process.exit(codigo);
  }

  case "programa": {
    const tarea = nombreDeTarea(sinBanderas[0]);
    // El encargo largo vive en docs/encargos/<tarea>.md: se versiona con el
    // código que produjo y no pasa por las comillas de la terminal.
    const encargo =
      sinBanderas[1] === "--encargo" ? leerEncargo(sinBanderas[2]) : sinBanderas.slice(1).join(" ").trim();
    if (!encargo) {
      salir(
        "falta el encargo. Uso: node scripts/obrera.mjs programa <tarea> --encargo docs/encargos/<tarea>.md [--otra]",
      );
    }
    candadoEntrenamiento();
    const copia = prepararCopia(tarea, bandera("--otra"));
    const codigo = await lanzar(
      [
        "-p",
        ENCARGO_PROGRAMA(tarea) + encargo,
        "--model",
        MODELOS.pro,
        "--effort",
        ESFUERZO,
        "--print-timeout",
        "60m",
      ],
      copia,
    );
    process.stdout.write(`\n── lo que cambió en la copia de «${tarea}» ──\n`);
    diferencias(tarea, false);
    process.stdout.write(`\nPara revisarlo entero: node scripts/obrera.mjs diff ${tarea} --completo\n`);
    process.exit(codigo);
  }

  case "diff": {
    diferencias(nombreDeTarea(sinBanderas[0]), bandera("--completo"));
    break;
  }

  case "copias": {
    const abiertas = copiasAbiertas();
    process.stdout.write(abiertas.length ? abiertas.map((t) => `${t}\t${copiaDe(t)}`).join("\n") + "\n" : "No hay obreras abiertas.\n");
    break;
  }

  case "limpia": {
    const tarea = nombreDeTarea(sinBanderas[0]);
    const copia = copiaDe(tarea);
    // En Windows, `git worktree remove` no puede con los enlaces que deja pnpm
    // en `node_modules` («Directory not empty»). Se borra la carpeta a mano y
    // luego se le dice a git que la olvide.
    if (existsSync(copia)) {
      spawnSync("git", ["worktree", "remove", "--force", copia], { cwd: RAIZ });
      if (existsSync(copia)) rmSync(copia, { recursive: true, force: true, maxRetries: 3 });
    }
    git(["worktree", "prune"]);
    spawnSync("git", ["branch", "-D", `obrera/${tarea}`], { cwd: RAIZ });
    ajustarPermisos(tarea, false);
    process.stdout.write(`Copia, rama y permisos de «${tarea}» borrados.\n`);
    break;
  }

  default:
    salir(
      [
        "oficio desconocido. Uso:",
        "  node scripts/obrera.mjs programa <tarea> --encargo docs/encargos/<tarea>.md [--otra]",
        "  node scripts/obrera.mjs diff <tarea> [--completo]",
        "  node scripts/obrera.mjs limpia <tarea>",
        "  node scripts/obrera.mjs copias",
        '  node scripts/obrera.mjs revisa [--flash] "encargo" | --encargo <archivo>',
      ].join("\n"),
    );
}
