#!/usr/bin/env node
/**
 * El agente de impresión de L2 Control — ADR-026.
 *
 * Doble clic en `l2-impresion.exe` abre el asistente: si no está instalado, lo instala (pide pegar la
 * dirección y el código que da Ajustes → Impresoras); si ya lo está, enseña su estado y ofrece una
 * prueba, volver a vincularlo o desinstalarlo. Las mismas cosas, por órdenes:
 *
 *   l2-impresion instalar [<servidor> <código>]   instala y deja corriendo la tarea de Windows
 *   l2-impresion estado                            tarea, servidor y últimas líneas del registro
 *   l2-impresion probar <ip> [puerto] [ancho]      imprime una prueba sin pasar por el servidor
 *   l2-impresion desinstalar                       quita la tarea y la credencial
 *   l2-impresion iniciar [--config <archivo>]      lo que corre la tarea (o a mano, en desarrollo)
 *   l2-impresion vincular <servidor> <código> [--config <archivo>]   solo vincular (desarrollo)
 *
 * La credencial es una llave: quien la tenga imprime en el local. Retirar el agente desde el panel la
 * invalida.
 *
 * Instalado (`.exe`), se actualiza solo (T-8c, `actualizacion.ts`): dice su versión, baja la nueva del servidor, la
 * comprueba y la cambia con la cola vacía; si la nueva no arranca, vuelve la anterior.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { escpos, type Ancho } from "@l2/domain-printing";
import { isSea } from "node:sea";
import { anotarArranque, archivosEn, programarActualizacion } from "./actualizacion.ts";
import { crearAgente } from "./agente.ts";
import { imprimir } from "./imprimir.ts";
import { crearRegistro, type Registro } from "./registro.ts";
import { leerVinculacion } from "./vinculacion.ts";
import {
  CARPETA,
  CONFIG_INSTALADA,
  desinstalar,
  esAdministrador,
  esWindows,
  estadoDeTarea,
  pedirAdministrador,
  prepararCarpeta,
  protegerConfig,
  registrarTarea,
  TAREA,
  ultimasLineas,
} from "./instalacion.ts";

declare const __VERSION__: string | undefined;
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : "desarrollo";

/**
 * La credencial y a dónde va. `web`: de dónde baja sus versiones (T-8c); sin ella, del mismo servidor (en producción son
 * la misma dirección). `tarea`: la tarea de Windows que lo arranca; sin ella, la de la instalación.
 */
type Config = { servidor: string; credencial: string; nombre: string; web?: string; tarea?: string };

/** En desarrollo, la credencial va en la carpeta del usuario; instalado, en ProgramData. */
const CONFIG_DESARROLLO = process.env.L2_AGENTE_CONFIG ?? join(homedir(), ".l2-impresion", "agente.json");
const configPorDefecto = () => (existsSync(CONFIG_INSTALADA) ? CONFIG_INSTALADA : CONFIG_DESARROLLO);

const consola = crearRegistro();

const ESTADO_TAREA: Readonly<Record<string, string>> = {
  Running: "corriendo",
  Ready: "instalada, pero parada",
  Disabled: "desactivada",
  Queued: "en cola para arrancar",
};

/** `--config x` y demás banderas, aparte de los argumentos sueltos. */
function leerArgs(argv: readonly string[]) {
  const sueltos: string[] = [];
  const banderas = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const sig = argv[i + 1];
      if (sig !== undefined && !sig.startsWith("--") && a !== "--pausar") {
        banderas.set(a.slice(2), sig);
        i++;
      } else banderas.set(a.slice(2), true);
    } else sueltos.push(a);
  }
  return { sueltos, banderas };
}

async function preguntar(pregunta: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(pregunta)).trim();
  } finally {
    rl.close();
  }
}

async function pausar() {
  if (process.stdin.isTTY) await preguntar("\nPulsa Enter para cerrar.");
}

/** ¿Responde el worker? Su `/salud` dice su versión. */
async function salud(servidor: string): Promise<string | null> {
  try {
    const r = await fetch(`${servidor}/salud`, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    return ((await r.json()) as { version?: string }).version ?? "?";
  } catch {
    return null;
  }
}

async function vincular(servidor: string, codigo: string, archivo: string, r: Registro): Promise<Config> {
  const res = await fetch(`${servidor}/impresion/vincular`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo }),
    signal: AbortSignal.timeout(15_000),
  });
  const cuerpo = (await res.json().catch(() => null)) as { ok?: boolean; mensaje?: string; valor?: { nombre: string; credencial: string; web?: string } } | null;
  if (!cuerpo?.ok || !cuerpo.valor) throw new Error(cuerpo?.mensaje ?? `El servidor respondió ${res.status}.`);
  const web = typeof cuerpo.valor.web === "string" && /^https?:\/\//.test(cuerpo.valor.web) && cuerpo.valor.web !== servidor ? { web: cuerpo.valor.web } : {};
  const config: Config = { servidor, credencial: cuerpo.valor.credencial, nombre: cuerpo.valor.nombre, ...web };
  mkdirSync(dirname(archivo), { recursive: true });
  writeFileSync(archivo, JSON.stringify(config, null, 2), { mode: 0o600 });
  // Instalada, la lee la tarea con la cuenta del sistema: nadie más. En desarrollo la lee quien la vinculó.
  if (archivo === CONFIG_INSTALADA) protegerConfig(archivo);
  r.info(`Vinculado como «${config.nombre}».`);
  return config;
}

