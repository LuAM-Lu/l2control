/**
 * L2 Control — Reglas de estancia del parque
 * Implementa §6.5 del plan, ADR-010 y ADR-011 (docs/adr/).
 *
 * Dos decisiones del plan gobiernan todo este módulo:
 *
 *  ADR-010 — EL CRONÓMETRO ES DEL SERVIDOR. Ninguna función de aquí llama a
 *  `Date.now()`. El instante entra siempre como argumento `now`. Así el
 *  reloj mal configurado de una tablet no puede regalar ni cobrar tiempo,
 *  y todo el módulo es determinista y trivial de probar.
 *
 *  ADR-011 — NADA DE NÚMEROS DESNUDOS DONDE EL CERO ES AMBIGUO. "Pase
 *  libre" no es duración cero: es otra variante del tipo. La gracia es un
 *  entero no negativo donde 0 significa explícitamente "sin gracia". El
 *  bloque de penalización debe ser positivo.
 */

import { type Money, money, multiply, add, zero } from "@l2/domain-money";

/* ------------------------------------------------------------------ tiempo */

export type Minutes = number & { readonly __brand: "Minutes" };
export type EpochMs = number & { readonly __brand: "EpochMs" };

export function minutes(value: number): Minutes {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Los minutos deben ser un entero ≥ 0, recibido: ${value}`);
  }
  return value as Minutes;
}

export function epochMs(value: number): EpochMs {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Instante no válido: ${value}`);
  }
  return value as EpochMs;
}

const MS_PER_MINUTE = 60_000;

/**
 * Duración de un paquete de tiempo.
 *
 * `openEnded` es el "pase libre" o el postpago: NO tiene minutos, y por eso
 * no se puede confundir con `{ kind: "fixed", minutes: 0 }`. El tipo hace
 * imposible expresar la ambigüedad que ADR-011 quiere eliminar.
 */
export type Duration =
  | { readonly kind: "fixed"; readonly minutes: Minutes }
  | { readonly kind: "openEnded" };

export function fixed(m: number): Duration {
  const value = minutes(m);
  if (value === 0) {
    throw new RangeError(
      'Una duración fija de 0 minutos no significa nada. Usa `openEnded` para tiempo abierto.',
    );
  }
  return { kind: "fixed", minutes: value };
}

export const openEnded: Duration = { kind: "openEnded" };

/* ------------------------------------------------------------- configuración */

/**
 * Política de cobro del parque. Todo esto es CONFIGURABLE por el
 * administrador (§9.9): son datos, no constantes del código.
 */
export type ParkPolicy = Readonly<{
  /** Minutos vencidos que NO se cobran. 0 = sin gracia, explícitamente. */
  graceMinutes: Minutes;
  /** Unidad mínima de cobro del excedente. Debe ser positiva. */
  penaltyBlockMinutes: Minutes;
  /** Precio de cada bloque de penalización iniciado. */
  penaltyPricePerBlock: Money;
  /** Antelación con la que la tarjeta pasa a ámbar. */
  warnBeforeMinutes: Minutes;
}>;

export function parkPolicy(input: {
  graceMinutes: number;
  penaltyBlockMinutes: number;
  penaltyPricePerBlock: Money;
  warnBeforeMinutes: number;
}): ParkPolicy {
  const block = minutes(input.penaltyBlockMinutes);
  if (block === 0) {
    throw new RangeError(
      "El bloque de penalización debe ser positivo: un bloque de 0 minutos es una división por cero.",
    );
  }
  return Object.freeze({
    graceMinutes: minutes(input.graceMinutes),
    penaltyBlockMinutes: block,
    penaltyPricePerBlock: input.penaltyPricePerBlock,
    warnBeforeMinutes: minutes(input.warnBeforeMinutes),
  });
}

/* ------------------------------------------------------------------ estancia */

export type SessionMode = "PREPAGO" | "POSTPAGO";

/**
 * Estados visibles de una estancia (§6.5). El color de la tarjeta se
 * deriva de aquí, pero NUNCA es la única señal: la interfaz muestra
 * color + icono + texto (§8.2).
 */
export type SessionStatus = "ACTIVA" | "POR_VENCER" | "EN_GRACIA" | "VENCIDA";

