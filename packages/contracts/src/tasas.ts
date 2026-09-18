/**
 * Contratos del motor de tasas — §5.2, ADR-005, tareas F3-03 a F3-05.
 *
 * Una tasa **no es un ajuste que se sobrescribe**: es un registro histórico.
 * Cuando la tasa del día cambia, se captura otra; la de ayer se queda donde
 * está, porque cada pago de ayer la referencia y el arqueo de ayer tiene que
 * seguir cuadrando (regla 5: nada se borra).
 *
 * Lo que decide con estos datos —cuál está vigente, con qué fracción se
 * convierte, si el salto exige mirarlo dos veces— vive en `@l2/domain-rates`,
 * que es puro y tiene sus pruebas. Aquí solo está **la forma**.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

export const RatePairSchema = z.enum(["USD/VES", "USDT/VES"]);
export type RatePair = z.infer<typeof RatePairSchema>;

export const RateSourceSchema = z.enum(["BCV", "MANUAL", "COMERCIAL"]);
export type RateSource = z.infer<typeof RateSourceSchema>;

/**
 * El valor de una tasa: texto decimal, no `number`.
 *
 * Por lo mismo que el dinero (ADR-004): un flotante pierde precisión y aquí el
 * error se multiplica por todo lo que se cobre en bolívares. §5.2 lo pide
 * además con `CHECK value > 0`, y por una razón: una tasa cero convierte
 * cualquier cobro en cero.
 */
export const RateValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, "Solo dígitos y un punto decimal")
  .max(24)
  .refine((v) => /[1-9]/.test(v), "Una tasa de cambio no puede ser cero");

/**
 * Tasa vigente. Viaja con su **origen y su hora de captura** porque ADR-005
 * exige que el operador vea con qué tasa está cobrando, y porque una tasa sin
 * procedencia no es auditable.
 */
export const ExchangeRateSchema = z.object({
  id: IdSchema,
  pair: RatePairSchema,
  /** Valor como texto por la misma razón que el dinero: precisión. */
  value: RateValueSchema,
  source: RateSourceSchema,
  capturedAt: TimestampSchema,
  /** Quién la cargó, o el proceso que la trajo (§5.2). */
  capturedBy: z.string().trim().min(2).max(80).optional(),
  /** Sin confirmar, no se puede cobrar con ella (§5.2, fail-closed). */
  confirmed: z.boolean(),
  /** Quién la confirmó y cuándo. Van juntos o no van (§7.4). */
  confirmedBy: z.string().trim().min(2).max(80).optional(),
  confirmedAt: TimestampSchema.optional(),
})
  .refine((r) => r.confirmed === (r.confirmedBy !== undefined && r.confirmedAt !== undefined), {
    // Una tasa confirmada sin firma no se puede auditar, y una firma sobre una
    // tasa sin confirmar es una confirmación que no surtió efecto: las dos
    // formas son un estado a medias.
    message: "Una tasa confirmada dice quién la confirmó y cuándo; una sin confirmar, no lo dice",
    path: ["confirmed"],
  });
export type ExchangeRateDto = z.infer<typeof ExchangeRateSchema>;

/**
 * El historial completo con su política.
 *
 * El umbral vive aquí y no en el código porque §5.2 lo llama «umbral
 * configurado»: cuánto puede saltar una tasa respecto de la última confirmada
 * antes de exigir que alguien la teclee de nuevo.
 */
export const HistorialTasasSchema = z
  .object({
    tasas: z.array(ExchangeRateSchema),
    /** En puntos básicos: 100 = 1 %. */
    umbralVariacionBasisPoints: z.number().int().positive().max(10_000),
  })
  .refine((h) => new Set(h.tasas.map((t) => t.id)).size === h.tasas.length, {
    message: "Dos tasas no pueden compartir identificador",
    path: ["tasas"],
  })
  .refine(
    (h) =>
      new Set(h.tasas.map((t) => `${t.pair}@${t.capturedAt}`)).size === h.tasas.length,
    {
      // Dos capturas del mismo par en el mismo instante son una reescritura
      // disfrazada: no se sabría cuál estuvo vigente.
      message: "Ya hay una tasa de ese par capturada en ese mismo instante",
      path: ["tasas"],
    },
  );
export type HistorialTasasDto = z.infer<typeof HistorialTasasSchema>;

/**
 * Capturar la tasa del día (F3-04).
 *
 * Entra **sin confirmar, siempre**, venga del BCV o de un dedo: un proveedor
 * de terceros es una entrada no confiable (§7.5) y nadie debería poder mover
 * los precios del negocio sin que un administrador lo vea. Por eso el mando no
 * admite `confirmed`: el estado inicial no es negociable.
 */
export const CapturarTasaCommandSchema = z.strictObject({
  pair: RatePairSchema,
  value: RateValueSchema,
  source: RateSourceSchema,
  capturedBy: z.string().trim().min(2).max(80),
});
export type CapturarTasaCommand = z.infer<typeof CapturarTasaCommandSchema>;

/**
 * Confirmar una tasa para que la caja pueda cobrar con ella (F3-04).
 *
 * `valorVerificado` es el valor tecleado otra vez. Se exige cuando el salto
 * pasa del umbral o cuando no hay ninguna anterior con la que comparar
 * —`needsDoubleCheck` de `@l2/domain-rates` lo decide—, y quien aplica el
 * mando comprueba que coincida. Es la defensa contra la amenaza T2: mover la
 * tasa para beneficiarse, o un dedo de más en el teclado.
 */
export const ConfirmarTasaCommandSchema = z.strictObject({
  rateId: IdSchema,
  confirmadaPor: z.string().trim().min(2).max(80),
  valorVerificado: RateValueSchema.optional(),
});
export type ConfirmarTasaCommand = z.infer<typeof ConfirmarTasaCommandSchema>;

/**
 * Los dos mandos del historial. No hay un tercero: **no se edita ni se borra
 * una tasa**. Corregir una tasa mal tecleada es capturar otra.
 */
export const TasaCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CAPTURAR"), ...CapturarTasaCommandSchema.shape }),
  z.strictObject({ kind: z.literal("CONFIRMAR"), ...ConfirmarTasaCommandSchema.shape }),
]);
export type TasaCommand = z.infer<typeof TasaCommandSchema>;
