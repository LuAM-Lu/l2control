/**
 * L2 Control — El módulo de tasas
 * Implementa §5.2 del plan y [ADR-005](../../../../docs/adr/005-tasa-congelada.md).
 *
 * Es el sitio al que apuntan `@l2/domain-money` y `@l2/domain-cash` cuando
 * dicen «la tasa como dato con vigencia vive en el módulo de tasas». Aquí está
 * lo que ellos no hacen: **cuál es la tasa vigente**, **con qué fracción se
 * convierte** y **cuánto se aparta de la anterior**.
 *
 * Reglas que este módulo impone:
 *
 *  1. Una tasa es un registro histórico: no se corrige, se captura otra. Nada
 *     de lo que hay aquí modifica un historial.
 *  2. Sin tasa confirmada, `currentRate` devuelve `null`. Nunca cero, nunca la
 *     de ayer en silencio, nunca un valor por defecto (regla fail-closed). Para
 *     cobrar se usa `rateOfDay`, que además exige que cubra el día en curso: la
 *     del viernes vale el fin de semana; el lunes, no.
 *  3. El instante entra como argumento (ADR-010): una tasa capturada para
 *     mañana no está vigente hoy, y este módulo no tiene reloj para saberlo.
 *  4. La aritmética es exacta y entera. Una tasa con ocho decimales no se
 *     redondea al construir la fracción: se escala.
 */
import type { CurrencyCode, FrozenRate } from "@l2/domain-money";

/** Los pares que opera el negocio. El bolívar siempre es la moneda cotizada. */
export type RatePair = "USD/VES" | "USDT/VES";

/** De dónde salió la tasa. Sin procedencia, una tasa no es auditable (§5.2). */
export type RateSource = "BCV" | "MANUAL" | "COMERCIAL";

/**
 * Una tasa capturada.
 *
 * `value` es texto decimal —«228.41»— por la misma razón que el dinero no es
 * `number`: un flotante pierde precisión y aquí cada céntimo se multiplica por
 * todo lo que se cobre. Es lo que el BCV publica: cuántos bolívares vale una
 * unidad de la moneda base.
 */
export type RateRecord = Readonly<{
  id: string;
  pair: RatePair;
  value: string;
  source: RateSource;
  /** Cuándo se capturó, en ISO. */
  capturedAt: string;
  /**
   * El día para el que vale («fecha valor», `AAAA-MM-DD`): el `effectiveFrom` de §5.2. El BCV
   * publica por la tarde la tasa del día hábil siguiente, así que capturar no es lo mismo que
   * entrar en vigor. Se cobra solo con la del día en curso (ADR-005).
   */
  effectiveDate: string;
  /** Sin confirmar no se cobra con ella (§5.2, ADR-005). */
  confirmed: boolean;
  /**
   * Solo en una tasa traída automáticamente que NO se aplicó sola: por qué (ADR-019). Se decide
   * al traerla y no cambia; una persona la revisa y la confirma, o captura otra.
   */
  heldBack?: HeldReason | undefined;
}>;

/**
 * Por qué una tasa traída automáticamente espera a una persona (ADR-019):
 *  · `SOLO_TERCERO`: no la dio la web oficial del BCV, solo un tercero que la republica (T6);
 *  · `PRIMERA`: no hay ninguna confirmada con la que compararla;
 *  · `SALTO`: se apartaba de la vigente más que el límite de cordura. Ya no se decide (V-14,
 *    ADR-024): queda para leer las retenidas antiguas, que la siguiente consulta aplica.
 */
export type HeldReason = "PRIMERA" | "SALTO" | "SOLO_TERCERO";

export class InvalidRateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRateError";
  }
}

/** Decimales de cada moneda. Los mismos que usa `@l2/domain-money`. */
const SCALE: Readonly<Record<CurrencyCode, number>> = { USD: 2, VES: 2, USDT: 2 };

const MONEDAS: Readonly<Record<RatePair, Readonly<{ base: CurrencyCode; quote: CurrencyCode }>>> = {
  "USD/VES": { base: "USD", quote: "VES" },
  "USDT/VES": { base: "USDT", quote: "VES" },
};