export type ParkSession = Readonly<{
  id: string;
  /**
   * Cómo se llama el niño, si alguien lo escribió. **Puede faltar** (DEC-28):
   * lo que identifica la estancia es `wristbandCode`, que el niño lleva
   * puesto. Ninguna regla de tiempo ni de dinero depende del nombre.
   */
  childName?: string;
  childNickname?: string;
  wristbandCode: string;
  mode: SessionMode;
  duration: Duration;
  startedAt: EpochMs;
  /** La pausa por comida (B4-7, M-27), si la tuvo: una por visita. Mientras dura, el reloj no corre. */
  pause?: Pause;
}>;

/**
 * La pausa de una estancia (B4-7, M-27, P-14): el niño sale a comer y su tiempo se detiene. Dura hasta
 * `maxMinutes` (un ajuste de la sucursal, 10 de fábrica) y entonces vuelve a correr sola; o antes, si la
 * monitora la termina (`endedAt`). Una sola por visita: la segunda la niega quien la registra.
 */
export type Pause = Readonly<{
  startedAt: EpochMs;
  /** Cuándo la terminó la monitora; `null` si no la terminó (sigue, o se acabó sola al cumplirse). */
  endedAt: EpochMs | null;
  maxMinutes: number;
}>;

/** Cuándo termina la pausa: al terminarla la monitora o al cumplirse su máximo, lo que llegue antes. */
export function pauseEndsAt(p: Pause): EpochMs {
  const tope = p.startedAt + p.maxMinutes * MS_PER_MINUTE;
  return epochMs(p.endedAt === null ? tope : Math.min(p.endedAt, tope));
}

/** Cuánto lleva o llevó en pausa en `now`: lo que no se cuenta como tiempo en sala. */
export function pausedMs(p: Pause | undefined, now: EpochMs): number {
  if (!p || now <= p.startedAt) return 0;
  return Math.min(now, pauseEndsAt(p)) - p.startedAt;
}

export type SessionView = Readonly<{
  status: SessionStatus;
  /** Tiempo transcurrido desde el check-in. */
  elapsedMs: number;
  /** Tiempo que falta. `null` cuando la duración es abierta. */
  remainingMs: number | null;
  /** Tiempo excedido más allá de la duración contratada. 0 si aún no vence. */
  overdueMs: number;
  /** Excedente que ya superó la gracia y por tanto se cobra. */
  billableOverdueMs: number;
  /** Si está en su pausa por comida ahora mismo (B4-7): el reloj está quieto. */
  paused: boolean;
  /** Lo que le queda a la pausa; `null` si no está en pausa. */
  pauseRemainingMs: number | null;
}>;

/**
 * Calcula el estado de una estancia en un instante dado.
 *
 * `now` es un parámetro a propósito (ADR-010): el servidor manda, el
 * cliente solo interpola visualmente entre latidos.
 */
export function computeSessionView(
  session: ParkSession,
  policy: ParkPolicy,
  now: EpochMs,
): SessionView {
  // La pausa por comida (B4-7) no cuenta como tiempo en sala: ni lo consume ni se cobra.
  const elapsedMs = Math.max(0, now - session.startedAt - pausedMs(session.pause, now));
  const enPausa = session.pause !== undefined && now >= session.pause.startedAt && now < pauseEndsAt(session.pause);
  const pausa = { paused: enPausa, pauseRemainingMs: enPausa ? pauseEndsAt(session.pause!) - now : null };

  if (session.duration.kind === "openEnded") {
    // Postpago o pase libre: cuenta hacia adelante y nunca vence solo.
    return Object.freeze({
      status: "ACTIVA" as const,
      elapsedMs,
      remainingMs: null,
      overdueMs: 0,
      billableOverdueMs: 0,
      ...pausa,
    });
  }

  const totalMs = session.duration.minutes * MS_PER_MINUTE;
  const graceMs = policy.graceMinutes * MS_PER_MINUTE;
  const warnMs = policy.warnBeforeMinutes * MS_PER_MINUTE;
  const remainingMs = totalMs - elapsedMs;
  const overdueMs = Math.max(0, -remainingMs);
  const billableOverdueMs = Math.max(0, overdueMs - graceMs);

  const status: SessionStatus =
    billableOverdueMs > 0
      ? "VENCIDA"
      : overdueMs > 0
        ? "EN_GRACIA"
        : remainingMs <= warnMs
          ? "POR_VENCER"
          : "ACTIVA";

  return Object.freeze({ status, elapsedMs, remainingMs, overdueMs, billableOverdueMs, ...pausa });
}

