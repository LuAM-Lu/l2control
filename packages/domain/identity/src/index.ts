/**
 * L2 Control — Políticas de acceso
 * Implementa ADR-013 y §7.2 (A07).
 *
 * ⚠️ LO QUE ESTE MÓDULO **NO** HACE, Y ES IMPORTANTE
 * Aquí no se comprueba ningún PIN. No hay hash, no hay comparación, no hay
 * sesión. Eso ocurre **en el servidor**, con Argon2, y este paquete nunca ve
 * un PIN correcto con el que comparar.
 *
 * Lo que sí vive aquí son las REGLAS: cuántos intentos, cuánto bloqueo, qué
 * PIN es inaceptable y qué dispositivo puede autenticar. Son reglas de
 * negocio, se prueban sin infraestructura, y las aplican por igual el cliente
 * (para explicar) y el servidor (para imponer).
 *
 * Y la distinción que hay que tener presente al leer el código de pantalla:
 * el límite de intentos del navegador es **experiencia de usuario, no
 * seguridad**. Quien controla el cliente puede saltárselo. El que cuenta es
 * el del servidor.
 */

/* ----------------------------------------------------------- dispositivo */

/**
 * Estado de un dispositivo registrado.
 *
 * ADR-013: **el dispositivo es el primer factor**. Un PIN nunca es credencial
 * suficiente desde un aparato desconocido, y por eso el estado se comprueba
 * antes de mirar el PIN siquiera.
 */
export type DeviceStatus = "PENDIENTE" | "APROBADO" | "REVOCADO";

export type Device = Readonly<{
  id: string;
  label: string;
  branchId: string;
  status: DeviceStatus;
}>;

export type DeviceCheck =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: DeviceRejection; message: string }>;

export type DeviceRejection = "DESCONOCIDO" | "PENDIENTE" | "REVOCADO";

/**
 * ¿Puede este dispositivo pedir acceso por PIN?
 *
 * Devuelve un motivo tipado en lugar de un booleano: la pantalla necesita
 * decir **qué hacer a continuación**, y «acceso denegado» a secas deja al
 * operador sin salida en mitad de un turno.
 */
export function checkDevice(device: Device | null): DeviceCheck {
  if (!device) {
    return {
      ok: false,
      reason: "DESCONOCIDO",
      message:
        "Este dispositivo no está registrado. Pídele al administrador que lo dé de alta antes de usarlo.",
    };
  }
  if (device.status === "PENDIENTE") {
    return {
      ok: false,
      reason: "PENDIENTE",
      message: `"${device.label}" está registrado pero aún sin aprobar. El administrador debe aprobarlo.`,
    };
  }
  if (device.status === "REVOCADO") {
    return {
      ok: false,
      reason: "REVOCADO",
      message: `"${device.label}" fue revocado y no puede usarse. Habla con el administrador.`,
    };
  }
  return { ok: true };
}

/* ------------------------------------------------------------ política PIN */

export type PinPolicy = Readonly<{
  length: number;
  /** Rechaza secuencias y repeticiones triviales. */
  rejectTrivial: boolean;
}>;

export const DEFAULT_PIN_POLICY: PinPolicy = { length: 4, rejectTrivial: true };

export type PinRejection = "LONGITUD" | "NO_NUMERICO" | "TRIVIAL";

export type PinCheck =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: PinRejection; message: string }>;

/** PINs que aparecen en cualquier lista de los más usados. */
const PINS_COMUNES = new Set([
  "1234", "1111", "0000", "1212", "7777", "1004", "2000", "4444", "2222",
  "6969", "9999", "3333", "5555", "6666", "1122", "1313", "8888", "4321",
  "2001", "1010",
]);

function esSecuencia(pin: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < pin.length; i++) {
    const anterior = pin.charCodeAt(i - 1);
    const actual = pin.charCodeAt(i);
    if (actual !== anterior + 1) asc = false;
    if (actual !== anterior - 1) desc = false;
  }
  return asc || desc;
}

/**
 * ¿Es aceptable este PIN **como nuevo**?
 *
 * Se usa al asignarlo, no al entrar: rechazar un PIN por «trivial» en el
 * momento de iniciar sesión le diría a un atacante que ese PIN existe.
 */
