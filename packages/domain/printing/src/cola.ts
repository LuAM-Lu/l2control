/**
 * La cola de impresión — ADR-015, ADR-026.
 *
 * Un trabajo va `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO`. Lo que lo mueve:
 *  · el agente lo **reclama** (pasa a ENVIADO y cuenta un intento) cuando le toca;
 *  · el agente **responde**: bien → CONFIRMADO; mal → vuelve a PENDIENTE con una espera que crece, o
 *    FALLIDO al quinto intento;
 *  · un ENVIADO que no responde en 30 s (el agente se cayó con el papel a medias) se trata como un fallo;
 *  · una persona **reintenta** un FALLIDO: vuelve a PENDIENTE y sus intentos empiezan de cero;
 *  · una persona **descarta** lo que ya no importa (un FALLIDO, o un PENDIENTE que espera): queda
 *    DESCARTADO, no se imprime y deja de avisar. No se borra: sigue en el historial y en la auditoría.
 *
 * Nada más avanza: lo que pidió la impresión (un recibo, un corte, una comanda) no cambia por haberlo
 * intentado (ADR-015). Las horas entran como argumento (ADR-010).
 */

export type EstadoTrabajo = "PENDIENTE" | "ENVIADO" | "CONFIRMADO" | "FALLIDO" | "DESCARTADO";

/** Intentos antes de dejarlo FALLIDO y avisar en pantalla. */
export const MAX_INTENTOS = 5;
/** Lo que espera un trabajo enviado a que el agente diga cómo fue. */
export const ESPERA_RESPUESTA_MS = 30_000;

/** La espera antes del intento siguiente: 5, 10, 20 y 40 s. */
export function esperaTrasFallo(intentos: number): number {
  return 5_000 * 2 ** Math.max(0, Math.min(intentos, MAX_INTENTOS) - 1);
}

export type Trabajo = Readonly<{
  estado: EstadoTrabajo;
  intentos: number;
  /** PENDIENTE: desde cuándo puede reclamarse. */
  proximoIntento: number;
  /** ENVIADO: cuándo se reclamó. */
  enviadoEn: number | null;
}>;

/** ¿Lo puede reclamar el agente ahora? */
export function puedeReclamarse(t: Trabajo, ahora: number): boolean {
  return t.estado === "PENDIENTE" && t.proximoIntento <= ahora;
}

/** El trabajo reclamado por el agente: enviado y con un intento más. */
export function reclamado<T extends Trabajo>(t: T, ahora: number): T {
  return { ...t, estado: "ENVIADO", intentos: t.intentos + 1, enviadoEn: ahora };
}

/** ¿Se quedó sin respuesta? Un ENVIADO de hace más de 30 s. */
export function sinRespuesta(t: Trabajo, ahora: number): boolean {
  return t.estado === "ENVIADO" && t.enviadoEn !== null && ahora - t.enviadoEn >= ESPERA_RESPUESTA_MS;
}

/** Cómo queda tras un intento que salió mal: otra vez en cola con su espera, o FALLIDO. */
export function trasFallo<T extends Trabajo>(t: T, ahora: number): T {
  if (t.intentos >= MAX_INTENTOS) return { ...t, estado: "FALLIDO", enviadoEn: null };
  return { ...t, estado: "PENDIENTE", proximoIntento: ahora + esperaTrasFallo(t.intentos), enviadoEn: null };
}

export type ProblemaDeTrabajo = "NO_ESTA_ENVIADO" | "NO_ESTA_FALLIDO" | "EN_CURSO" | "YA_TERMINADO";

/** ¿Puede el agente responder por este trabajo? Solo por uno que está enviado. */
export function respuestaProblem(t: Pick<Trabajo, "estado">): ProblemaDeTrabajo | null {
  return t.estado === "ENVIADO" ? null : "NO_ESTA_ENVIADO";
}

/** ¿Se puede reintentar a mano? Solo un FALLIDO; uno en curso ya se está intentando. */
export function reintentoProblem(t: Pick<Trabajo, "estado">): ProblemaDeTrabajo | null {
  return t.estado === "FALLIDO" ? null : "NO_ESTA_FALLIDO";
}

/** El trabajo reintentado a mano: en cola ya, con los intentos a cero. */
export function reintentado<T extends Trabajo>(t: T, ahora: number): T {
  return { ...t, estado: "PENDIENTE", intentos: 0, proximoIntento: ahora, enviadoEn: null };
}

/**
 * ¿Se puede descartar? Lo que falló y lo que espera, sí; lo que está en manos del agente ahora mismo
 * (ENVIADO), no: su respuesta llega en segundos. Lo que salió o ya se descartó, tampoco.
 */
export function descarteProblem(t: Pick<Trabajo, "estado">): ProblemaDeTrabajo | null {
  if (t.estado === "FALLIDO" || t.estado === "PENDIENTE") return null;
  return t.estado === "ENVIADO" ? "EN_CURSO" : "YA_TERMINADO";
}