/**
 * Los dos avisos de una estancia de tiempo fijo (B4-15): cuándo entra en «por vencer» (con el aviso de sus condiciones)
 * y cuándo se cumple su tiempo. La pausa por comida los corre lo que dura, si empieza antes. Sin tiempo fijo, `null`:
 * no vence.
 */
export type InstantesDeAviso = Readonly<{ porVencer: EpochMs; vence: EpochMs }>;

export function instantesDeAviso(session: ParkSession, policy: Pick<ParkPolicy, "warnBeforeMinutes">): InstantesDeAviso | null {
  if (session.duration.kind !== "fixed") return null;
  const totalMs = session.duration.minutes * MS_PER_MINUTE;
  return {
    porVencer: alTranscurrir(session, Math.max(0, totalMs - policy.warnBeforeMinutes * MS_PER_MINUTE)),
    vence: alTranscurrir(session, totalMs),
  };
}

/** El instante en que una estancia lleva `ms` en sala: su pausa no cuenta, si empieza antes. */
function alTranscurrir(session: ParkSession, ms: number): EpochMs {
  const sinPausa = session.startedAt + ms;
  const p = session.pause;
  if (!p || sinPausa <= p.startedAt) return epochMs(sinPausa);
  return epochMs(sinPausa + (pauseEndsAt(p) - p.startedAt));
}

/** Por qué no se puede pausar una estancia (B4-7): ya usó su pausa. */
export type PauseProblem = "YA_PAUSO";

/** ¿Puede pausarse? Una sola pausa por visita (P-14): la pulsera es de un solo uso (V-1) y la pausa también. */
export function pauseProblem(session: Pick<ParkSession, "pause">): PauseProblem | null {
  return session.pause ? "YA_PAUSO" : null;
}

/** Por qué no se puede terminar una pausa antes de tiempo: no la hay, o ya terminó (sola o a mano). */
export type ResumeProblem = "SIN_PAUSA" | "YA_TERMINO";

export function resumeProblem(session: Pick<ParkSession, "pause">, now: EpochMs): ResumeProblem | null {
  if (!session.pause) return "SIN_PAUSA";
  return now >= pauseEndsAt(session.pause) ? "YA_TERMINO" : null;
}

/**
 * Cargo por tiempo excedido.
 *
 * Se cobra por BLOQUES INICIADOS: con bloques de 15 minutos, un minuto de
 * exceso cobra un bloque completo. Es la regla que el negocio ya usa en
 * papel, y hacerla explícita evita discusiones en taquilla.
 */
export function computeOverdueCharge(view: SessionView, policy: ParkPolicy): Money {
  return computeOverdueBreakdown(view, policy).charge;
}

export type OverdueBreakdown = Readonly<{
  /** Minutos cobrables, ya descontada la gracia. */
  billableMinutes: number;
  /** Bloques INICIADOS que se cobran. */
  blocks: number;
  charge: Money;
}>;

/**
 * El cargo por excedente, desglosado.
 *
 * Existe porque la pantalla de salida tiene que poder decir «1,50 por 7
 * minutos de más, un bloque de 15 iniciado» con el representante delante. Ese
 * desglose es una regla de negocio y vive aquí; recalcularlo en la interfaz
 * sería la duplicación que §9.7 prohíbe, y el día que cambie la política las
 * dos cuentas dejarían de coincidir.
 */
export function computeOverdueBreakdown(
  view: SessionView,
  policy: ParkPolicy,
): OverdueBreakdown {
  const currency = policy.penaltyPricePerBlock.currency;
  if (view.billableOverdueMs <= 0) {
    return Object.freeze({ billableMinutes: 0, blocks: 0, charge: zero(currency) });
  }

  const blockMs = policy.penaltyBlockMinutes * MS_PER_MINUTE;
  const blocks = Math.ceil(view.billableOverdueMs / blockMs);
  return Object.freeze({
    // Se redondea hacia arriba también aquí: mostrar «6 minutos» cuando se
    // cobran 7 sería explicar mal lo que se está cobrando.
    billableMinutes: Math.ceil(view.billableOverdueMs / MS_PER_MINUTE),
    blocks,
    charge: multiply(policy.penaltyPricePerBlock, BigInt(blocks)),
  });
}

/** Total a liquidar: lo pagado por el paquete más el excedente. */
export function computeSettlement(
  packagePrice: Money,
  view: SessionView,
  policy: ParkPolicy,
): Readonly<{ packagePrice: Money; overdue: Money; total: Money }> {
  const overdue = computeOverdueCharge(view, policy);
  return Object.freeze({
    packagePrice,
    overdue,
    total: add(packagePrice, overdue),
  });
}