export function checkNewPin(pin: string, policy: PinPolicy = DEFAULT_PIN_POLICY): PinCheck {
  if (pin.length !== policy.length) {
    return {
      ok: false,
      reason: "LONGITUD",
      message: `El PIN debe tener ${policy.length} dígitos.`,
    };
  }
  if (!/^\d+$/.test(pin)) {
    return { ok: false, reason: "NO_NUMERICO", message: "El PIN solo admite dígitos." };
  }
  if (policy.rejectTrivial) {
    const todosIguales = new Set(pin).size === 1;
    if (todosIguales || esSecuencia(pin) || PINS_COMUNES.has(pin)) {
      return {
        ok: false,
        reason: "TRIVIAL",
        message: "Ese PIN es demasiado fácil de adivinar. Elige otro.",
      };
    }
  }
  return { ok: true };
}

/* --------------------------------------------------------- bloqueo */

export type LockoutPolicy = Readonly<{
  /** Intentos fallidos antes de que empiece el bloqueo. */
  freeAttempts: number;
  /** Escalada de bloqueo, en segundos, por cada fallo a partir del umbral. */
  backoffSeconds: readonly number[];
}>;

/**
 * Escalada creciente (§7.2 A07).
 *
 * Crece rápido a propósito: a partir del quinto intento, probar PINs a mano
 * deja de ser viable, y el operador legítimo que se equivocó dos veces apenas
 * lo nota.
 */
export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  freeAttempts: 3,
  backoffSeconds: [30, 60, 300, 900],
};

export type LockoutState = Readonly<{
  locked: boolean;
  /** Instante en que se puede volver a intentar. `null` si no está bloqueado. */
  lockedUntil: number | null;
  /** Intentos que quedan antes del próximo bloqueo. */
  attemptsRemaining: number;
  /** Segundos que faltan. 0 si no está bloqueado. */
  secondsRemaining: number;
}>;

/**
 * Estado de bloqueo tras `failedAttempts` fallos.
 *
 * `now` entra como argumento, igual que en el resto del dominio: así la regla
 * es determinista y se puede probar sin esperar quince minutos.
 */
export function computeLockout(
  failedAttempts: number,
  lastFailureAt: number | null,
  now: number,
  policy: LockoutPolicy = DEFAULT_LOCKOUT_POLICY,
): LockoutState {
  const libre = Math.max(0, policy.freeAttempts - failedAttempts);

  if (failedAttempts < policy.freeAttempts || lastFailureAt === null) {
    return Object.freeze({
      locked: false,
      lockedUntil: null,
      attemptsRemaining: libre,
      secondsRemaining: 0,
    });
  }

  const escalon = failedAttempts - policy.freeAttempts;
  const ultimo = policy.backoffSeconds.at(-1) ?? 0;
  const segundos = policy.backoffSeconds[escalon] ?? ultimo;
  const hasta = lastFailureAt + segundos * 1000;

  if (now >= hasta) {
    // El bloqueo expiró: se concede un intento, no el cupo entero. Regalar
    // tres intentos cada vez que pasa el tiempo anula la escalada.
    return Object.freeze({
      locked: false,
      lockedUntil: null,
      attemptsRemaining: 1,
      secondsRemaining: 0,
    });
  }

  return Object.freeze({
    locked: true,
    lockedUntil: hasta,
    attemptsRemaining: 0,
    secondsRemaining: Math.ceil((hasta - now) / 1000),
  });
}

/** Texto de cuánto falta, para decírselo al operador con palabras. */
export function describeLockout(state: LockoutState): string | null {
  if (!state.locked) return null;
  const s = state.secondsRemaining;
  if (s < 60) return `Espera ${s} segundo${s === 1 ? "" : "s"}.`;
  const m = Math.ceil(s / 60);
  return `Espera ${m} minuto${m === 1 ? "" : "s"}.`;
}

/* ------------------------------------------------------------ permisos */

export {
  MATRIZ,
  SURFACE_ACTION,
  can,
  isAllowedOutright,
  isReachable,
  visibleSurfaces,
  type Action,
  type Actor,
  type Permission,
  type Role,
  type SurfaceId,
} from "./permissions.ts";
