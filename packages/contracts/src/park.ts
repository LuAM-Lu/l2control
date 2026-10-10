/**
 * Contratos del parque infantil.
 *
 * Fuente única de la forma de estos datos: de aquí salen los tipos de
 * TypeScript, la validación del formulario de entrada y —cuando exista— la
 * validación del servidor. El servidor **siempre revalida**, aunque el
 * cliente ya lo haya hecho (ADR-017).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema, IdempotencyKeySchema, PaginaSchema, PorPaginaSchema } from "./primitives.ts";
// La tasa tiene su propio módulo (§5.2): aquí solo se usa para pintar el monitor.
import { ExchangeRateSchema } from "./tasas.ts";
import { FamilyAccountSchema, PaymentModeSchema } from "./account.ts";
import { DocumentoVeSchema } from "./pagos.ts";

/** La cédula como la escriba una persona: «v 12.345.678». */
const cedulaEscrita = z.preprocess((v) => (typeof v === "string" ? v.replace(/[\s.()]/g, "").toUpperCase() : v), DocumentoVeSchema);

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

/**
 * Niño. Igual que arriba: solo lo que DEC-9 autorizó.
 *
 * **El nombre es opcional** (DEC-28). En la puerta, con cola delante, teclear
 * dos nombres en una tablet sin teclado es lo que más tarda; lo que identifica
 * la estancia es la pulsera, que el niño lleva puesta. El nombre se pone
 * después —desde la sala o desde el directorio— o no se pone nunca: la
 * estancia se cobra igual, y el recibo nombra la pulsera.
 */
export const KidSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60).optional(),
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

/**
 * Un tarifario ya publicado: lo que el servidor devuelve al leer y al publicar (B0-5).
 * La versión la asigna el servidor —una más que la vigente— y el cliente nunca la propone:
 * así dos personas que publican a la vez no se pisan, una de las dos recibe CONFLICTO.
 */
export const TarifarioPublicadoSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: TimestampSchema,
  tarifario: TarifarioSchema,
});
export type TarifarioPublicadoDto = z.infer<typeof TarifarioPublicadoSchema>;

/** Una versión publicada del tarifario, como la lee el historial (T-7): quién, cuándo y qué cambió. */
export const VersionTarifarioSchema = z.object({
  version: z.number().int().positive(),
  publicadoEn: TimestampSchema,
  /** Quién la publicó («Consola del servidor» si no fue una persona). */
  publicadoPor: z.string(),
  /** Cuántos paquetes quedaron a la venta. */
  aLaVenta: z.number().int().min(0),
  /** Lo que cambió respecto de la versión anterior, en palabras. */
  cambios: z.array(z.string()),
});
export type VersionTarifarioDto = z.infer<typeof VersionTarifarioSchema>;

export const VersionesTarifarioQuerySchema = z.strictObject({
  pagina: PaginaSchema.default(1),
  porPagina: PorPaginaSchema.default(10),
});
export type VersionesTarifarioQuery = z.input<typeof VersionesTarifarioQuerySchema>;

/** Una página del historial del tarifario, de la más nueva a la más vieja. */
export const PaginaDeVersionesTarifarioSchema = z.object({
  versiones: z.array(VersionTarifarioSchema),
  total: z.number().int().min(0),
  pagina: z.number().int().min(1),
});
export type PaginaDeVersionesTarifarioDto = z.infer<typeof PaginaDeVersionesTarifarioSchema>;

/* ----------------------------------------------------------- estancia */