/* -------------------------------------------------------------------- aforo */

export type CapacityState = Readonly<{
  active: number;
  limit: number;
  isFull: boolean;
  remaining: number;
}>;

/**
 * Aforo configurable (DEC-7: 30 niños en el caso piloto).
 * Es un dato, no una constante: se cambia desde configuración sin desplegar.
 */
export function computeCapacity(activeSessions: number, limit: number): CapacityState {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`El aforo debe ser un entero ≥ 1, recibido: ${limit}`);
  }
  return Object.freeze({
    active: activeSessions,
    limit,
    isFull: activeSessions >= limit,
    remaining: Math.max(0, limit - activeSessions),
  });
}

/* ---------------------------------------------------------------- salida */

export type ExitSettlement = Readonly<{
  /** Minutos en sala, redondeados hacia arriba como el cobro. */
  consumedMinutes: number;
  /** Minutos cobrables por encima de lo contratado, ya descontada la gracia. */
  billableOverdueMinutes: number;
  /** Bloques de penalización iniciados que se cobran. */
  penaltyBlocks: number;
  /** Los minutos de cada bloque (B4-17: los del paquete más chico de la tarifa). */
  blockMinutes: number;
  overdue: Money;
}>;

/**
 * Lo que se liquida de una estancia al salir en `now` (F5-14): el excedente con su desglose, con las
 * condiciones que regían AL ENTRAR (`policy`). Es la misma cuenta que enseña la sala; la hace el
 * servidor con su reloj (ADR-010) y la pantalla solo la anticipa.
 */
export function settleAtExit(
  session: ParkSession,
  policy: ParkPolicy,
  now: EpochMs,
  /** La tarifa con que entró y lo contratado (B4-17): con ella, el tiempo de más va en bloques del paquete más chico. */
  cobro?: Readonly<{ tarifa: readonly PaqueteDeUso[]; contratado: Money }>,
): ExitSettlement {
  const view = computeSessionView(session, policy, now);
  const nuevo = cobro && session.duration.kind === "fixed" ? tiempoDeMas(view, cobro.contratado, cobro.tarifa, policy.graceMinutes) : null;
  const desglose = nuevo ?? computeOverdueBreakdown(view, policy);
  return Object.freeze({
    // Se redondea hacia arriba igual que el cobro: «59 min» cuando se cobró una hora sería explicar mal el recibo.
    consumedMinutes: Math.ceil(view.elapsedMs / MS_PER_MINUTE),
    billableOverdueMinutes: desglose.billableMinutes,
    penaltyBlocks: desglose.blocks,
    blockMinutes: nuevo ? nuevo.blockMinutes : policy.penaltyBlockMinutes,
    overdue: desglose.charge,
  });
}

/* ---------------------------------------------------------------- entrada */

/**
 * ¿Caben `incoming` niños más con `active` dentro? El aforo es un tope (DEC-7): se puede llegar a él,
 * no pasarlo. Una entrada de tres con dos plazas libres no entra a medias: no entra.
 */
export function admits(active: number, incoming: number, limit: number): boolean {
  if (!Number.isInteger(incoming) || incoming < 1) {
    throw new RangeError(`Una entrada registra uno o más niños, recibido: ${incoming}`);
  }
  return computeCapacity(active, limit).active + incoming <= limit;
}

/**
 * La llave de un contacto (F5-03): el teléfono en dígitos, para reconocer a la familia escriba como
 * escriba el número. «0412-123.45.67», «0412 1234567» y «+58 412 1234567» son la misma familia.
 * `null` si no hay dígitos suficientes para distinguir a nadie (menos de 4) o son demasiados.
 */
export function contactKey(reference: string): string | null {
  let digitos = reference.replace(/\D/g, "");
  // El prefijo del país (58) se escribe en lugar del cero de la operadora.
  if (digitos.length === 12 && digitos.startsWith("58")) digitos = `0${digitos.slice(2)}`;
  return digitos.length >= 4 && digitos.length <= 20 ? digitos : null;
}

/**
 * La llave de un documento (B6-9, M-33): la cédula o el RIF en mayúscula y sin separadores, para reconocer al
 * cliente escriba como escriba. «v-12.345.678», «V 12345678» y «V12345678» son la misma persona. `null` si no es una
 * letra (V o E de cédula; J, P o G de RIF) seguida de 5 a 10 dígitos.
 */
