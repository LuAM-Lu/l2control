/**
 * La impresora, su estado y su respaldo — B5-6 (M-38, W-1).
 *
 * El 9 de octubre, sin papel y por USB, L2 dio por impresas 58 comandas y recibos sin avisar: Windows recibía el trabajo y
 * nadie preguntaba si salía. Ahora:
 *  · cada fallo dice de qué fue (`causaDeFallo`, con las frases del agente, que viven aquí para que el agente y el servidor
 *    digan lo mismo: así un agente nuevo no manda nada que un servidor de antes rechace);
 *  · **sin papel** el trabajo queda «no salió» en el acto (el papel no vuelve solo) y «Reintentar» lo saca una vez;
 *  · **no responde** y la impresora tiene respaldo: sale por el respaldo, una vez, y se avisa. Sin papel no se cambia de
 *    camino: principal y respaldo suelen ser la misma impresora (por red y por USB) y el rollo es el mismo;
 *  · lo demás, como siempre: reintenta con una espera que crece (`trasFallo`).
 *
 * Las horas entran como argumento (ADR-010).
 */
import { trasFallo, type EstadoTrabajo, type Trabajo } from "./cola.ts";

/** Cómo está una impresora, según lo último que dijo su agente. */
export type EstadoDeImpresora = "LISTA" | "POCO_PAPEL" | "SIN_PAPEL" | "NO_RESPONDE";

/** De qué fue un fallo: el papel, que la impresora no contesta, u otra cosa (un nombre mal escrito, un agente caído). */
export type CausaDeFallo = "SIN_PAPEL" | "NO_RESPONDE" | "OTRO";

/** Por red, la impresora dijo que no tiene papel al preguntarle (DLE EOT 4). */
export const ERROR_SIN_PAPEL = "Sin papel";
/** Por USB, lo que Windows tarda como mucho en sacar un trabajo de su cola antes de darlo por atascado. */
export const ATASCADA_MS = 15_000;
/** Por USB: Windows dice que no tiene papel. */
export const sinPapelEnWindows = (nombre: string) => `«${nombre}» está sin papel (lo dice Windows)`;
/** Por USB: Windows la tiene sin conexión o con un error. */
export const noRespondeEnWindows = (nombre: string, detalle: string) => `«${nombre}» no responde en Windows: ${detalle}`;
/** Por USB: el trabajo se quedó en la cola de Windows más de 15 s; se sacó de ahí para que no salga dos veces. */
export const atascadaEnWindows = (nombre: string) => `«${nombre}» no imprimió en 15 s (sin papel o no responde): se sacó de la cola de Windows`;

/**
 * De qué fue un fallo, por lo que dijo el agente. Lo atascado en Windows cuenta como «no responde»: puede ser el papel,
 * pero si tiene respaldo por red, este pregunta por el papel antes de mandar y lo dirá.
 */
export function causaDeFallo(error: string): CausaDeFallo {
  const e = error.trim();
  if (/no imprimió en 15 s/.test(e)) return "NO_RESPONDE";
  if (e === ERROR_SIN_PAPEL || /está sin papel/.test(e)) return "SIN_PAPEL";
  if (/no responde|no está en la red|rechaza la conexión|no terminó a tiempo|se cortó|no respondió a tiempo/i.test(e)) return "NO_RESPONDE";
  return "OTRO";
}

/** El estado que deja un fallo en su impresora: el papel o que no contesta. Otro motivo no dice nada de ella. */
export function estadoTrasFallo(causa: CausaDeFallo): EstadoDeImpresora | null {
  return causa === "SIN_PAPEL" ? "SIN_PAPEL" : causa === "NO_RESPONDE" ? "NO_RESPONDE" : null;
}

/** ¿Hay que avisarlo en la barra? Sin papel o sin responder; poco papel es un aviso suave. */
export function estadoQueAvisa(e: EstadoDeImpresora | null): boolean {
  return e === "SIN_PAPEL" || e === "NO_RESPONDE";
}

export type TrabajoConCamino = Trabajo & Readonly<{ porRespaldo: boolean }>;

/** Cómo queda un trabajo tras un fallo con su causa, y si hay que avisar que salió por el respaldo. */
export function trasFalloConCausa<T extends TrabajoConCamino>(
  t: T,
  causa: CausaDeFallo,
  hayRespaldo: boolean,
  ahora: number,
): T & { desviado: boolean } {
  // Sin papel: «no salió» ya. Reintentar lo saca una vez cuando vuelva el rollo.
  if (causa === "SIN_PAPEL") return { ...t, estado: "FALLIDO" as EstadoTrabajo, enviadoEn: null, desviado: false };
  // No responde: por su respaldo, una vez y en el acto.
  if (causa === "NO_RESPONDE" && hayRespaldo && !t.porRespaldo) {
    return { ...t, estado: "PENDIENTE" as EstadoTrabajo, proximoIntento: ahora, enviadoEn: null, porRespaldo: true, desviado: true };
  }
  return { ...trasFallo(t, ahora), desviado: false };
}
