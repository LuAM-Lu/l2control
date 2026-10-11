/**
 * La impresora por USB en la laptop de caja (B5-4, M-34): la impresora de Windows, por su nombre, en modo directo
 * (RAW). Windows no traduce nada: le llegan los mismos bytes ESC/POS que por la red.
 *
 * Sin módulos nativos (el agente es un solo ejecutable, T-8c): PowerShell llama a la API de impresión de Windows
 * (`winspool.drv`). El nombre de la impresora y los bytes (en base64) van en variables de entorno: así no hay
 * comillas que escapar.
 *
 * Por USB no se le puede preguntar a la impresora por el papel (B5-6, el 9 de octubre salieron 58 trabajos «impresos»
 * sin rollo): antes de mandar se mira lo que Windows sabe de ella (sin conexión, sin papel, atascada) y, después, su cola:
 * el trabajo tiene que salir de ella en 15 s. Si no, se saca de la cola de Windows (que no salga dos veces cuando vuelva
 * el papel) y el trabajo falla con «sin papel o no responde». Confirmado es que Windows lo imprimió.
 *
 * El agente corre como tarea de Windows con la cuenta del sistema: ve las impresoras instaladas para todo el equipo
 * (lo normal al instalar el controlador), no las que alguien añadió solo para su usuario.
 */
import { spawn } from "node:child_process";
import { ATASCADA_MS, atascadaEnWindows, noRespondeEnWindows, sinPapelEnWindows } from "@l2/domain-printing";
import type { EstadoVisto, ResultadoDeImpresion } from "./imprimir.ts";

/** Corre un guion de PowerShell con ese entorno; devuelve su salida y su código (`null` si no terminó a tiempo). */
export type CorrerPowerShell = (guion: string, entorno: Record<string, string>, ms: number) => Promise<{ codigo: number | null; salida: string }>;

export const correrPowerShell: CorrerPowerShell = (guion, entorno, ms) =>
  new Promise((resolver) => {
    // Codificado (UTF-16LE en base64): un guion de varios renglones por la entrada estándar se lee renglón a renglón.
    const codificado = Buffer.from(guion, "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", codificado], {
      env: { ...process.env, ...entorno },
      windowsHide: true,
    });
    let salida = "";
    const reloj = setTimeout(() => p.kill(), ms);
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (d: string) => (salida += d));
    p.on("error", () => resolver({ codigo: null, salida: "No se pudo abrir PowerShell" }));
    p.on("close", (codigo) => {
      clearTimeout(reloj);
      resolver({ codigo, salida: salida.trim() });
    });
    p.stdin.end();
  });