export function documentKey(documento: string): string | null {
  const limpio = documento.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[VEJPG]\d{5,10}$/.test(limpio) ? limpio : null;
}

/** El documento como se escribe en pantalla y en papel: «V-12345678», y un RIF con su dígito, «J-40123456-7». */
export function documentoLegible(documento: string): string | null {
  const llave = documentKey(documento);
  if (!llave) return null;
  const letra = llave.slice(0, 1);
  const digitos = llave.slice(1);
  return "JPG".includes(letra) && digitos.length === 9 ? `${letra}-${digitos.slice(0, 8)}-${digitos.slice(8)}` : `${letra}-${digitos}`;
}

/** Un teléfono de Venezuela como se escribe: «0414-1234567». `null` si no son los once dígitos de uno. */
export function telefonoLegible(telefono: string): string | null {
  const llave = contactKey(telefono);
  return llave !== null && /^0\d{10}$/.test(llave) ? `${llave.slice(0, 4)}-${llave.slice(4)}` : null;
}

/* ------------------------------------------------- salir antes de tiempo (B4-6) */

/** Un paquete del tarifario, como lo mira la salida para cobrar por uso. */
export type PaqueteDeUso = Readonly<{ name: string; duration: Duration; price: Money }>;

/**
 * Salir antes de tiempo en cuenta abierta (B4-6, M-18): el paquete más barato del tarifario que cubre lo que
 * el niño estuvo (con la gracia), si cuesta menos que lo contratado (`contratado`: el paquete y sus recargas).
 * `null` si no hay nada que ajustar: lo contratado ya es lo más barato, o ningún paquete cubre ese tiempo.
 *
 * Un paquete fijo cubre si sus minutos más la gracia llegan a lo que estuvo; el pase libre (`openEnded`)
 * cubre siempre. A igual precio gana el más corto, que es el que mejor dice lo que se usó. Si se pasó de
 * lo contratado, esto no se llama: se cobra como siempre, el paquete y el tiempo de más.
 */
export function paquetePorUso(
  paquetes: readonly PaqueteDeUso[],
  elapsedMs: number,
  graceMinutes: number,
  contratado: Money,
): PaqueteDeUso | null {
  const cubre = (p: PaqueteDeUso) => p.duration.kind === "openEnded" || (p.duration.minutes + graceMinutes) * MS_PER_MINUTE >= elapsedMs;
  const largo = (p: PaqueteDeUso) => (p.duration.kind === "openEnded" ? Number.POSITIVE_INFINITY : p.duration.minutes);
  const candidatos = paquetes
    .filter((p) => p.price.currency === contratado.currency && cubre(p))
    .sort((a, b) => (a.price.amount === b.price.amount ? largo(a) - largo(b) : a.price.amount < b.price.amount ? -1 : 1));
  const mejor = candidatos[0];
  return mejor && mejor.price.amount < contratado.amount ? mejor : null;
}

/* -------------------------------------------------------- recarga y huérfanas */

/**
 * La duración de una estancia con sus recargas (F5-11): el paquete más cada tramo comprado. El tiempo
 * abierto no se recarga (no tiene minutos que sumar): se devuelve tal cual.
 */
export function withRecharges(duration: Duration, rechargeMinutes: readonly number[]): Duration {
  if (duration.kind === "openEnded") return duration;
  return fixed(rechargeMinutes.reduce((total, m) => total + minutes(m), duration.minutes as number));
}

/**
 * Cuántos milisegundos dentro hacen huérfana a una estancia del día. Las horas son un ajuste del
 * local (B4-4; el cliente decidió 8 el 2026-09-28), no una constante del dominio.
 */
export function orphanAfterMs(hours: number): number {
  if (!Number.isInteger(hours) || hours <= 0) throw new RangeError(`Horas de una huérfana no válidas: ${hours}`);
  return hours * 60 * MS_PER_MINUTE;
}

/**
 * ¿Es huérfana (F5-13, H-19)? Una estancia que sigue abierta desde un día anterior (`startOfToday`,
 * el inicio del día del local) o que lleva más de `afterMs` dentro: casi seguro el niño se fue sin
 * que se registrara la salida. Pasa a revisión de la dirección y deja de contar en el aforo; nunca
 * se le cobra tiempo de más por estar olvidada.
 */