export const SessionStatusSchema = z.enum([
  "ACTIVA",
  "POR_VENCER",
  "EN_GRACIA",
  "VENCIDA",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** Una estancia tal como el servidor la entrega. */
/**
 * La pausa por comida de una estancia (B4-7, M-27): desde cuándo, cuándo la terminó la monitora (`null` si no la
 * terminó: sigue, o se acabó sola al cumplir `maxMin`) y su máximo, como regía al pausar. Una por visita.
 */
export const PausaSchema = z.object({
  desde: TimestampSchema,
  hasta: TimestampSchema.nullable(),
  maxMin: z.number().int().min(1).max(30),
});
export type PausaDto = z.infer<typeof PausaSchema>;

export const ParkSessionSchema = z.object({
  id: IdSchema,
  wristbandCode: WristbandCodeSchema,
  kid: KidSchema,
  mode: SessionModeSchema,
  duration: DurationSchema,
  startedAt: TimestampSchema,
  packageId: IdSchema,
  packagePrice: MoneySchema,
  /** La pausa por comida, si la tuvo (B4-7). */
  pausa: PausaSchema.optional(),
});
export type ParkSessionDto = z.infer<typeof ParkSessionSchema>;

/**
 * Las condiciones de una estancia: gracia, bloque y precio del excedente y aviso, **como regían al
 * entrar** (B4-2). Publicar otro tarifario no cambia lo que se cobra a quien ya está dentro.
 */
export const ParkTermsSchema = ParkPolicySchema.omit({ capacityLimit: true });
export type ParkTermsDto = z.infer<typeof ParkTermsSchema>;

/**
 * Una estancia tal como la entrega el servidor (B4-2): la del contrato, más de quién es la cuenta que
 * la paga, a quién se entrega el niño, qué paquete compró y con qué condiciones.
 */
export const EstanciaSchema = ParkSessionSchema.extend({
  accountId: z.uuid(),
  guardianId: IdSchema,
  guardianName: z.string().trim().min(2).max(80),
  packageName: z.string().trim().min(1).max(40),
  terms: ParkTermsSchema,
  /**
   * Las recargas de tiempo (F5-11), en orden. `duration` ya las incluye: es lo contratado entero. Se
   * listan porque la estancia conserva sus tramos y cada uno su cobro.
   */
  recargas: z.array(
    z.object({
      minutes: z.number().int().positive(),
      packageName: z.string().trim().min(1).max(40),
      price: MoneySchema,
      at: TimestampSchema,
    }),
  ),
  /**
   * Los paquetes del tarifario con que entró (B4-6): si sale antes de tiempo en cuenta abierta, se cobra el
   * más barato de estos que cubre lo que estuvo. Los activos de esa versión, no los de hoy.
   */
  porUso: z.array(z.object({ name: z.string().trim().min(1).max(40), duration: DurationSchema, price: MoneySchema })).default([]),
});
export type EstanciaDto = z.infer<typeof EstanciaSchema>;

/* -------------------------------------------------- vista del monitor */

/**
 * Todo lo que el monitor de parque necesita para pintarse.
 *
 * `serverNow` es la pieza que hace cumplible ADR-010: el cliente no consulta
 * su propio reloj para decidir nada, solo interpola desde este instante.
 */
/**
 * Lo que avisa la pantalla del PIN de un equipo aprobado (B4-15): cada pulsera en sala y sus dos instantes, cuando entra
 * en «por vencer» y cuando se cumple su tiempo. Sin nombres: el equipo está bloqueado y cualquiera lo ve.
 */
export const AvisosDeSalaSchema = z.object({
  serverNow: TimestampSchema,
  pulseras: z.array(z.object({ codigo: WristbandCodeSchema, porVencer: TimestampSchema, vence: TimestampSchema })),
});
export type AvisosDeSalaDto = z.infer<typeof AvisosDeSalaSchema>;

export const MonitorSnapshotSchema = z.object({
  serverNow: TimestampSchema,
  policy: ParkPolicySchema,
  rate: ExchangeRateSchema.nullable(),
  /** Los niños en sala, con su cuenta y sus condiciones (B4-2). */
  sessions: z.array(EstanciaSchema),
  /**
   * Estancias huérfanas (F5-13, H-19): siguen abiertas desde un día anterior o llevan dentro más de las
   * horas que dicen los ajustes de la sucursal (8 de fábrica, B4-4).
   * No cuentan en el aforo ni se les cobra tiempo de más: esperan la revisión de la dirección.
   */
  huerfanas: z.array(EstanciaSchema),
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
 * algo con el niño. Su **contacto es obligatorio** (DEC-27) y por eso vive en
 * `GuardianSchema`: es la llave que reconoce a la familia en la visita
 * siguiente y el teléfono al que se llama si pasa algo.
 *
 * El nombre del niño, en cambio, puede faltar (DEC-28).
 */
export const CheckInCommandSchema = z
  .object({
    /** Impide que un doble clic cree dos estancias (I-11). */
    idempotencyKey: IdempotencyKeySchema,
    /** Cómo paga la familia (DEC-21): el paquete ahora, o todo junto al salir. */
    paymentMode: PaymentModeSchema,
    entries: z
      .array(
        z
          .object({
            /** La pulsera del niño. Sin ella, entra «sin pulsera» (B4-8) y el servidor le da un código reservado. */
            wristbandCode: WristbandCodeSchema.optional(),
            /**
             * Un niño que no tolera la pulsera (B4-8, M-27, P-1): entra sin ella y se le reconoce por su nombre, que
             * es obligatorio (o un niño ya conocido de la familia).
             */
            sinPulsera: z.literal(true).optional(),
            /**
             * El niño no trae medias (B4-9, M-27, P-6): el par del producto de medias de la sucursal va a la cuenta de la
             * familia y sale del inventario. Sin existencia, la entrada no se registra.
             */
            sinMedias: z.literal(true).optional(),
            kid: KidSchema,
            packageId: IdSchema,
          })
          .refine((e) => (e.wristbandCode === undefined) === (e.sinPulsera === true), {
            message: "Cada niño entra con su pulsera, o marcado «sin pulsera»",
            path: ["wristbandCode"],
          })
          .refine((e) => !e.sinPulsera || e.kid.id !== undefined || (e.kid.name?.trim().length ?? 0) >= 2, {
            message: "Un niño sin pulsera se reconoce por su nombre: escríbelo",
            path: ["kid", "name"],
          }),
      )
      .min(1, "Hay que registrar al menos un niño")
      .max(10, "Demasiados niños en un mismo registro"),
    guardianId: IdSchema.optional(),
    guardian: GuardianSchema.optional(),
    /**
     * La cédula del representante (T-19, M-34): lo primero que se pide. Con ella se reconoce a la familia que vuelve; a
     * un representante de antes que no la tenía, se le anota. El servidor la exige (salvo lo cargado desde papel).
     */
    guardianDocument: cedulaEscrita.optional(),
    /**
     * Sumar a la familia (B4-12, M-34): la cuenta abierta de esta familia con niños en la sala. Los niños nuevos entran
     * en ella con su propio tiempo, desde que entran, y salen con ella. Cómo paga es el de esa cuenta (`paymentMode` no
     * cuenta): en prepago, lo nuevo vuelve a la caja, como una recarga.
     */
    sumarA: IdSchema.optional(),
  })
  .refine((v) => Boolean(v.guardianId) !== Boolean(v.guardian), {
    message: "Indica un representante existente o crea uno nuevo, no ambos",
    path: ["guardian"],
  });
export type CheckInCommand = z.infer<typeof CheckInCommandSchema>;

/**
 * Lo que devuelve la entrada: las estancias abiertas, con la hora del servidor, y la cuenta de la
 * familia que las paga (en prepago, ya en la cola de la caja).
 */
export const CheckInResultSchema = z.object({
  sessions: z.array(EstanciaSchema),
  account: FamilyAccountSchema,
});
export type CheckInResult = z.infer<typeof CheckInResultSchema>;

/* ----------------------------------------- directorio de representantes */

/**
 * Una familia en el directorio — F5-01, DEC-9.
 *
 * Es el **histórico mínimo**: quién trae a quién y cómo llamarlo si hay una
 * urgencia. Sin documento, sin dirección, sin foto; el esquema no los admite,
 * así que añadirlos exige cambiar este contrato a la vista de todos (§7.6).
 *
 * Las visitas no son un dato que alguien teclee: las cuenta el servidor con
 * las estancias, y por eso viajan como resumen y no como lista editable.
 */
export const RepresentanteSchema = z.object({
  id: IdSchema,
  fullName: z.string().trim().min(2, "Nombre demasiado corto").max(80),
  contactReference: z.string().trim().min(4, "Contacto demasiado corto").max(40),
  kids: z.array(KidSchema.extend({ id: IdSchema })),
  /** Cuántas veces ha entrado la familia. Nunca negativo. */
  visitas: z.number().int().min(0),
  ultimaVisita: TimestampSchema.optional(),
  /** La regla VIP con que administración marcó a la familia (B3-6), o nada. */
  vip: z.object({ reglaId: IdSchema, nombre: z.string() }).nullable().optional(),
});
export type RepresentanteDto = z.infer<typeof RepresentanteSchema>;

export const DirectorioRepresentantesSchema = z
  .object({ representantes: z.array(RepresentanteSchema) })
  .refine(
    (d) =>
      new Set(d.representantes.map((r) => r.contactReference.replace(/\D/g, ""))).size ===
      d.representantes.length,
    {
      // El contacto es la llave con la que la entrada encuentra a la familia
      // en dos segundos (F5-03). Repetido, deja de encontrar a ninguna.
      message: "Dos representantes no pueden compartir la referencia de contacto",
      path: ["representantes"],
    },
  )
  .refine((d) => d.representantes.every((r) => r.visitas > 0 || r.ultimaVisita === undefined), {
    message: "Una familia sin visitas no puede tener fecha de última visita",
    path: ["representantes"],
  });
export type DirectorioRepresentantesDto = z.infer<typeof DirectorioRepresentantesSchema>;

/**
 * Corregir un dato del directorio.
 *
 * No lleva motivo, a diferencia de los cambios de personal: arreglar
 * «Bermudez» por «Bermúdez» es una corrección de tecleo, no una decisión que
 * haya que justificar. Lo que sí queda, del lado del servidor, es quién la
 * hizo y cuándo (§7.4).
 *
 * Tampoco existe «borrar»: una familia que no vuelve se queda, porque las
 * estancias que ya pagó la nombran (regla 5).
 */
export const RepresentanteCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("CORREGIR_REPRESENTANTE"),
    representanteId: IdSchema,
    fullName: z.string().trim().min(2, "Nombre demasiado corto").max(80),
    contactReference: z.string().trim().min(4, "Contacto demasiado corto").max(40),
  }),
  z.strictObject({
    kind: z.literal("CORREGIR_NINO"),
    representanteId: IdSchema,
    kidId: IdSchema,
    name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
    nickname: z.string().trim().max(30).optional(),
  }),
]);
export type RepresentanteCommand = z.infer<typeof RepresentanteCommandSchema>;

