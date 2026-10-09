/**
 * La impresora por USB en la laptop de caja (B5-4, M-34): la impresora de Windows, por su nombre, en modo directo
 * (RAW). Windows no traduce nada: le llegan los mismos bytes ESC/POS que por la red.
 *
 * Sin módulos nativos (el agente es un solo ejecutable, T-8c): PowerShell llama a la API de impresión de Windows
 * (`winspool.drv`). El nombre de la impresora y los bytes (en base64) van en variables de entorno: así no hay
 * comillas que escapar. Por USB no se puede preguntar por el papel (Windows no lo deja): el
 * trabajo se confirma cuando Windows lo recibe entero.
 *
 * El agente corre como tarea de Windows con la cuenta del sistema: ve las impresoras instaladas para todo el equipo
 * (lo normal al instalar el controlador), no las que alguien añadió solo para su usuario.
 */
import { spawn } from "node:child_process";
import type { ResultadoDeImpresion } from "./imprimir.ts";

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

/** Imprime en modo directo lo que llega en L2_DATOS (base64) en la impresora L2_IMPRESORA. */
const GUION_IMPRIMIR = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'
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
      if (StartDocPrinter(h, 1, di) == 0) return "NO_ACEPTA " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "NO_ACEPTA " + Marshal.GetLastWin32Error();
        int escritos;
        bool bien = WritePrinter(h, datos, datos.Length, out escritos);
        EndPagePrinter(h);
        if (!bien || escritos != datos.Length) return "INCOMPLETO " + escritos + " " + datos.Length;
        return "";
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
}
$r = [L2Directo]::Imprimir($env:L2_IMPRESORA, [Convert]::FromBase64String($env:L2_DATOS))
if ($r) { [Console]::Out.Write($r); exit 2 }
exit 0`;

/** Lo que dice el guion, en palabras para el panel. */
export function errorDeWindows(nombre: string, salida: string): string {
  if (salida === "NO_ESTA") return `Windows no tiene una impresora «${nombre}»: revisa su nombre en Ajustes → Impresoras`;
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
  const r = await correr(GUION_IMPRIMIR, { L2_IMPRESORA: nombre, L2_DATOS: Buffer.from(bytes).toString("base64") }, 30_000);
  if (r.codigo === 0) return { ok: true, aviso: "por USB, sin preguntar por el papel" };
  if (r.codigo === null && r.salida === "") return { ok: false, error: `«${nombre}» no respondió a tiempo` };
  return { ok: false, error: errorDeWindows(nombre, r.salida) };
}