export function isOrphan(startedAt: EpochMs, now: EpochMs, startOfToday: EpochMs, afterMs: number): boolean {
  return startedAt < startOfToday || now - startedAt > afterMs;
}

/**
 * El primer instante en que esa estancia ya es huérfana: pasado el umbral o al empezar el día
 * siguiente al de su entrada (`startOfNextDay`), lo que llegue antes. Nada lo avisa desde el
 * servidor (solo pasa el tiempo), así que la sala vuelve a leer justo entonces, sin sondear.
 */
export function becomesOrphanAt(startedAt: EpochMs, afterMs: number, startOfNextDay: EpochMs): EpochMs {
  return epochMs(Math.min(startedAt + afterMs + 1, startOfNextDay));
}

/** El formato de la serie de pulseras del local (V-1): prefijo y longitud total. `null` = sin fijar. */
/* -------------------------------------------------------- sin pulsera (B4-8) */

/**
 * El prefijo de los niños que entran SIN pulsera (B4-8, M-27, P-1): niños con capacidades especiales que no la
 * toleran. El código lo pone el servidor y ningún lote lo trae: una pulsera física con este prefijo se rechaza,
 * para que nadie confunda a un niño sin pulsera con otro. Con el código, la sala, la salida y la caja lo tratan
 * como a cualquiera; a él se le reconoce por su nombre.
 */
export const WRISTBANDLESS_PREFIX = "SP-";

/** ¿Es el código de un niño sin pulsera? */
export function isWristbandless(code: string): boolean {
  return code.toUpperCase().startsWith(WRISTBANDLESS_PREFIX);
}

/** El código del n-ésimo niño sin pulsera de la sucursal: «SP-00001». */
export function wristbandlessCode(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99_999) throw new RangeError(`Número de niño sin pulsera fuera de rango: ${n}`);
  return `${WRISTBANDLESS_PREFIX}${String(n).padStart(5, "0")}`;
}