async function probar(ip: string, puerto: number, ancho: Ancho) {
  const doc = {
    renglones: [
      { tipo: "TEXTO", texto: "L2 Control", alinear: "CENTRO", negrita: true, grande: true },
      { tipo: "TEXTO", texto: "Prueba del agente", alinear: "CENTRO" },
      { tipo: "LINEA" },
      { tipo: "PAR", izq: "Impresora", der: `${ip}:${puerto}` },
      { tipo: "PAR", izq: "Papel", der: `${ancho} mm` },
      { tipo: "TEXTO", texto: "Ññ áéíóú ¿? ¡!" },
    ],
  } as const;
  const r = await imprimir({ ip, puerto }, escpos(doc, ancho));
  if (r.ok) consola.info(`Prueba impresa en ${ip}:${puerto}${r.aviso ? ` (${r.aviso})` : ""}.`);
  else throw new Error(r.error);
}

/** Lo que la tarea corre: se conecta y atiende la cola hasta que lo paren. */
function iniciar(archivo: string) {
  if (!existsSync(archivo)) throw new Error(`No hay credencial en ${archivo}: primero instálalo (o «vincular» en desarrollo).`);
  const c = JSON.parse(readFileSync(archivo, "utf8")) as Config;
  const r = crearRegistro({ archivo: join(dirname(archivo), "agente.log"), consola: Boolean(process.stdout.isTTY) });
  r.info(`Agente ${VERSION} «${c.nombre}» hacia ${c.servidor}.`);
  // Empaquetado y en Windows se actualiza solo (T-8c). Su arranque queda anotado: el guion del cambio lo mira.
  const actualiza = isSea() && esWindows;
  const archivos = archivosEn(dirname(archivo), process.execPath);
  if (actualiza) {
    anotarArranque(archivos, VERSION, false);
    setTimeout(() => anotarArranque(archivos, VERSION, true), 15_000);
  }
  const agente = crearAgente({ servidor: c.servidor, credencial: c.credencial, version: VERSION, imprimir: (d, b) => imprimir(d, b), registro: r });
  let pararActualizacion = () => {};
  const salir = () => {
    r.info("Agente detenido.");
    pararActualizacion();
    agente.parar();
    process.exit(0);
  };
  if (actualiza) {
    pararActualizacion = programarActualizacion({
      agente,
      web: (c.web ?? c.servidor).replace(/\/$/, ""),
      credencial: c.credencial,
      tarea: c.tarea ?? TAREA,
      version: VERSION,
      a: archivos,
      registro: r,
      salir,
    });
  }
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);
  // Un error que nadie esperaba: se anota y se sale con error, y Windows lo vuelve a levantar.
  process.on("uncaughtException", (e) => {
    r.error(`Error inesperado: ${e.message}`);
    process.exit(1);
  });
}

async function estado() {
  const archivo = configPorDefecto();
  console.log(`\nL2 Control · agente de impresión ${VERSION}`);
  if (!existsSync(archivo)) {
    console.log("No está instalado en este equipo.");
    return false;
  }
  let c: Config | null = null;
  try {
    c = JSON.parse(readFileSync(archivo, "utf8")) as Config;
  } catch {
    console.log(`No se puede leer ${archivo} (hace falta abrirlo como administrador).`);
  }
  if (c) {
    console.log(`Vinculado como «${c.nombre}» hacia ${c.servidor}.`);
    const v = await salud(c.servidor);
    console.log(v ? `El servidor responde (versión ${v}).` : "El servidor NO responde: revisa el internet de la laptop.");
  }
  const t = estadoDeTarea();
  if (esWindows) console.log(t ? `Tarea de Windows: ${ESTADO_TAREA[t] ?? t}.` : "Tarea de Windows: no instalada (no arranca sola).");
  const lineas = ultimasLineas(join(dirname(archivo), "agente.log"));
  if (lineas.length > 0) console.log(`\nÚltimo registro (${join(dirname(archivo), "agente.log")}):\n${lineas.map((l) => `  ${l}`).join("\n")}`);
  return true;
}

