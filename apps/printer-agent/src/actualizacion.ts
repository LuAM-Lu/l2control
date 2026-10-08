/**
 * El agente se actualiza solo — T-8c, ADR-028 punto 5.
 *
 * Dice su versión al servidor (en el apretón de manos) y le pregunta cuál hay (`/descargas/agente/version`, con su
 * credencial): al arrancar, cada 30 minutos y cuando administración pide «Actualizar ahora». Si hay una más nueva (o
 * se pidió esa), y la cola está vacía, la descarga del propio servidor y comprueba que es la publicada:
 *
 *  1. su huella SHA-256 es la que el servidor publica con la versión; si no, no se instala (y se avisa);
 *  2. el ejecutable nuevo arranca y dice esa versión (`l2-impresion version`); si no, no se instala.
 *
 * El cambio lo hace otra tarea de Windows, «<tarea> (cambio)», con un guion de PowerShell: un programa no se reemplaza a
 * sí mismo mientras corre, y lo que lance el agente muere con su tarea (Windows cierra juntos los procesos de una
 * tarea; se vio en el ensayo). Esa tarea espera a que el agente se cierre, pone el nuevo en su sitio y vuelve a
 * arrancar la del agente. Si el nuevo no queda vivo (su `arranque.json` con su versión, estable), la para, vuelve a
 * poner el anterior y la arranca otra vez. El resultado queda en `actualizacion.json`, que el agente que quede cuenta
 * al servidor al conectarse.
 *
 * Solo empaquetado (`.exe`) y en Windows: en desarrollo no hay ejecutable que cambiar.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NotaDeActualizacionSchema, VersionDelAgenteSchema, type NotaDeActualizacionDto, type VersionDelAgenteDto } from "@l2/contracts";

/** «0.85.1» → [0, 85, 1]. Lo que no es una versión, `null`. */
function partes(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** ¿Es `a` posterior a `b`? Lo que no es una versión no es posterior a nada. */
export function esPosterior(a: string, b: string): boolean {
  const x = partes(a);
  const y = partes(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

/**
 * ¿Se cambia a la disponible? Solo a una posterior (un servidor que volvió atrás no arrastra al agente), o a la que
 * administración pidió con «Actualizar ahora», aunque sea anterior. Nunca en desarrollo ni a una que ya falló aquí,
 * salvo pedida.
 */
export function debeCambiar(propia: string, d: VersionDelAgenteDto, fallidas: readonly string[]): boolean {
  if (!partes(propia) || d.version === propia) return false;
  if (d.pedida) return true;
  return esPosterior(d.version, propia) && !fallidas.includes(d.version);
}

/** La huella SHA-256 de un archivo, en hexadecimal. */
export function huellaDe(archivo: string): string {
  return createHash("sha256").update(readFileSync(archivo)).digest("hex");
}

export type Archivos = Readonly<{
  carpeta: string;
  /** El ejecutable en marcha (el que la tarea arranca). */
  exe: string;
  nuevo: string;
  anterior: string;
  /** El resultado del último cambio, hasta que se cuenta al servidor. */
  nota: string;
  /** Lo que escribe el agente al arrancar (versión, proceso, si ya está estable): el guion lo mira. */
  arranque: string;
  /** Las versiones que no arrancaron aquí: no se vuelven a probar solas. */
  fallidas: string;
  guion: string;
}>;

export function archivosEn(carpeta: string, exe: string): Archivos {
  return {
    carpeta,
    exe,
    nuevo: join(carpeta, "l2-impresion.nuevo.exe"),
    anterior: join(carpeta, "l2-impresion.anterior.exe"),
    nota: join(carpeta, "actualizacion.json"),
    arranque: join(carpeta, "arranque.json"),
    fallidas: join(carpeta, "versiones-fallidas.json"),
    guion: join(carpeta, "actualizar.ps1"),
  };
}

/** Pregunta al servidor qué versión hay. `null` si no responde o no publica ninguna. */
export async function consultar(web: string, credencial: string): Promise<VersionDelAgenteDto | null> {
  try {
    const r = await fetch(`${web}/descargas/agente/version`, { headers: { authorization: `Bearer ${credencial}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const v = VersionDelAgenteSchema.safeParse(await r.json());
    return v.success ? v.data : null;
  } catch {
    return null;
  }
}

export type Descarga = Readonly<{ ok: true } | { ok: false; resultado: "HUELLA_EQUIVOCADA" | "NO_ARRANCA" | "ERROR"; detalle: string }>;

/**
 * Descarga la versión al archivo `nuevo` y comprueba que es la publicada: su huella y que arranca diciendo su
 * versión. Lo que no pasa se borra: nunca queda a medias en la carpeta.
 */
export async function descargarYComprobar(o: { web: string; credencial: string; d: VersionDelAgenteDto; a: Archivos }): Promise<Descarga> {
  const parcial = `${o.a.nuevo}.descarga`;
  try {
    const r = await fetch(`${o.web}/descargas/agente/archivo`, { headers: { authorization: `Bearer ${o.credencial}` }, signal: AbortSignal.timeout(300_000) });
    if (!r.ok || !r.body) return { ok: false, resultado: "ERROR", detalle: `El servidor respondió ${r.status} a la descarga.` };
    await pipeline(Readable.fromWeb(r.body as import("node:stream/web").ReadableStream), createWriteStream(parcial));
    const huella = huellaDe(parcial);
    if (huella !== o.d.sha256) {
      rmSync(parcial, { force: true });
      return { ok: false, resultado: "HUELLA_EQUIVOCADA", detalle: `La descarga de la ${o.d.version} no tiene la huella publicada: no se instala.` };
    }
    renameSync(parcial, o.a.nuevo);
    const dice = spawnSync(o.a.nuevo, ["version"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    if (dice.status !== 0 || dice.stdout.trim() !== o.d.version) {
      rmSync(o.a.nuevo, { force: true });
      return { ok: false, resultado: "NO_ARRANCA", detalle: `La ${o.d.version} descargada no arranca: no se instala.` };
    }
    return { ok: true };
  } catch (e) {
    rmSync(parcial, { force: true });
    return { ok: false, resultado: "ERROR", detalle: `No se pudo descargar la ${o.d.version}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Una comilla simple para PowerShell (las simples se doblan). */
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * El guion que hace el cambio, fuera de este proceso. Espera a que el agente se cierre, pone el nuevo, arranca la
 * tarea y espera hasta 90 s a que el nuevo diga que arrancó estable; si no, vuelve el anterior. Deja el resultado en
 * `actualizacion.json` para que lo cuente el agente que quede.
 */
export function guionDeCambio(o: { a: Archivos; tarea: string; pid: number; de: string; a_: string }): string {
  const { a } = o;
  return [
    "$ErrorActionPreference = 'Continue'",
    `$exe = ${ps(a.exe)}; $nuevo = ${ps(a.nuevo)}; $anterior = ${ps(a.anterior)}; $nota = ${ps(a.nota)}; $arranque = ${ps(a.arranque)}`,
    `$tarea = ${ps(o.tarea)}; $version = ${ps(o.a_)}; $de = ${ps(o.de)}`,
    "function Nota($resultado, $detalle) { [ordered]@{ version = $version; de = $de; resultado = $resultado; detalle = $detalle; en = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -Encoding UTF8 -Path $nota }",
    `Wait-Process -Id ${o.pid} -Timeout 60 -ErrorAction SilentlyContinue`,
    "Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue",
    "Start-Sleep -Seconds 2",
    "Copy-Item -Path $exe -Destination $anterior -Force",
    "Copy-Item -Path $nuevo -Destination $exe -Force",
    "Remove-Item -Path $arranque -Force -ErrorAction SilentlyContinue",
    "Start-ScheduledTask -TaskName $tarea",
    "$ok = $false",
    "for ($i = 0; $i -lt 45 -and -not $ok; $i++) {",
    "  Start-Sleep -Seconds 2",
    "  if (Test-Path $arranque) {",
    "    try { $x = Get-Content -Raw -Path $arranque | ConvertFrom-Json } catch { $x = $null }",
    "    if ($x -and $x.version -eq $version -and $x.estable -and (Get-Process -Id $x.pid -ErrorAction SilentlyContinue)) { $ok = $true }",
    "  }",
    "}",
    "if ($ok) { Remove-Item -Path $nuevo -Force -ErrorAction SilentlyContinue; Nota 'ACTUALIZADO' ''; exit 0 }",
    "Stop-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue",
    "Start-Sleep -Seconds 2",
    "Copy-Item -Path $anterior -Destination $exe -Force",
    "Remove-Item -Path $nuevo -Force -ErrorAction SilentlyContinue",
    'Nota \'NO_ARRANCO\' "La $version no arrancó: volvió la $de."',
    "Start-ScheduledTask -TaskName $tarea",
  ].join("\r\n");
}

/** La tarea de Windows que hace el cambio: la del agente con «(cambio)». */
export const tareaDeCambio = (tarea: string) => `${tarea} (cambio)`;

/**
 * La orden que registra (o reemplaza) la tarea del cambio y la arranca ya: con la misma cuenta que el agente (la del
 * sistema, instalado; la del usuario, en un ensayo), sin ventana y con diez minutos como mucho.
 */
export function ordenDeCambio(a: Archivos, tarea: string): string {
  return [
    `$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${ps(`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${a.guion}"`)} -WorkingDirectory ${ps(a.carpeta)}`,
    "$s = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew",
    "$p = if ([Security.Principal.WindowsIdentity]::GetCurrent().IsSystem) { New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest } else { New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive }",
    `Register-ScheduledTask -TaskName ${ps(tareaDeCambio(tarea))} -Action $a -Principal $p -Settings $s -Description 'Cambia el agente de impresión de L2 Control a su versión nueva y vuelve a la anterior si no arranca (T-8c).' -Force | Out-Null`,
    `Start-ScheduledTask -TaskName ${ps(tareaDeCambio(tarea))}`,
  ].join("; ");
}

/**
 * Escribe el guion y lo deja corriendo en su propia tarea de Windows: lo que lanzara este proceso moriría con él. El
 * guion va con BOM: PowerShell 5.1 lee como ANSI un archivo sin él, y la nota lleva acentos.
 */
export function lanzarCambio(o: { a: Archivos; tarea: string; de: string; a_: string }): void {
  writeFileSync(o.a.guion, `﻿${guionDeCambio({ ...o, pid: process.pid })}`, "utf8");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ordenDeCambio(o.a, o.tarea)], {
    stdio: "ignore",
    windowsHide: true,
    timeout: 60_000,
  });
}

/** Lo que el agente escribe al arrancar y, pasados unos segundos sin caerse, «estable». */
export function anotarArranque(a: Archivos, version: string, estable: boolean): void {
  writeFileSync(a.arranque, JSON.stringify({ version, pid: process.pid, estable, en: new Date().toISOString() }), "utf8");
}

/** El resultado del último cambio, si queda por contar. */
export function notaPendiente(a: Archivos): NotaDeActualizacionDto | null {
  if (!existsSync(a.nota)) return null;
  try {
    const n = NotaDeActualizacionSchema.safeParse(JSON.parse(readFileSync(a.nota, "utf8").replace(/^﻿/, "")));
    return n.success ? n.data : null;
  } catch {
    return null;
  }
}

export function anotarResultado(a: Archivos, n: NotaDeActualizacionDto): void {
  writeFileSync(a.nota, JSON.stringify(n), "utf8");
}

export function versionesFallidas(a: Archivos): string[] {
  try {
    const x: unknown = JSON.parse(readFileSync(a.fallidas, "utf8"));
    return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function anotarFallida(a: Archivos, version: string): void {
  const todas = [...new Set([...versionesFallidas(a), version])].slice(-10);
  writeFileSync(a.fallidas, JSON.stringify(todas), "utf8");
}

/* ───────────────────────────────────────────────────────────── el programa */

type Registro = Readonly<{ info: (m: string) => void; error: (m: string) => void }>;
type AgenteQueSeActualiza = Readonly<{
  socket: { on: (evento: string, f: () => void) => unknown; connected: boolean };
  vaciar: () => Promise<number>;
  informar: (n: NotaDeActualizacionDto) => Promise<boolean>;
}>;

/**
 * Revisa la versión al conectarse, cada `cadaMs` y cuando administración pide «Actualizar ahora» (`revisar-version`).
 * Antes de nada cuenta el resultado del último cambio, si quedó por contar. Con una versión que cambiar, vacía la cola,
 * la descarga y la comprueba; si vale, lanza el cambio y sale (`salir`). Devuelve con qué pararlo.
 */
export function programarActualizacion(o: {
  agente: AgenteQueSeActualiza;
  web: string;
  credencial: string;
  tarea: string;
  version: string;
  a: Archivos;
  registro: Registro;
  salir: () => void;
  cadaMs?: number;
}): () => void {
  let ocupado = false;

  async function contarPendiente(): Promise<void> {
    const n = notaPendiente(o.a);
    if (!n) return;
    // Una versión que no arrancó aquí no se vuelve a probar sola.
    if (n.resultado === "NO_ARRANCO") anotarFallida(o.a, n.version);
    if (await o.agente.informar(n)) rmSync(o.a.nota, { force: true });
  }

  async function revisar(): Promise<void> {
    if (ocupado || !o.agente.socket.connected) return;
    ocupado = true;
    try {
      await contarPendiente();
      const d = await consultar(o.web, o.credencial);
      if (!d) return;
      // Pedida y ya en esa versión: se dice, y lo pedido queda resuelto en el panel.
      if (d.pedida && d.version === o.version) {
        await o.agente.informar({ version: d.version, de: o.version, resultado: "ACTUALIZADO", detalle: "Ya tenía esa versión." });
        return;
      }
      if (!debeCambiar(o.version, d, versionesFallidas(o.a))) return;
      // Sin papel pendiente: lo que haya en la cola sale antes del cambio.
      await o.agente.vaciar();
      o.registro.info(`Hay otra versión del agente: ${d.version}${d.pedida ? " (pedida desde el panel)" : ""}. Se descarga…`);
      const r = await descargarYComprobar({ web: o.web, credencial: o.credencial, d, a: o.a });
      if (!r.ok) {
        o.registro.error(r.detalle);
        anotarFallida(o.a, d.version);
        const n: NotaDeActualizacionDto = { version: d.version, de: o.version, resultado: r.resultado, detalle: r.detalle };
        if (!(await o.agente.informar(n))) anotarResultado(o.a, n);
        return;
      }
      o.registro.info(`La ${d.version} está comprobada (su huella y su arranque). El agente se cambia y vuelve en unos segundos.`);
      lanzarCambio({ a: o.a, tarea: o.tarea, de: o.version, a_: d.version });
      o.salir();
    } catch (e) {
      o.registro.error(`No se pudo revisar la versión: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      ocupado = false;
    }
  }

  o.agente.socket.on("connect", () => void revisar());
  o.agente.socket.on("revisar-version", () => void revisar());
  const reloj = setInterval(() => void revisar(), o.cadaMs ?? 30 * 60_000);
  return () => clearInterval(reloj);
}
