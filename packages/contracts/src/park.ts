/**
 * Contratos del parque infantil.
 *
 * Fuente única de la forma de estos datos: de aquí salen los tipos de
 * TypeScript, la validación del formulario de entrada y —cuando exista— la
 * validación del servidor. El servidor **siempre revalida**, aunque el
 * cliente ya lo haya hecho (ADR-017).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema, IdempotencyKeySchema } from "./primitives.ts";

/* ------------------------------------------------------------- pulsera */

/**
 * Código de pulsera.
 *
 * Vive aquí y no en el componente lector porque es la **misma regla** que
 * usan el escáner al validar, el formulario al aceptar y el servidor al
 * comprobar. Tenerla en tres sitios es cómo se desincronizan (§9.7).
 *
 * Permisivo a propósito: las pulseras son preimpresas de evento y su formato
 * varía entre lotes. Lo que sí se impone es longitud y alfabeto, que es lo
 * que hace falta para que el buffer del lector no sea una entrada libre
 * (§7.7).
 */
export const WristbandCodeSchema = z
  .string()
  .trim()
  .min(4, "El código es demasiado corto")
  .max(32, "El código es demasiado largo")
  .regex(/^[A-Za-z0-9-]+$/, "Solo letras, números y guiones")
  .transform((v) => v.toUpperCase());

export type WristbandCode = z.infer<typeof WristbandCodeSchema>;

/* ------------------------------------------------- personas (DEC-9) */

/**
 * Representante. **Minimización deliberada**: DEC-9 fijó «lo más sano y menos
 * sensible». Un nombre y una referencia de contacto. Sin documento de
 * identidad, sin dirección, sin foto — y el esquema no los admite, así que
 * añadirlos exige cambiar este contrato a la vista de todos (§7.6).
 */
export const GuardianSchema = z.object({
  id: IdSchema.optional(),
  fullName: z.string().trim().min(2, "Nombre demasiado corto").max(80),
  /** Teléfono u otra forma de contacto en emergencia. Dato sensible. */
  contactReference: z.string().trim().min(4, "Contacto demasiado corto").max(40),
});
export type GuardianDto = z.infer<typeof GuardianSchema>;

/** Niño. Igual que arriba: solo lo que DEC-9 autorizó. */
export const KidSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  nickname: z.string().trim().max(30).optional(),
  /** Solo se pide si alguna tarifa depende de la edad. */
  ageYears: z.number().int().min(0).max(17).optional(),
});
export type KidDto = z.infer<typeof KidSchema>;

/* ------------------------------------------------ tarifas y política */

/**
 * Duración de un paquete. Unión discriminada, no un número.
 *
 * ADR-011: «pase libre» NO es duración cero. El contrato hace imposible
 * expresar la ambigüedad, igual que el tipo del dominio.
 */
export const DurationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"), minutes: z.number().int().positive() }),
  z.object({ kind: z.literal("openEnded") }),
]);
export type DurationDto = z.infer<typeof DurationSchema>;

export const SessionModeSchema = z.enum(["PREPAGO", "POSTPAGO"]);
export type SessionMode = z.infer<typeof SessionModeSchema>;

/** Paquete de tarifa. Es catálogo configurable (§9.9), no constante. */
export const PricePackageSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(40),
  mode: SessionModeSchema,
  duration: DurationSchema,
  price: MoneySchema,
  active: z.boolean(),
});
export type PricePackageDto = z.infer<typeof PricePackageSchema>;

/** Política del parque. Todo configurable por el administrador. */
export const ParkPolicySchema = z.object({
  /** 0 significa «sin gracia», explícitamente. Nunca «gracia infinita». */
  graceMinutes: z.number().int().min(0),
  /** Positivo obligatorio: un bloque de 0 sería una división por cero. */
  penaltyBlockMinutes: z.number().int().positive(),
  penaltyPricePerBlock: MoneySchema,
  warnBeforeMinutes: z.number().int().min(0),
  /** Aforo (DEC-7: 30 en el piloto). Dato, no constante del código. */
  capacityLimit: z.number().int().positive(),
});
export type ParkPolicyDto = z.infer<typeof ParkPolicySchema>;