/** Las impresoras de Windows de este equipo, por su nombre. */
const GUION_LISTAR = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$n = @(Get-CimInstance Win32_Printer | ForEach-Object { $_.Name })
ConvertTo-Json -Compress -InputObject $n
exit 0`;

/**
 * Lo que Windows sabe de una impresora (B5-6): «» si nada la frena; SIN_PAPEL; o SIN_CONEXION con el porqué. Lo dicen
 * WorkOffline («Usar impresora sin conexión»), DetectedErrorState (4 sin papel, 7 tapa abierta, 8 atascada,
 * 9 desconectada) y PrinterStatus (7 desconectada). Muchos controladores de térmicas no dicen nada del papel: por eso,
 * además, se mira la cola.
 */
const FUNCION_ESTADO = `function L2Estado($p) {
  if (-not $p) { return 'NO_ESTA' }
  if ($p.WorkOffline) { return 'SIN_CONEXION sin conexión (Usar impresora sin conexión)' }
  switch ([int]$p.DetectedErrorState) {
    4 { return 'SIN_PAPEL' }
    7 { return 'SIN_CONEXION tapa abierta' }
    8 { return 'SIN_CONEXION papel atascado' }
    9 { return 'SIN_CONEXION desconectada' }
  }
  if ([int]$p.PrinterStatus -eq 7) { return 'SIN_CONEXION desconectada' }
  return ''
}`;

/**
 * Imprime en modo directo lo que llega en L2_DATOS (base64) en la impresora L2_IMPRESORA (B5-4) y espera a que salga de
 * la cola de Windows (B5-6): si en L2_ATASCADA_MS sigue ahí, lo saca y dice ATASCADA.
 */
const GUION_IMPRIMIR = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
${FUNCION_ESTADO}
$antes = L2Estado (Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $env:L2_IMPRESORA } | Select-Object -First 1)
if ($antes -and $antes -ne 'NO_ESTA') { [Console]::Out.Write($antes); exit 2 }
if (-not ('L2Directo' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class L2Directo {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DocInfo { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool OpenPrinter(string nombre, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] static extern int StartDocPrinter(IntPtr h, int nivel, [In] DocInfo di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int escritos);
  public static string Imprimir(string nombre, byte[] datos) {
    IntPtr h;
    if (!OpenPrinter(nombre, out h, IntPtr.Zero)) return "NO_ESTA";
    try {
      DocInfo di = new DocInfo();
      di.pDocName = "L2 Control";
      di.pDataType = "RAW";
      int trabajo = StartDocPrinter(h, 1, di);
      if (trabajo == 0) return "NO_ACEPTA " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "NO_ACEPTA " + Marshal.GetLastWin32Error();
        int escritos;
        bool bien = WritePrinter(h, datos, datos.Length, out escritos);
        EndPagePrinter(h);
        if (!bien || escritos != datos.Length) return "INCOMPLETO " + escritos + " " + datos.Length;
        return "OK " + trabajo;
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
}
$r = [L2Directo]::Imprimir($env:L2_IMPRESORA, [Convert]::FromBase64String($env:L2_DATOS))
if (-not $r.StartsWith('OK ')) { [Console]::Out.Write($r); exit 2 }
$id = [int]$r.Substring(3)
$prefijo = $env:L2_IMPRESORA + ','
$limite = (Get-Date).AddMilliseconds([int]$env:L2_ATASCADA_MS)
while ((Get-Date) -lt $limite) {
  Start-Sleep -Milliseconds 500
  $j = Get-CimInstance Win32_PrintJob | Where-Object { $_.JobId -eq $id -and $_.Name.StartsWith($prefijo) } | Select-Object -First 1
  if (-not $j -or "$($j.JobStatus)" -match 'Printed|Deleted') { exit 0 }
}
Get-CimInstance Win32_PrintJob | Where-Object { $_.JobId -eq $id -and $_.Name.StartsWith($prefijo) } | Remove-CimInstance -ErrorAction SilentlyContinue
[Console]::Out.Write('ATASCADA')
exit 2`;