/**
 * Poner nombre a una estancia que entró solo con su pulsera (DEC-28).
 *
 * Es una corrección de datos, no una operación de dinero: no pide motivo. Lo
 * hace quien está en la puerta, con los niños ya jugando y sin cola delante.
 */
export const NombrarEstanciaCommandSchema = z.strictObject({
  sessionId: IdSchema,
  name: z.string().trim().min(2, "Nombre demasiado corto").max(60),
  nickname: z.string().trim().max(30).optional(),
});
export type NombrarEstanciaCommand = z.infer<typeof NombrarEstanciaCommandSchema>;

/**
 * Buscar a una familia por su contacto en la entrada (F5-03). El servidor compara el contacto
 * entero, en dígitos: no hay búsqueda por pedazos que enseñe el directorio a quien teclea.
 */
/** Qué pasa con una pulsera antes de meterla en una entrada (B4-5, V-1). */
export const ConsultarPulseraSchema = z.strictObject({ codigo: WristbandCodeSchema });
export const EstadoPulseraSchema = z.object({
  codigo: z.string(),
  /** LIBRE: se puede usar. ACTIVA: está en sala. USADA: ya sirvió en otra visita. FUERA_DE_SERIE: no es del lote del local. */
  estado: z.enum(["LIBRE", "ACTIVA", "USADA", "FUERA_DE_SERIE"]),
  /** Lo que se le dice a la monitora cuando no está libre. */
  mensaje: z.string().nullable(),
});
export type EstadoPulseraDto = z.infer<typeof EstadoPulseraSchema>;