/** Un nombre de paquete como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
const nombrePaquete = (n: string) =>
  n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

/**
 * El tarifario del parque: sus paquetes y su política, que se editan y se
 * publican juntos (F5-04, F5-06, §9.9).
 *
 * Van juntos porque se contradicen si se cambian por separado: un aviso de
 * «por vencer» de 30 minutos con un paquete de 20 salta en el mismo momento de
 * la entrada. El editor publica los dos a la vez, y este esquema decide si el
 * conjunto tiene sentido.
 *
 * Un paquete **se retira con `active: false`, no se borra** (regla 5): las
 * estancias y los cobros de ayer lo nombran por su id.
 */
export const TarifarioSchema = z
  .object({
    packages: z.array(PricePackageSchema).min(1, "El tarifario necesita al menos un paquete"),
    policy: ParkPolicySchema,
  })
  .superRefine((t, ctx) => {
    const activos = t.packages.filter((p) => p.active);
    if (activos.length === 0) {
      ctx.addIssue({ code: "custom", path: ["packages"], message: "Tiene que haber al menos un paquete a la venta" });
    }

    const ids = new Set<string>();
    const nombres = new Set<string>();
    t.packages.forEach((p, i) => {
      if (ids.has(p.id)) {
        ctx.addIssue({ code: "custom", path: ["packages", i, "id"], message: "Dos paquetes con el mismo id" });
      }
      ids.add(p.id);

      // Un paquete a precio cero sería una cortesía, y eso exige autorización (F6-14).
      if (BigInt(p.price.minor) <= 0n) {
        ctx.addIssue({ code: "custom", path: ["packages", i, "price"], message: `«${p.name}» necesita un precio mayor que cero` });
      }
      // El parque cobra en la moneda funcional (ADR-004).
      if (p.price.currency !== "USD") {
        ctx.addIssue({ code: "custom", path: ["packages", i, "price"], message: `«${p.name}» se cobra en dólares` });
      }
      // Un pase libre se liquida al salir; uno de tiempo fijo se paga al entrar.
      if (p.duration.kind === "openEnded" && p.mode !== "POSTPAGO") {
        ctx.addIssue({ code: "custom", path: ["packages", i, "mode"], message: `«${p.name}» es de tiempo libre: se cobra al salir` });
      }

      if (!p.active) return;
      const clave = nombrePaquete(p.name);
      if (nombres.has(clave)) {
        ctx.addIssue({ code: "custom", path: ["packages", i, "name"], message: `Ya hay un paquete «${p.name}» a la venta` });
      }
      nombres.add(clave);
    });

    const { policy } = t;
    if (BigInt(policy.penaltyPricePerBlock.minor) < 0n) {
      ctx.addIssue({ code: "custom", path: ["policy", "penaltyPricePerBlock"], message: "El precio del excedente no puede ser negativo" });
    }
    if (policy.penaltyPricePerBlock.currency !== "USD") {
      ctx.addIssue({ code: "custom", path: ["policy", "penaltyPricePerBlock"], message: "El excedente se cobra en dólares" });
    }

    // El aviso de «por vencer» tiene que caber en el paquete más corto: si no,
    // la estancia nace ya avisando y el aviso deja de significar nada.
    const cortos = activos.flatMap((p) => (p.duration.kind === "fixed" ? [p.duration.minutes] : []));
    const masCorto = cortos.length > 0 ? Math.min(...cortos) : null;
    if (masCorto !== null && policy.warnBeforeMinutes >= masCorto) {
      ctx.addIssue({
        code: "custom",
        path: ["policy", "warnBeforeMinutes"],
        message: `El aviso (${policy.warnBeforeMinutes} min) tiene que ser menor que el paquete más corto (${masCorto} min)`,
      });
    }
  });
