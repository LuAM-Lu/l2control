/**
 * La instalación en la laptop de caja (Windows) — ADR-026.
 *
 * El agente se instala en `C:\ProgramData\L2 Control\Impresion\` y corre como una **tarea programada de
 * Windows**, con la cuenta del sistema:
 *  · arranca sola al encender la laptop, antes de que nadie entre en su sesión;
 *  · no abre ninguna ventana (no hay nada que cerrar por error);
 *  · si el agente se cae, Windows lo vuelve a levantar al minuto, sin fin.
 *
 * La credencial (`agente.json`) solo la leen el sistema y la administración del equipo. Instalar pide
 * permisos de administrador una vez; el asistente los pide solo si no los tiene.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { isSea } from "node:sea";

export const TAREA = "L2 Control - Impresion";
export const CARPETA = join(process.env.ProgramData ?? "C:\\ProgramData", "L2 Control", "Impresion");
export const CONFIG_INSTALADA = join(CARPETA, "agente.json");
export const EJECUTABLE_INSTALADO = join(CARPETA, "l2-impresion.exe");
/** Los SID del sistema y del grupo de administradores: valen en Windows en cualquier idioma. */
const SID_SISTEMA = "*S-1-5-18";
const SID_ADMINISTRADORES = "*S-1-5-32-544";

export const esWindows = process.platform === "win32";

/** ¿Corre con permisos de administrador? `net session` solo responde bien con ellos. */
export function esAdministrador(): boolean {
  if (!esWindows) return false;
  return spawnSync("net", ["session"], { stdio: "ignore", windowsHide: true }).status === 0;
}

/** Un texto entre comillas simples para PowerShell (las simples se doblan). */
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

function powershell(script: string): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

/** Cómo se lanza este mismo programa: el `.exe` empaquetado, o Node con el código en desarrollo. */
export function esteAgente(): { exe: string; args: string[] } {
  if (isSea()) return { exe: process.execPath, args: [] };
  return { exe: process.execPath, args: ["--experimental-strip-types", resolve(process.argv[1] ?? "")] };
}

/**
 * Vuelve a abrir este programa con permisos de administrador (Windows pregunta) y con estos argumentos.
 * Devuelve `false` si no se pudo pedir (por ejemplo, alguien dijo que no).
 */
export function pedirAdministrador(args: readonly string[]): boolean {
  const { exe, args: base } = esteAgente();
  const todos = [...base, ...args].map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
  try {
    powershell(`Start-Process -FilePath ${ps(exe)} -ArgumentList ${ps(todos)} -Verb RunAs`);
    return true;
  } catch {
    return false;
  }
}

/** Copia el ejecutable a su carpeta (si no corre ya desde ahí) y protege la carpeta. */
export function prepararCarpeta(): string {
  mkdirSync(CARPETA, { recursive: true });
  if (isSea() && resolve(process.execPath).toLowerCase() !== resolve(EJECUTABLE_INSTALADO).toLowerCase()) {
    // Si la tarea estaba corriendo, el .exe está en uso: se para antes de copiar.
    pararTarea();
    copyFileSync(process.execPath, EJECUTABLE_INSTALADO);
  }
  return isSea() ? EJECUTABLE_INSTALADO : process.execPath;
}

/** Solo el sistema y la administración pueden leer la credencial. */
export function protegerConfig(archivo: string): void {
  if (!esWindows) return;
  spawnSync("icacls", [archivo, "/inheritance:r", "/grant:r", `${SID_SISTEMA}:F`, `${SID_ADMINISTRADORES}:F`], { stdio: "ignore", windowsHide: true });
}

/**
 * Registra (o reemplaza) la tarea: al arrancar Windows, con la cuenta del sistema, sin ventana,
 * reiniciándose cada minuto si se cae y sin límite de tiempo. La deja corriendo ya.
 */
export function registrarTarea(config: string): void {
  const { exe, args } = isSea() ? { exe: EJECUTABLE_INSTALADO, args: [] as string[] } : esteAgente();
  const argumentos = [...args.map((a) => `"${a}"`), "iniciar", "--config", `"${config}"`].join(" ");
  powershell(
    [
      `$a = New-ScheduledTaskAction -Execute ${ps(exe)} -Argument ${ps(argumentos)} -WorkingDirectory ${ps(CARPETA)}`,
      `$t = New-ScheduledTaskTrigger -AtStartup`,
      `$s = New-ScheduledTaskSettingsSet -RestartCount 9999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew`,
      `$p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest`,
      `Register-ScheduledTask -TaskName ${ps(TAREA)} -Action $a -Trigger $t -Settings $s -Principal $p -Description 'Imprime los recibos, cortes y comandas de L2 Control en la impresora del local (ADR-026).' -Force | Out-Null`,
      `Start-ScheduledTask -TaskName ${ps(TAREA)}`,
    ].join("; "),
  );
}

/** Para la tarea si existe y está corriendo (no falla si no existe). */
export function pararTarea(): void {
  if (!esWindows) return;
  try {
    powershell(`$x = Get-ScheduledTask -TaskName ${ps(TAREA)} -ErrorAction SilentlyContinue; if ($x) { Stop-ScheduledTask -TaskName ${ps(TAREA)} }`);
  } catch {
    // Sin permisos para pararla: lo dirá quien llama al copiar.
  }
}

/** El estado de la tarea: «Running», «Ready», «Disabled»… o `null` si no está instalada. */
export function estadoDeTarea(): string | null {
  if (!esWindows) return null;
  try {
    const r = powershell(`$x = Get-ScheduledTask -TaskName ${ps(TAREA)} -ErrorAction SilentlyContinue; if ($x) { $x.State.ToString() } else { '' }`);
    return r === "" ? null : r;
  } catch {
    return null;
  }
}

/** Quita la tarea (y la de sus cambios de versión, T-8c) y la credencial. El agente debe retirarse además desde el panel. */
export function desinstalar(): void {
  for (const t of [TAREA, `${TAREA} (cambio)`]) {
    powershell(`$x = Get-ScheduledTask -TaskName ${ps(t)} -ErrorAction SilentlyContinue; if ($x) { Stop-ScheduledTask -TaskName ${ps(t)}; Unregister-ScheduledTask -TaskName ${ps(t)} -Confirm:$false }`);
  }
  if (existsSync(CONFIG_INSTALADA)) rmSync(CONFIG_INSTALADA, { force: true });
}

/** Las últimas líneas del registro de la tarea. */
export function ultimasLineas(archivo: string, n = 12): string[] {
  if (!existsSync(archivo)) return [];
  return readFileSync(archivo, "utf8").trimEnd().split(/\r?\n/).slice(-n);
}