export const BuscarRepresentanteSchema = z
  .strictObject({
    contacto: z.string().trim().min(4).max(40).optional(),
    /** Por la cédula (T-19): lo primero que se pide en la entrada. */
    documento: z.string().trim().min(5).max(20).optional(),
  })
  .refine((b) => Boolean(b.contacto) || Boolean(b.documento), { message: "Escribe la cédula o el teléfono" });

/** La familia encontrada: su nombre y sus niños con nombre. Sin el contacto, que ya se tecleó. */
export const RepresentanteEncontradoSchema = z.object({
  id: IdSchema,
  fullName: z.string().trim().min(2).max(80),
  kids: z.array(KidSchema.extend({ id: IdSchema, name: z.string().trim().min(2).max(60) })),
  /** Si ya tiene la cédula anotada; si no, la entrada la pide para completarlo (T-19). */
  tieneCedula: z.boolean().default(false),
});
export type RepresentanteEncontradoDto = z.infer<typeof RepresentanteEncontradoSchema>;

/**
 * Más tiempo para un niño en sala (F5-11; B4-17, M-37): subir a un paquete mayor (`packageId`, el paquete al que sube)
 * pagando la diferencia; el total queda en el precio de ese paquete. La estancia conserva sus tramos y la diferencia
 * entra en la cuenta de la familia; en prepago, a la caja.
 */