/** Las dos monedas de un par, para no partir la cadena en cada sitio. */
export function currenciesOf(pair: RatePair): Readonly<{ base: CurrencyCode; quote: CurrencyCode }> {
  return MONEDAS[pair];
}

/**
 * El valor como entero exacto y cuántos decimales tenía.
 *
 * `"228.4152"` → `{ digits: 2284152n, decimals: 4 }`. No se redondea: quien
 * publique una tasa con ocho decimales la verá entera en la fracción.
 */
function parseDecimal(value: string): Readonly<{ digits: bigint; decimals: number }> {
  const texto = value.trim();
  if (!/^\d+(\.\d+)?$/.test(texto)) {
    throw new InvalidRateError(`Tasa no válida: "${value}". Solo dígitos y un punto decimal.`);
  }
  const [entera = "0", fraccion = ""] = texto.split(".");
  const digits = BigInt(entera + fraccion);
  if (digits === 0n) {
    // §5.2 lo pide como `CHECK value > 0`, y por una razón: una tasa cero
    // convierte cualquier cobro en cero o en una división por cero.
    throw new InvalidRateError("Una tasa de cambio no puede ser cero (§5.2).");
  }
  return { digits, decimals: fraccion.length };
}

/** Máximo común divisor, para que la fracción se guarde en su forma corta. */
function mcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * La fracción con la que `convert()` pasa **de bolívares a la moneda base**.
 *
 * Una cotización dice «1 USD = 228,41 VES»; `FrozenRate` dice «tantas unidades
 * menores de `from` equivalen a tantas de `to`». Aquí se traduce lo uno en lo
 * otro sin perder un céntimo: los decimales del valor se compensan escalando
 * las dos partes de la fracción, y después se reduce.
 *
 * Para el sentido contrario —decirle al cliente en bolívares lo que falta—
 * está `invertRate` de `@l2/domain-money`: una sola forma de darle la vuelta.
 */
export function frozenRateOf(rate: Pick<RateRecord, "pair" | "value">): FrozenRate {
  const { base, quote } = currenciesOf(rate.pair);
  const { digits, decimals } = parseDecimal(rate.value);

  // value · 10^escala(quote) unidades menores de quote  ==
  // 1 · 10^escala(base) unidades menores de base.
  // Se multiplican ambas por 10^decimales para que no quede ninguna fracción.
  const numerator = digits * 10n ** BigInt(SCALE[quote]);
  const denominator = 10n ** BigInt(SCALE[base] + decimals);
  const divisor = mcd(numerator, denominator);

  return Object.freeze({
    from: quote,
    to: base,
    numerator: numerator / divisor,
    denominator: denominator / divisor,
  });
}

/**
 * La tasa vigente de un par: la **última confirmada** que ya estaba capturada
 * en ese instante.
 *
 * Devuelve `null` cuando no hay ninguna, y ese `null` es la regla fail-closed
 * de ADR-005: quien llama bloquea el cobro en esa moneda. No existe una
 * versión que «se las arregle» con la de ayer, porque la de ayer, en este
 * negocio, es otro precio.
 *
 * El historial puede venir en cualquier orden: se elige por `capturedAt`, y a
 * igualdad de instante gana la que esté más adelante en la lista, que es la
 * que se capturó después.
 */
