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
import { FechaSchema, IdSchema, TimestampSchema } from "./primitives.ts";

export const RatePairSchema = z.enum(["USD/VES", "USDT/VES"]);
export type RatePair = z.infer<typeof RatePairSchema>;

export const RateSourceSchema = z.enum(["BCV", "MANUAL", "COMERCIAL"]);
export type RateSource = z.infer<typeof RateSourceSchema>;

/**
 * Por qué una tasa traída automáticamente no se aplicó sola (ADR-019): no la dio la web oficial
 * del BCV, es la primera del local o se aparta de la vigente más que el límite de cordura.
 */
export const HeldReasonSchema = z.enum(["PRIMERA", "SALTO", "SOLO_TERCERO"]);
export type HeldReason = z.infer<typeof HeldReasonSchema>;

/**
 * Un aviso sobre la tasa que el servidor calcula al leer (ADR-019): una traída que espera a una
 * persona (`RETENIDA`, crítica) o que, a la hora habitual, el BCV no haya publicado la del
 * siguiente día hábil (`FALTA_SIGUIENTE`, aviso). No tener tasa vigente no viaja aquí: cada
 * pantalla lo sabe con `useTasaVigente`, la misma fuente con la que cobra.
 */
export const AlertaTasaSchema = z.object({
  tipo: z.enum(["RETENIDA", "FALTA_SIGUIENTE"]),
  tono: z.enum(["warn", "crit"]),
  mensaje: z.string().min(5).max(300),
  /** La tasa de la que habla, si es una. */
  rateId: IdSchema.optional(),
});
export type AlertaTasaDto = z.infer<typeof AlertaTasaSchema>;

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
  /**
   * El día para el que vale («fecha valor», el `effectiveFrom` de §5.2). Se cobra solo con la
   * del día en curso: la de ayer bloquea el cobro aunque sea la última confirmada (F3-05).
   */
  effectiveDate: FechaSchema,
  /** Quién la cargó, o el proceso que la trajo (§5.2). */
  capturedBy: z.string().trim().min(2).max(80).optional(),
  /** Sin confirmar, no se puede cobrar con ella (§5.2, fail-closed). */
  confirmed: z.boolean(),
  /** Quién la confirmó y cuándo. Van juntos o no van (§7.4). */
  confirmedBy: z.string().trim().min(2).max(80).optional(),
  confirmedAt: TimestampSchema.optional(),
  /** Si quien confirmó necesitaba autorización (🔐 de supervisión, §7.3), quién la dio. */
  authorizedBy: z.string().trim().min(2).max(80).optional(),
  /** Aplicada sola por la sincronización del BCV, sin persona detrás (ADR-019). */
  automatic: z.boolean().optional(),
  /**
   * Traída automáticamente y NO aplicada sola: por qué (ADR-019). Espera a una persona, que la
   * confirma (tecleándola otra vez) o captura otra.
   */
  heldBack: HeldReasonSchema.optional(),
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
    /**
     * La zona horaria que decide qué día es «hoy» para la tasa (IANA, p. ej. `America/Caracas`).
     * La manda el servidor para que la estación y él cambien de día a la vez. Hasta B2-4 el día
     * es el del calendario del local; después, el que declare el turno (ADR-009).
     */
    zonaHoraria: z.string().min(3).max(64),
    /** Lo que alguien tiene que mirar, calculado por el servidor en el instante de leer. */
    alertas: z.array(AlertaTasaSchema).default([]),
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
 * Capturar la tasa de un día (F3-04). Los dos únicos mandos del historial son este y confirmar:
 * **no se edita ni se borra una tasa**; corregir una mal tecleada es capturar otra.
 *
 * Quien la aplica lo decide el servidor, no el mando (ADR-019): si quien la teclea es
 * administración, se aplica al guardarla; si es supervisión, queda pendiente hasta confirmarla
 * con autorización (🔐). Por eso el mando no admite `confirmed`, ni dice quién la carga: eso lo
 * sabe el servidor por la sesión, no lo declara el navegador.
 *
 * `valorVerificado` es el valor tecleado otra vez. Lo pide el servidor cuando se aplicaría al
 * guardarla y salta más del umbral o es la primera (`needsDoubleCheck`); debe coincidir.
 *
 * `effectiveDate` es el día para el que vale: hoy, o uno de los próximos (el BCV publica
 * por la tarde la del día hábil siguiente). El servidor rechaza un día pasado.
 */
export const CapturarTasaCommandSchema = z.strictObject({
  pair: RatePairSchema,
  value: RateValueSchema,
  source: RateSourceSchema,
  effectiveDate: FechaSchema,
  valorVerificado: RateValueSchema.optional(),
});
export type CapturarTasaCommand = z.infer<typeof CapturarTasaCommandSchema>;

/**
 * Confirmar una tasa para que la caja pueda cobrar con ella (F3-04).
 *
 * `valorVerificado` es el valor tecleado otra vez. Se exige cuando el salto
 * pasa del umbral o cuando no hay ninguna anterior con la que comparar
 * —`needsDoubleCheck` de `@l2/domain-rates` lo decide—, y el servidor
 * comprueba que coincida. Es la defensa contra la amenaza T2: mover la
 * tasa para beneficiarse, o un dedo de más en el teclado.
 */
export const ConfirmarTasaCommandSchema = z.strictObject({
  rateId: IdSchema,
  valorVerificado: RateValueSchema.optional(),
});
export type ConfirmarTasaCommand = z.infer<typeof ConfirmarTasaCommandSchema>;

/**
 * Lo que devuelve traer la tasa del BCV (F3-04, ADR-019). Lo que dio la web oficial y pasa el
 * límite de cordura se aplica solo (`automatic`); lo demás queda pendiente con su `heldBack`.
 * Cada fuente dice si respondió; si dos hablan del mismo día y no coinciden, no se captura nada de
 * ese día y se avisa. `aplicadas` son las que ya estaban pendientes y se aplicaron ahora.
 */
export const SincronizacionTasaSchema = z.object({
  capturadas: z.array(ExchangeRateSchema),
  /** Lo que la fuente dijo y ya estaba en el historial con el mismo valor: no se repite. */
  yaEstaban: z.array(z.object({ effectiveDate: FechaSchema, value: RateValueSchema })),
  aplicadas: z.array(ExchangeRateSchema).default([]),
  fuentes: z.array(
    z.object({ fuente: z.enum(["BCV", "DOLARAPI"]), ok: z.boolean(), detalle: z.string().max(200) }),
  ),
  avisos: z.array(z.string().max(300)),
});
export type SincronizacionTasaDto = z.infer<typeof SincronizacionTasaSchema>;
