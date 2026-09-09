/**
 * Primitivas de todos los contratos.
 * Implementa ADR-017: se definen una vez y de aquí salen los tipos, la
 * validación del formulario y la validación del servidor.
 */
import { z } from "zod";

/* ------------------------------------------------------------ identidad */

export const IdSchema = z.string().min(1).max(64);
export type Id = z.infer<typeof IdSchema>;

/* --------------------------------------------------------------- tiempo */

/**
 * Instante en ISO 8601 con zona.
 *
 * Por qué texto ISO y no epoch en milisegundos: el cable se lee en logs, en
 * la pestaña de red y en un volcado de auditoría. `1757419200000` no dice
 * nada; `2026-09-09T14:00:00.000Z` se comprueba de un vistazo. En un sistema
 * cuyo producto es el tiempo, y con la auditoría que exige §7.4, esa
 * legibilidad vale más que los bytes que ahorra el número.
 *
 * La conversión a `EpochMs` ocurre en el borde, una sola vez, igual que el
 * dinero pasa a unidades mayores solo al mostrarlo.
 */
export const TimestampSchema = z.iso.datetime();
export type Timestamp = z.infer<typeof TimestampSchema>;

/* --------------------------------------------------------------- dinero */

export const CurrencySchema = z.enum(["USD", "VES", "USDT"]);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Dinero en el cable.
 *
 * `minor` es **texto**, no número, y no es una excentricidad: `bigint` no es
 * serializable a JSON, y `number` pierde precisión por encima de 2^53. Un
 * entero en texto no pierde nada y se convierte a `bigint` sin ambigüedad.
 *
 * La regla de §5.1 sigue viva aquí: un monto **nunca viaja sin su moneda**.
 */
export const MoneySchema = z.object({
  /** Entero en unidades menores, como texto. Ej. "1750" = 17,50. */
  minor: z.string().regex(/^-?\d+$/, "Debe ser un entero en unidades menores"),
  currency: CurrencySchema,
});
export type MoneyDto = z.infer<typeof MoneySchema>;

/* ----------------------------------------------------------- idempotencia */

/**
 * Clave de idempotencia. La genera el cliente antes de enviar, para que un
 * doble clic o un reintento tras un corte de red no cobren dos veces
 * (§5.5, invariante I-11).
 */
export const IdempotencyKeySchema = z.uuid();
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

/* ------------------------------------------------------------- resultados */

/**
 * Envoltorio de error del servidor. Los errores llevan **código**, no solo
 * texto: la interfaz decide qué mostrar según el código, y el texto es para
 * la persona. §9.8 pide errores tipados por dominio, y esto es su forma en
 * el cable.
 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  /** Campo del formulario al que pertenece el error, si aplica. */
  field: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