export function currentRate(
  history: readonly RateRecord[],
  pair: RatePair,
  now: string,
): RateRecord | null {
  const ahora = Date.parse(now);
  if (Number.isNaN(ahora)) throw new InvalidRateError(`Instante no válido: "${now}".`);

  let vigente: RateRecord | null = null;
  let vigenteEn = -Infinity;

  for (const t of history) {
    if (t.pair !== pair || !t.confirmed) continue;
    const en = Date.parse(t.capturedAt);
    if (Number.isNaN(en) || en > ahora) continue;
    if (en >= vigenteEn) {
      vigente = t;
      vigenteEn = en;
    }
  }
  return vigente;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La tasa con la que se cobra el día `day`: la **vigente** ese día, confirmada.
 *
 * El BCV publica una tasa por día hábil con su **fecha valor**, y esa tasa rige hasta la
 * siguiente: la del viernes vale el sábado y el domingo, que no tienen publicación propia. Así
 * que la vigente es la última confirmada con fecha valor hasta `day`, **siempre que no haya
 * pasado ningún día hábil (lunes a viernes) desde su fecha valor**. El lunes ya no vale la del
 * viernes: exige la del lunes. Es la regla que §5.2 repite porque se olvida, nunca la de ayer en
 * silencio, sin dejar al parque sin cobrar los fines de semana. Un feriado bancario (`holidays`,
 * B2-4) no es día hábil: la del día hábil anterior lo cubre, como cubre el fin de semana.
 *
 * Entre las que valen gana la de fecha valor más reciente y, a igual fecha, la capturada más
 * tarde: capturar otra es la única forma de corregir una tasa (regla 5).
 */
export function rateOfDay(
  history: readonly RateRecord[],
  pair: RatePair,
  day: string,
  now: string,
  holidays: Holidays = SIN_FERIADOS,
): RateRecord | null {
  if (!DIA.test(day)) throw new InvalidRateError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  const validas = history.filter((t) => coversDay(t.effectiveDate, day, holidays));
  // `currentRate` pone el resto: confirmada, del par, ya capturada en `now`, la más nueva.
  // Si la de fecha más reciente no está confirmada todavía, vale la anterior que siga cubriendo.
  const porFecha = [...new Set(validas.map((t) => t.effectiveDate))].sort().reverse();
  for (const fecha of porFecha) {
    const r = currentRate(
      validas.filter((t) => t.effectiveDate === fecha),
      pair,
      now,
    );
    if (r) return r;
  }
  return null;
}

/**
 * Los feriados bancarios del local (B2-4, D-FER), como días `AAAA-MM-DD`. Los carga
 * administración por año desde el calendario de SUDEBAN; aquí solo se consultan.
 */
export type Holidays = readonly string[];
const SIN_FERIADOS: Holidays = Object.freeze([]);

/**
 * ¿Una tasa con fecha valor `effectiveDate` rige el día `day`? Desde su fecha valor y hasta que
 * pase un día hábil: la del viernes cubre sábado y domingo; la de hoy, hoy; y la del día hábil
 * anterior cubre un feriado.
 */
export function coversDay(effectiveDate: string, day: string, holidays: Holidays = SIN_FERIADOS): boolean {
  if (!DIA.test(effectiveDate) || !DIA.test(day)) return false;
  return effectiveDate <= day && !hayDiaHabilEntre(effectiveDate, day, holidays);
}

/** ¿Hay algún día hábil después de `desde` y hasta `hasta`, incluido? */
function hayDiaHabilEntre(desde: string, hasta: string, holidays: Holidays): boolean {
  for (let d = addDays(desde, 1); d <= hasta; d = addDays(d, 1)) {
    if (isBusinessDay(d, holidays)) return true;
  }
  return false;
}

/** ¿Es día hábil bancario? De lunes a viernes, salvo que sea feriado bancario. */
export function isBusinessDay(day: string, holidays: Holidays = SIN_FERIADOS): boolean {
  if (!DIA.test(day)) throw new InvalidRateError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  const semana = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  return semana >= 1 && semana <= 5 && !holidays.includes(day);
}

/** El siguiente día hábil después de `day`: del viernes, el lunes; y se salta los feriados. */
export function nextBusinessDay(day: string, holidays: Holidays = SIN_FERIADOS): string {
  let d = addDays(day, 1);
  while (!isBusinessDay(d, holidays)) d = addDays(d, 1);
  return d;
}

/**
 * El día de calendario (`AAAA-MM-DD`) de un instante en la zona horaria del local.
 *
 * Hasta que el turno declare su día de negocio (B2-4, ADR-009), el día de la tasa es el del
 * calendario del local. Sin reloj: el instante entra como argumento.
 */
export function calendarDay(instant: string, timeZone: string): string {
  const t = Date.parse(instant);
  if (Number.isNaN(t)) throw new InvalidRateError(`Instante no válido: "${instant}".`);
  // `en-CA` escribe las fechas como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/**
 * El instante en que empieza el día `day` en `timeZone`: la medianoche del local, en UTC.
 *
 * Sin suponer un desfase fijo: se mide el de la zona en ese día (Venezuela no cambia de hora,
 * pero el cálculo no depende de eso) y se corrige una vez por si la medianoche cae en un cambio.
 */
export function startOfDay(day: string, timeZone: string): number {
  if (!DIA.test(day)) throw new InvalidRateError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  const medianocheUtc = Date.parse(`${day}T00:00:00.000Z`);
  let t = medianocheUtc - desfase(medianocheUtc, timeZone);
  t = medianocheUtc - desfase(t, timeZone);
  return t;
}

/** Cuánto va la hora de `timeZone` por delante de UTC en el instante `t`, en milisegundos. */
function desfase(t: number, timeZone: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(t);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(de("year"), de("month") - 1, de("day"), de("hour"), de("minute"), de("second"));
  return comoUtc - (t - (t % 1000));
}

/** `day` más `n` días, sin zonas horarias de por medio: es aritmética de calendario. */
export function addDays(day: string, n: number): string {
  if (!DIA.test(day)) throw new InvalidRateError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  const t = Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Cuánto se aparta una tasa de otra, en puntos básicos (100 bps = 1 %).
 *
 * Siempre positivo: lo que importa para el límite de cordura es el tamaño del
 * salto, no si subió o bajó. Se calcula con enteros escalados a la precisión
 * de las dos, para que «228.41» y «228.410000» den exactamente cero.
 */
export function variationBasisPoints(anterior: string, nueva: string): bigint {
  const a = parseDecimal(anterior);
  const b = parseDecimal(nueva);
  const escala = Math.max(a.decimals, b.decimals);
  const va = a.digits * 10n ** BigInt(escala - a.decimals);
  const vb = b.digits * 10n ** BigInt(escala - b.decimals);
  const diferencia = va > vb ? va - vb : vb - va;
  return (diferencia * 10_000n) / va;
}

/**
 * Si confirmar esta tasa exige que alguien vuelva a teclear el valor (§5.2).
 *
 * Un salto grande es el aviso de que alguien se equivocó de tecla o de que el
 * proveedor devolvió basura, y es exactamente el vector T2 del plan: tocar la
 * tasa para beneficiarse. Sin tasa anterior con la que comparar **también**
 * exige la doble verificación: la primera del local no tiene red debajo.
 */
export function needsDoubleCheck(
  anterior: RateRecord | null,
  nueva: Pick<RateRecord, "value">,
  umbralBasisPoints: number,
): boolean {
  if (!Number.isInteger(umbralBasisPoints) || umbralBasisPoints <= 0) {
    throw new InvalidRateError(
      `El umbral de variación se mide en puntos básicos positivos; llegó ${umbralBasisPoints}.`,
    );
  }
  if (!anterior) return true;
  return variationBasisPoints(anterior.value, nueva.value) > BigInt(umbralBasisPoints);
}

/** Lo que decide `autoApplyDecision`: aplicarla sola, o dejarla para una persona y por qué. */
export type AutoApplyDecision = Readonly<{ apply: true }> | Readonly<{ apply: false; reason: HeldReason }>;

/**
 * ¿Se aplica sola una tasa traída automáticamente? (ADR-019, con ADR-024.)
 *
 * Cuando la dio la web oficial del BCV (`official`) y hay una vigente: la tasa del BCV es siempre la
 * que trae la API (V-14), sin límite de cordura, aunque salte mucho. Espera a una persona solo si no
 * la dio la fuente oficial (un tercero manipulado, T6) o si es la primera del local. El orden
 * importa para el motivo: sin fuente oficial no se mira el resto.
 */
export function autoApplyDecision(input: {
  previous: Pick<RateRecord, "value"> | null;
  candidate: Pick<RateRecord, "value">;
  official: boolean;
}): AutoApplyDecision {
  if (!input.official) return { apply: false, reason: "SOLO_TERCERO" };
  if (!input.previous) return { apply: false, reason: "PRIMERA" };
  return { apply: true };
}

/**
 * Las tasas traídas automáticamente que no se aplicaron solas y todavía importan (ADR-019): sin
 * confirmar, de un día que rige `day` o que viene, y sin otra confirmada para el mismo día
 * capturada después (que ya la habría sustituido). Son las alertas críticas de Inicio y de Tasas.
 */
export function heldRates(
  history: readonly RateRecord[],
  pair: RatePair,
  day: string,
  holidays: Holidays = SIN_FERIADOS,
): RateRecord[] {
  if (!DIA.test(day)) throw new InvalidRateError(`Día no válido: "${day}". Se espera AAAA-MM-DD.`);
  return history
    .filter((t) => t.pair === pair && !t.confirmed && t.heldBack !== undefined)
    .filter((t) => t.effectiveDate > day || coversDay(t.effectiveDate, day, holidays))
    .filter(
      (t) =>
        !history.some(
          (o) =>
            o.pair === pair &&
            o.confirmed &&
            o.effectiveDate === t.effectiveDate &&
            Date.parse(o.capturedAt) >= Date.parse(t.capturedAt),
        ),
    )
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

/**
 * El siguiente día hábil si, a estas horas de un día hábil, todavía no hay ninguna tasa para él
 * (ADR-019 §8). El BCV publica por la tarde la del día hábil siguiente; pasada `fromHour` (hora
 * local, 0-23) sin ella, hay que avisar para que no se note el lunes a primera hora. `null` si
 * no toca avisar. Sin reloj: el instante entra como argumento.
 */
export function missingNextBusinessDayRate(
  history: readonly RateRecord[],
  pair: RatePair,
  now: string,
  timeZone: string,
  fromHour: number,
  holidays: Holidays = SIN_FERIADOS,
): string | null {
  if (!Number.isInteger(fromHour) || fromHour < 0 || fromHour > 23) {
    throw new InvalidRateError(`La hora del aviso va de 0 a 23; llegó ${fromHour}.`);
  }
  const day = calendarDay(now, timeZone);
  if (!isBusinessDay(day, holidays)) return null;
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(Date.parse(now)),
  );
  if (hora < fromHour) return null;
  const siguiente = nextBusinessDay(day, holidays);
  return history.some((t) => t.pair === pair && t.effectiveDate === siguiente) ? null : siguiente;
}

/** Por qué un feriado no se puede registrar. */
export type HolidayProblem = "DIA_INVALIDO" | "FIN_DE_SEMANA";

/**
 * ¿Vale como feriado bancario? Un día de calendario real, entre semana: un sábado o un domingo ya
 * no es hábil, y marcarlo como feriado no cambia nada salvo confundir a quien lo lee.
 */
export function holidayProblem(day: string): HolidayProblem | null {
  if (!DIA.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00.000Z`)) || addDays(day, 0) !== day) return "DIA_INVALIDO";
  const semana = new Date(`${day}T12:00:00.000Z`).getUTCDay();
  if (semana === 0 || semana === 6) return "FIN_DE_SEMANA";
  return null;
}

/**
 * Cuánto sigue valiendo para cerrar un cobro la tasa con la que empezó (ADR-019 §7, B3-3): diez
 * minutos. Un cobro en curso conserva su tasa (ADR-005) y la caja avisa si cambió; pasado este
 * margen, el servidor no lo cierra con la vieja.
 */
export const COBRO_GRACE_MS = 10 * 60_000;

/**
 * ¿Se puede cerrar ahora un cobro con la tasa `citedId`? Sí si es la vigente en `now`, o si lo era
 * hace `graceMs` (se aplicó otra hace un momento, con el cobro a medias). Una tasa de ayer, una sin
 * confirmar o una de otro par, no.
 */
export function citedRateValid(
  history: readonly RateRecord[],
  pair: RatePair,
  citedId: string,
  now: number,
  timeZone: string,
  holidays: Holidays = SIN_FERIADOS,
  graceMs: number = COBRO_GRACE_MS,
): boolean {
  for (const t of [now, now - graceMs]) {
    const iso = new Date(t).toISOString();
    if (rateOfDay(history, pair, calendarDay(iso, timeZone), iso, holidays)?.id === citedId) return true;
  }
  return false;
}