/** El siguiente número libre, a partir de los códigos sin pulsera que ya se usaron (una visita cada uno, V-1). */
export function nextWristbandlessNumber(used: readonly string[]): number {
  let max = 0;
  for (const c of used) {
    const m = /^SP-(\d+)$/i.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export type WristbandSeries = Readonly<{ prefix: string | null; length: number | null }>;

/** Por qué un código no es de la serie del local. */
export type WristbandSeriesProblem = "PREFIJO" | "LONGITUD";

/**
 * ¿Es este código de la serie del local? Sin serie fijada vale cualquiera (D-PUL: se fija con el
 * primer lote). El código llega ya normalizado (mayúsculas, sin espacios).
 */
export function wristbandSeriesProblem(code: string, series: WristbandSeries): WristbandSeriesProblem | null {
  if (series.prefix !== null && !code.startsWith(series.prefix)) return "PREFIJO";
  if (series.length !== null && code.length !== series.length) return "LONGITUD";
  return null;
}

/* ------------------------------------------------------------------ formato */

/** Formatea una duración como HH:MM:SS o MM:SS. Solo presentación. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export { money };

/* ---------------------------------------------------------- cumpleaños */

export * from "./eventos.ts";

/* ------------------------------------------------- la regla de precio (B4-17, M-37) */

/** Una combinación de paquetes de la tarifa: lo que cuesta y cómo se dice («1 hora + 30 minutos»). */
export type Combinacion = Readonly<{ precio: Money; paquetes: readonly string[] }>;

/**
 * Lo que vale un tiempo con la tarifa (B4-17, M-37): la combinación más barata de paquetes cuya duración, con la gracia,
 * cubre lo que el niño estuvo; al menos un paquete, y nunca más que el pase libre (un paquete sin límite). Es la misma
 * regla para el tiempo abierto, el tiempo de más y salir antes de tiempo en cuenta abierta. `null` si la tarifa no tiene
 * ningún paquete en esa moneda.
 *
 * Los paquetes son los de la versión del tarifario con que entró el niño: las condiciones no cambian a mitad de una
 * estancia (B4-2).
 */
export function precioDelTiempo(
  tarifa: readonly PaqueteDeUso[],
  elapsedMs: number,
  graceMinutes: number,
  currency: Money["currency"],
): Combinacion | null {
  const fijos = tarifa.filter(
    (p): p is PaqueteDeUso & { duration: Extract<Duration, { kind: "fixed" }> } =>
      p.price.currency === currency && p.duration.kind === "fixed" && p.duration.minutes > 0,
  );
  const libre = tarifa
    .filter((p) => p.price.currency === currency && p.duration.kind === "openEnded")
    .sort((a, b) => (a.price.amount < b.price.amount ? -1 : a.price.amount > b.price.amount ? 1 : 0))[0];
  if (fijos.length === 0) return libre ? { precio: libre.price, paquetes: [libre.name] } : null;

  // Los minutos que hay que cubrir, ya con la gracia; al menos uno: estar dentro cuesta al menos un paquete.
  const cubrir = Math.max(1, Math.ceil(elapsedMs / MS_PER_MINUTE) - graceMinutes);
  // Lo más barato para cubrir al menos m minutos, con lo que se eligió para reconstruir la combinación.
  const costo: bigint[] = new Array(cubrir + 1).fill(-1n);
  const elegido: number[] = new Array(cubrir + 1).fill(-1);
  costo[0] = 0n;
  for (let m = 1; m <= cubrir; m++) {
    for (let i = 0; i < fijos.length; i++) {
      const p = fijos[i]!;
      const antes = costo[Math.max(0, m - p.duration.minutes)]!;
      const c = antes + p.price.amount;
      // A igual precio, el de más minutos: la combinación más corta de decir.
      if (costo[m] === -1n || c < costo[m]! || (c === costo[m]! && p.duration.minutes > fijos[elegido[m]!]!.duration.minutes)) {
        costo[m] = c;
        elegido[m] = i;
      }
    }
  }
  const paquetes: string[] = [];
  for (let m = cubrir; m > 0; ) {
    const p = fijos[elegido[m]!]!;
    paquetes.push(p.name);
    m = Math.max(0, m - p.duration.minutes);
  }
  // Los mayores primero: «2 horas + 30 minutos».
  const largo = new Map(fijos.map((p) => [p.name, p.duration.minutes]));
  paquetes.sort((a, b) => (largo.get(b) ?? 0) - (largo.get(a) ?? 0));
  const combinacion: Combinacion = { precio: money(costo[cubrir]!, currency), paquetes };
  return libre && libre.price.amount < combinacion.precio.amount ? { precio: libre.price, paquetes: [libre.name] } : combinacion;
}

export type TiempoDeMas = Readonly<{
  /** Minutos cobrables, ya descontada la gracia. */
  billableMinutes: number;
  /** Bloques iniciados, del paquete más chico de la tarifa. */
  blocks: number;
  /** Los minutos de cada bloque (los del paquete más chico: 30). */
  blockMinutes: number;
  charge: Money;
}>;

/**
 * El tiempo de más de un paquete fijo (B4-17, M-37): pasada la gracia, en bloques del paquete más chico de la tarifa
 * (30 min al precio de 30 min), y nunca más que lo que falta para la combinación más barata que cubre el tiempo real.
 * Con 30 min $3, 1 h $5, 2 h $9 y 5 min de gracia, 1 h que sale a 1:20 paga $3 y a 1:50 paga $4 ($9 en total, no $11).
 * `null` si la tarifa no tiene paquetes fijos: entonces vale el recargo de antes (`computeOverdueBreakdown`).
 */
export function tiempoDeMas(view: SessionView, contratado: Money, tarifa: readonly PaqueteDeUso[], graceMinutes: number): TiempoDeMas | null {
  const fijos = tarifa.filter((p) => p.price.currency === contratado.currency && p.duration.kind === "fixed" && p.duration.minutes > 0);
  if (fijos.length === 0) return null;
  const chico = fijos.reduce((a, b) => {
    const ma = a.duration.kind === "fixed" ? a.duration.minutes : 0;
    const mb = b.duration.kind === "fixed" ? b.duration.minutes : 0;
    return mb < ma || (mb === ma && b.price.amount < a.price.amount) ? b : a;
  });
  const blockMinutes = chico.duration.kind === "fixed" ? chico.duration.minutes : 0;
  if (view.billableOverdueMs <= 0) return Object.freeze({ billableMinutes: 0, blocks: 0, blockMinutes, charge: zero(contratado.currency) });
  const blocks = Math.ceil(view.billableOverdueMs / (blockMinutes * MS_PER_MINUTE));
  const porBloques = multiply(chico.price, BigInt(blocks));
  const total = precioDelTiempo(tarifa, view.elapsedMs, graceMinutes, contratado.currency);
  const tope = total && total.precio.amount > contratado.amount ? total.precio.amount - contratado.amount : 0n;
  return Object.freeze({
    billableMinutes: Math.ceil(view.billableOverdueMs / MS_PER_MINUTE),
    blocks,
    blockMinutes,
    charge: money(porBloques.amount < tope ? porBloques.amount : tope, contratado.currency),
  });
}

/**
 * Subir de paquete (B4-17, M-37): lo que falta pagar para pasar de lo contratado (el paquete y lo que ya subió) a un
 * paquete mayor, y los minutos que suma. El total queda en el precio del paquete final. `null` si ese paquete no es
 * mayor que lo que ya tiene, o no es de tiempo fijo.
 */
export function subirDePaquete(
  actual: Readonly<{ minutos: number; contratado: Money }>,
  destino: PaqueteDeUso,
): Readonly<{ minutos: number; diferencia: Money }> | null {
  if (destino.duration.kind !== "fixed" || destino.duration.minutes <= actual.minutos) return null;
  if (destino.price.currency !== actual.contratado.currency) return null;
  const falta = destino.price.amount - actual.contratado.amount;
  return { minutos: destino.duration.minutes - actual.minutos, diferencia: money(falta > 0n ? falta : 0n, actual.contratado.currency) };
}

export type Liquidacion = Readonly<{
  consumedMinutes: number;
  billableOverdueMinutes: number;
  penaltyBlocks: number;
  blockMinutes: number;
  overdue: Money;
  /** Lo contratado: el paquete y lo que subió. */
  contratado: Money;
  /**
   * Lo que se cobra en lugar de lo contratado, con la regla de precio: el tiempo abierto, o salir antes de tiempo en
   * cuenta abierta si la combinación cuesta menos (B4-6, B4-17). `null` si se cobra lo contratado.
   */
  porUso: Combinacion | null;
  total: Money;
}>;

/**
 * La liquidación de una estancia al salir en `now` (B4-17, M-37): la cuenta que anticipa la salida y la que asienta el
 * servidor, con las condiciones y la tarifa con que entró. Una sola función para los dos: si cambia la regla, cambia en
 * los dos a la vez (§9.7).
 *
 *  · **Tiempo abierto:** lo que vale su tiempo con la tarifa (`precioDelTiempo`); sin tarifa, `porUso` es `null` y
 *    quien liquida tiene que negarse (fail-closed: el tiempo abierto no sale gratis).
 *  · **Paquete fijo:** lo contratado, más el tiempo de más en bloques con tope (`tiempoDeMas`; sin tarifa, el recargo de
 *    antes). En cuenta abierta, si salió antes y la combinación cuesta menos, se cobra la combinación.
 *  · **Pase libre** (sin límite y con su precio): lo contratado.
 */
export function liquidarEstancia(
  input: Readonly<{
    session: ParkSession;
    policy: ParkPolicy;
    tarifa: readonly PaqueteDeUso[];
    contratado: Money;
    cuentaAbierta: boolean;
    tiempoAbierto: boolean;
  }>,
  now: EpochMs,
): Liquidacion {
  const { session, policy, tarifa, contratado } = input;
  const view = computeSessionView(session, policy, now);
  const consumedMinutes = Math.ceil(view.elapsedMs / MS_PER_MINUTE);
  if (input.tiempoAbierto) {
    const c = precioDelTiempo(tarifa, view.elapsedMs, policy.graceMinutes, contratado.currency);
    return Object.freeze({
      consumedMinutes,
      billableOverdueMinutes: 0,
      penaltyBlocks: 0,
      blockMinutes: 0,
      overdue: zero(contratado.currency),
      contratado,
      porUso: c,
      total: c ? c.precio : contratado,
    });
  }
  const s = settleAtExit(session, policy, now, { tarifa, contratado });
  let porUso: Combinacion | null = null;
  if (input.cuentaAbierta && s.overdue.amount === 0n) {
    const c = precioDelTiempo(tarifa, view.elapsedMs, policy.graceMinutes, contratado.currency);
    if (c && c.precio.amount < contratado.amount) porUso = c;
  }
  return Object.freeze({
    consumedMinutes,
    billableOverdueMinutes: s.billableOverdueMinutes,
    penaltyBlocks: s.penaltyBlocks,
    blockMinutes: s.blockMinutes,
    overdue: s.overdue,
    contratado,
    porUso,
    total: add(porUso ? porUso.precio : contratado, s.overdue),
  });
}
export { picoDeAforo, type Intervalo } from "./reporte.ts";