/** Cómo están las impresoras de L2_IMPRESORAS (JSON) según Windows, y cuántos trabajos tienen atascados en su cola (B5-6). */
const GUION_ESTADO = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
${FUNCION_ESTADO}
$nombres = @(ConvertFrom-Json $env:L2_IMPRESORAS)
$todas = @(Get-CimInstance Win32_Printer)
$cola = @(Get-CimInstance Win32_PrintJob)
$ahora = Get-Date
$r = @(foreach ($n in $nombres) {
  $p = $todas | Where-Object { $_.Name -eq $n } | Select-Object -First 1
  $viejos = @($cola | Where-Object { $_.Name.StartsWith($n + ',') -and $_.TimeSubmitted -and ($ahora - $_.TimeSubmitted).TotalMilliseconds -gt [int]$env:L2_ATASCADA_MS }).Count
  [pscustomobject]@{ nombre = $n; estado = (L2Estado $p); atascados = $viejos }
})
ConvertTo-Json -Compress -InputObject $r
exit 0`;

/** Lo que dice el guion, en palabras para el panel. */
export function errorDeWindows(nombre: string, salida: string): string {
  if (salida === "NO_ESTA") return `Windows no tiene una impresora «${nombre}»: revisa su nombre en Ajustes → Impresoras`;
  if (salida === "SIN_PAPEL") return sinPapelEnWindows(nombre);
  if (salida.startsWith("SIN_CONEXION")) return noRespondeEnWindows(nombre, salida.slice("SIN_CONEXION".length).trim() || "sin conexión");
  if (salida === "ATASCADA") return atascadaEnWindows(nombre);
  if (salida.startsWith("NO_ACEPTA")) return `«${nombre}» no aceptó el trabajo en modo directo (error ${salida.split(" ")[1] ?? "?"})`;
  if (salida.startsWith("INCOMPLETO")) {
    const [, escritos, total] = salida.split(" ");
    return `Windows recibió ${escritos ?? "?"} de ${total ?? "?"} bytes en «${nombre}»`;
  }
  return salida ? `No se imprimió en «${nombre}»: ${salida.slice(0, 120)}` : `No se imprimió en «${nombre}»`;
}

export async function listarImpresorasDeWindows(correr: CorrerPowerShell = correrPowerShell): Promise<string[]> {
  const r = await correr(GUION_LISTAR, {}, 20_000);
  if (r.codigo !== 0) return [];
  try {
    const lista: unknown = JSON.parse(r.salida || "[]");
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 50) : [];
  } catch {
    return [];
  }
}

export async function imprimirEnWindows(nombre: string, bytes: Uint8Array, correr: CorrerPowerShell = correrPowerShell): Promise<ResultadoDeImpresion> {
  // Lo que tarda en salir de la cola (15 s), más lo que tarda PowerShell en arrancar y en mandarlo.
  const r = await correr(GUION_IMPRIMIR, { L2_IMPRESORA: nombre, L2_DATOS: Buffer.from(bytes).toString("base64"), L2_ATASCADA_MS: String(ATASCADA_MS) }, ATASCADA_MS + 30_000);
  if (r.codigo === 0) return { ok: true };
  if (r.codigo === null && r.salida === "") return { ok: false, error: `«${nombre}» no respondió a tiempo` };
  return { ok: false, error: errorDeWindows(nombre, r.salida) };
}

/** Cómo están estas impresoras de Windows (B5-6), por su nombre. Si Windows no contesta, no se sabe: no se dice nada. */
export async function estadoEnWindows(nombres: readonly string[], correr: CorrerPowerShell = correrPowerShell): Promise<Map<string, EstadoVisto>> {
  const vistos = new Map<string, EstadoVisto>();
  if (nombres.length === 0) return vistos;
  const r = await correr(GUION_ESTADO, { L2_IMPRESORAS: JSON.stringify(nombres), L2_ATASCADA_MS: String(ATASCADA_MS) }, 20_000);
  if (r.codigo !== 0) return vistos;
  let filas: unknown;
  try {
    filas = JSON.parse(r.salida || "[]");
  } catch {
    return vistos;
  }
  for (const f of Array.isArray(filas) ? filas : [filas]) {
    const { nombre, estado, atascados } = (f ?? {}) as { nombre?: unknown; estado?: unknown; atascados?: unknown };
    if (typeof nombre !== "string" || !nombres.includes(nombre)) continue;
    const e = typeof estado === "string" ? estado : "";
    if (e === "SIN_PAPEL") vistos.set(nombre, { estado: "SIN_PAPEL", detalle: sinPapelEnWindows(nombre) });
    else if (e === "NO_ESTA") vistos.set(nombre, { estado: "NO_RESPONDE", detalle: `Windows no tiene una impresora «${nombre}»` });
    else if (e.startsWith("SIN_CONEXION")) vistos.set(nombre, { estado: "NO_RESPONDE", detalle: noRespondeEnWindows(nombre, e.slice("SIN_CONEXION".length).trim() || "sin conexión") });
    else if (typeof atascados === "number" && atascados > 0) vistos.set(nombre, { estado: "NO_RESPONDE", detalle: `«${nombre}» tiene ${atascados === 1 ? "un trabajo atascado" : `${atascados} trabajos atascados`} en la cola de Windows (sin papel o no responde)` });
    else vistos.set(nombre, { estado: "LISTA" });
  }
  return vistos;
}