async function instalar(servidorDado: string | undefined, codigoDado: string | undefined, pausa: boolean) {
  if (!esWindows) throw new Error("La instalación como tarea es para Windows. En otro sistema, usa «vincular» e «iniciar».");
  let servidor = servidorDado ?? null;
  let codigo = codigoDado ?? null;
  if (!servidor || !codigo) {
    console.log("\nEn el panel: Ajustes → Impresoras → Agente de impresión → «Vincular».");
    const pegado = await preguntar("Pega aquí la dirección del servidor y el código que te dio: ");
    const leido = leerVinculacion(pegado);
    servidor = servidor ?? leido.servidor;
    codigo = codigo ?? leido.codigo;
    if (!servidor) servidor = leerVinculacion(await preguntar("Falta la dirección del servidor (empieza por http): ")).servidor;
    if (!codigo) codigo = leerVinculacion(await preguntar("Falta el código (8 letras y números, p. ej. K7MQ-4XPZ): ")).codigo;
  }
  if (!servidor || !codigo) throw new Error("Sin la dirección del servidor y el código no se puede vincular.");

  if (!esAdministrador()) {
    console.log("\nWindows te pedirá permiso de administrador para instalarlo (una sola vez).");
    if (!pedirAdministrador(["instalar", servidor, codigo, "--pausar"])) throw new Error("No se dio el permiso de administrador: no se instaló nada.");
    return;
  }

  console.log(`\nComprobando el servidor ${servidor}…`);
  const v = await salud(servidor);
  if (!v) throw new Error(`No se llega a ${servidor}. Revisa el internet de la laptop y la dirección.`);
  console.log(`  responde (versión ${v}).`);

  prepararCarpeta();
  await vincular(servidor, codigo, CONFIG_INSTALADA, consola);
  registrarTarea(CONFIG_INSTALADA);
  console.log(`Instalado en ${CARPETA}. Arranca solo con la laptop y se reinicia si se cae.`);
  // Le da un momento para conectarse y lo enseña.
  await new Promise((r) => setTimeout(r, 5_000));
  await estado();
  console.log("\nListo. Ya puedes imprimir una prueba desde Ajustes → Impresoras.");
  if (pausa) await pausar();
}

async function quitar(pausa: boolean) {
  if (!esAdministrador()) {
    console.log("Windows te pedirá permiso de administrador para desinstalarlo.");
    if (!pedirAdministrador(["desinstalar", "--pausar"])) throw new Error("No se dio el permiso de administrador.");
    return;
  }
  desinstalar();
  console.log("Desinstalado: la tarea y la credencial ya no están. Retira también el agente en Ajustes → Impresoras.");
  if (pausa) await pausar();
}

/** Doble clic: instalar si no lo está; si lo está, el estado y qué hacer. */
async function asistente() {
  const instalado = await estado();
  if (!instalado) {
    await instalar(undefined, undefined, true);
    return;
  }
  console.log("\n¿Qué quieres hacer?\n  1  Imprimir una prueba en una impresora\n  2  Volver a vincularlo (otro código)\n  3  Desinstalarlo\n  Enter  Salir");
  const op = await preguntar("> ");
  if (op === "1") {
    const ip = await preguntar("IP de la impresora (p. ej. 192.168.1.50): ");
    const ancho = (await preguntar("Ancho del rollo, 80 o 58 [80]: ")) === "58" ? 58 : 80;
    await probar(ip, 9100, ancho);
    await pausar();
  } else if (op === "2") await instalar(undefined, undefined, true);
  else if (op === "3") await quitar(true);
}

async function main() {
  const { sueltos, banderas } = leerArgs(process.argv.slice(2));
  const [orden, ...args] = sueltos;
  const config = typeof banderas.get("config") === "string" ? (banderas.get("config") as string) : configPorDefecto();
  const pausa = banderas.has("pausar");
  try {
    if (orden === undefined) await asistente();
    else if (orden === "instalar") await instalar(args[0], args[1], pausa);
    else if (orden === "desinstalar") await quitar(pausa);
    else if (orden === "estado") await estado();
    else if (orden === "iniciar") iniciar(config);
    else if (orden === "vincular" && args[0] && args[1]) await vincular(args[0].replace(/\/$/, ""), args[1], typeof banderas.get("config") === "string" ? config : CONFIG_DESARROLLO, consola);
    else if (orden === "probar" && args[0]) await probar(args[0], Number(args[1] ?? 9100), (Number(args[2] ?? 80) === 58 ? 58 : 80) as Ancho);
    else if (orden === "version") console.log(VERSION);
    else {
      console.log("Uso: l2-impresion [instalar [<servidor> <código>] | estado | probar <ip> [puerto] [ancho] | desinstalar | iniciar [--config <archivo>]]");
      process.exitCode = 2;
    }
  } catch (e) {
    consola.error(e instanceof Error ? e.message : String(e));
    if (orden === undefined || pausa) await pausar();
    process.exitCode = 1;
  }
}

void main();