export type TarifarioDto = z.infer<typeof TarifarioSchema>;

/* ----------------------------------------------------------- estancia */

export const SessionStatusSchema = z.enum([
  "ACTIVA",
  "POR_VENCER",
  "EN_GRACIA",
  "VENCIDA",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** Una estancia tal como el servidor la entrega. */
export const ParkSessionSchema = z.object({
  id: IdSchema,
  wristbandCode: WristbandCodeSchema,
  kid: KidSchema,
  mode: SessionModeSchema,
  duration: DurationSchema,
  startedAt: TimestampSchema,
  packageId: IdSchema,
  packagePrice: MoneySchema,
});
export type ParkSessionDto = z.infer<typeof ParkSessionSchema>;

/* --------------------------------------------------- tasa de cambio */

/**
 * Tasa vigente. Viaja con su **origen y su hora de captura** porque ADR-005
 * exige que el operador vea con qué tasa está cobrando, y porque una tasa sin
 * procedencia no es auditable.
 */
export const ExchangeRateSchema = z.object({
  id: IdSchema,
  pair: z.enum(["USD/VES", "USDT/VES"]),
  /** Valor como texto por la misma razón que el dinero: precisión. */
  value: z.string().regex(/^\d+(\.\d+)?$/),
  source: z.enum(["BCV", "MANUAL", "COMERCIAL"]),
  capturedAt: TimestampSchema,
  /** Sin confirmar, no se puede cobrar con ella (§5.2, fail-closed). */
  confirmed: z.boolean(),
});
export type ExchangeRateDto = z.infer<typeof ExchangeRateSchema>;

/* -------------------------------------------------- vista del monitor */

/**
 * Todo lo que el monitor de parque necesita para pintarse.
 *
 * `serverNow` es la pieza que hace cumplible ADR-010: el cliente no consulta
 * su propio reloj para decidir nada, solo interpola desde este instante.
 */
export const MonitorSnapshotSchema = z.object({
  serverNow: TimestampSchema,
  policy: ParkPolicySchema,
  rate: ExchangeRateSchema.nullable(),
  sessions: z.array(ParkSessionSchema),
  shiftLabel: z.string(),
});
export type MonitorSnapshotDto = z.infer<typeof MonitorSnapshotSchema>;

/* ----------------------------------------------------- comando de entrada */

/**
 * Registro de entrada (F5-02). Es lo que envía la pantalla de taquilla.
 *
 * El representante puede ser uno ya conocido (`guardianId`) o nuevo
 * (`guardian`), y **exactamente uno de los dos**: el `refine` lo impone, para
 * que no exista un estado a medias donde no se sabe a quién llamar si pasa
 * algo con el niño.
 */
export const CheckInCommandSchema = z
  .object({
    /** Impide que un doble clic cree dos estancias (I-11). */
    idempotencyKey: IdempotencyKeySchema,
    entries: z
      .array(
        z.object({
          wristbandCode: WristbandCodeSchema,
          kid: KidSchema,
          packageId: IdSchema,
        }),
      )
      .min(1, "Hay que registrar al menos un niño")
      .max(10, "Demasiados niños en un mismo registro"),
    guardianId: IdSchema.optional(),
    guardian: GuardianSchema.optional(),
  })
  .refine((v) => Boolean(v.guardianId) !== Boolean(v.guardian), {
    message: "Indica un representante existente o crea uno nuevo, no ambos",
    path: ["guardian"],
  });
export type CheckInCommand = z.infer<typeof CheckInCommandSchema>;

export const CheckInResultSchema = z.object({
  sessions: z.array(ParkSessionSchema),
  /** Total cobrado en taquilla, o null si se cargó a una mesa. */
  charged: MoneySchema.nullable(),
});
export type CheckInResult = z.infer<typeof CheckInResultSchema>;