/**
 * El «paquete» de quien entra con tiempo abierto (B4-17, M-37): sin límite, solo en cuenta abierta, y al salir se cobra lo
 * que vale su tiempo con la tarifa. No es un paquete del tarifario: la entrada lo pide con este id.
 */
export const TIEMPO_ABIERTO_ID = "tiempo-abierto";

export const RecargaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  sessionId: IdSchema,
  packageId: IdSchema,
});
export type RecargaCommand = z.infer<typeof RecargaCommandSchema>;

/**
 * Pausar el tiempo de un niño que sale a comer, o terminar su pausa antes del máximo (B4-7, M-27). Una pausa
 * por visita; pasado el máximo de la sucursal, el reloj vuelve a correr solo.
 */
export const PausaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  sessionId: IdSchema,
  accion: z.enum(["PAUSAR", "REANUDAR"]),
});
export type PausaCommand = z.infer<typeof PausaCommandSchema>;

export const RecargaResultSchema = z.object({
  session: EstanciaSchema,
  account: FamilyAccountSchema,
});
export type RecargaResult = z.infer<typeof RecargaResultSchema>;

/**
 * Anular la entrada de un niño registrada por error (B4-10, M-27, P-7): sale de la sala sin cobro y su paquete deja de
 * cobrarse (si ya se cobró, primero se anula ese cobro en la caja). Nada se borra: la estancia queda anulada con su motivo
 * y su pulsera vuelve a servir. La autoriza administración (supervisión, con la 🔐 de administración).
 */
export const AnularEntradaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  sessionId: IdSchema,
  motivo: z.string().trim().min(5, "Explica qué pasó (al menos 5 letras)").max(200),
});
export type AnularEntradaCommand = z.infer<typeof AnularEntradaCommandSchema>;

/**
 * Cerrar una estancia huérfana (F5-13, H-19): la dirección la da por terminada con un motivo. No se
 * cobra tiempo de más (nadie sabe cuándo se fue) y no se dice quién lo recogió (nadie lo vio salir).
 */
export const CierreHuerfanaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  sessionId: IdSchema,
  motivo: z.string().trim().min(5, "Explica qué pasó (al menos 5 letras)").max(200),
});
export type CierreHuerfanaCommand = z.infer<typeof CierreHuerfanaCommandSchema>;
