/**
 * Los medios de pago del local — F4-02, F4-04, §5.3.
 *
 * Qué se puede cobrar y con qué datos es **configuración del local**, no una
 * constante del código: un local que no tiene punto de venta lo apaga, y el
 * día que el banco del Pago Móvil cambie, cambia aquí y la caja lo enseña al
 * cliente sin desplegar nada (§9.9).
 *
 * Dos cosas que este contrato impone y que son la razón de que exista:
 *
 *  · **Un medio apagado no se cobra, pero no desaparece.** Se desactiva; los
 *    pagos de ayer lo siguen nombrando (regla 5).
 *  · **Los datos que se le enseñan al cliente son del local**, y el cliente
 *    los va a teclear en su banco: un dígito mal en el teléfono del Pago Móvil
 *    es dinero que llega a otra cuenta. Por eso van validados con las mismas
 *    reglas que ya usa el cobro.
 */
import { z } from "zod";
import { IdSchema } from "./primitives.ts";
import { DocumentoVeSchema, TelefonoVeSchema, PosTerminalSchema } from "./pagos.ts";

/** Qué datos exige un medio antes de aceptar el pago. El mismo catálogo que F4-04. */
export const TipoDatosSchema = z.enum(["PAGO_MOVIL", "ZELLE", "USDT", "PUNTO"]);

export const MonedaSchema = z.enum(["USD", "VES", "USDT"]);

/**
 * Un medio de pago configurado.
 *
 * `triggersIgtf` y `canGiveChange` son datos y no código: quién tributa lo
 * dice la norma —y la norma cambia—, y solo el efectivo devuelve vuelto.
 */
export const MedioDePagoSchema = z
  .object({
    /** Código estable: lo referencian los pagos ya cobrados. */
    code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{2,31}$/, "El código va en mayúsculas, sin espacios"),
    label: z.string().trim().min(2, "Nombre demasiado corto").max(24),
    currency: MonedaSchema,
    triggersIgtf: z.boolean(),
    canGiveChange: z.boolean(),
    /** Sin este campo, el medio no pide nada para conciliar. */
    datos: TipoDatosSchema.optional(),
    /** Un medio apagado no se ofrece en la caja. No se borra: se apaga. */
    activo: z.boolean(),
  })
  .refine((m) => !m.canGiveChange || m.currency !== "USDT", {
    // El vuelto sale de la gaveta, y en la gaveta no hay USDT.
    message: "Un medio en USDT no puede dar vuelto",
    path: ["canGiveChange"],
  });
export type MedioDePagoDto = z.infer<typeof MedioDePagoSchema>;

/**
 * Los datos del local que la caja le enseña al cliente para que pague.
 *
 * Son opcionales porque un local puede no tener Zelle. Lo que no se puede es
 * **ofrecer un medio sin los datos que el cliente necesita**: eso lo impone
 * `MediosDePagoSchema` más abajo, y es fail-closed.
 */
export const DatosPagoMovilSchema = z.strictObject({
  /** Código del banco receptor: 4 dígitos (0134 Banesco, 0105 Mercantil…). */
  bankCode: z.string().regex(/^\d{4}$/, "El código del banco son 4 dígitos"),
  phone: TelefonoVeSchema,
  document: DocumentoVeSchema,
});
export type DatosPagoMovilDto = z.infer<typeof DatosPagoMovilSchema>;

export const DatosZelleSchema = z.strictObject({
  /** A nombre de quién llega el pago. El cliente lo ve antes de enviarlo. */
  holder: z.string().trim().min(3, "Escribe el titular de la cuenta").max(80),
  email: z.string().trim().toLowerCase().max(120).pipe(z.email("Correo no válido")),
});
export type DatosZelleDto = z.infer<typeof DatosZelleSchema>;

/**
 * La configuración completa: qué se cobra, por dónde y con qué datos.
 *
 * Las reglas cruzadas viven aquí y no en la pantalla porque son las que
 * impiden un estado que **parece** válido y rompe el cobro: ofrecer Pago Móvil
 * sin decir a qué teléfono, o dejar el punto de venta encendido sin terminales
 * por los que pasar la tarjeta.
 */
export const MediosDePagoSchema = z
  .object({
    medios: z.array(MedioDePagoSchema).min(1, "Tiene que quedar al menos un medio"),
    terminales: z.array(PosTerminalSchema),
    pagoMovil: DatosPagoMovilSchema.optional(),
    zelle: DatosZelleSchema.optional(),
  })
  .refine((c) => new Set(c.medios.map((m) => m.code)).size === c.medios.length, {
    message: "Dos medios no pueden compartir código",
    path: ["medios"],
  })
  .refine((c) => new Set(c.terminales.map((t) => t.id)).size === c.terminales.length, {
    message: "Dos terminales no pueden compartir identificador",
    path: ["terminales"],
  })
  .refine((c) => c.medios.some((m) => m.activo), {
    // Sin ningún medio encendido no se puede cobrar nada: es un local cerrado.
    message: "Tiene que quedar al menos un medio activo",
    path: ["medios"],
  })
  .refine((c) => !c.medios.some((m) => m.activo && m.datos === "PAGO_MOVIL") || c.pagoMovil !== undefined, {
    message: "Para ofrecer Pago Móvil hacen falta el banco, el teléfono y el RIF del local",
    path: ["pagoMovil"],
  })
  .refine((c) => !c.medios.some((m) => m.activo && m.datos === "ZELLE") || c.zelle !== undefined, {
    message: "Para ofrecer Zelle hacen falta el titular y el correo",
    path: ["zelle"],
  })
  .refine((c) => !c.medios.some((m) => m.activo && m.datos === "PUNTO") || c.terminales.length > 0, {
    message: "Para ofrecer el punto de venta hace falta al menos un terminal",
    path: ["terminales"],
  });
export type MediosDePagoDto = z.infer<typeof MediosDePagoSchema>;

/**
 * Los cambios posibles.
 *
 * No hay «borrar un medio»: se apaga, porque los pagos ya cobrados lo
 * nombran. Un terminal sí se retira —no referencia dinero por sí mismo—, pero
 * retirar el último mientras el punto de venta está encendido lo impide la
 * regla de arriba, no un `if` de la pantalla.
 */
export const MedioCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ACTIVAR"), code: z.string(), activo: z.boolean() }),
  z.strictObject({ kind: z.literal("DATOS_PAGO_MOVIL"), datos: DatosPagoMovilSchema }),
  z.strictObject({ kind: z.literal("DATOS_ZELLE"), datos: DatosZelleSchema }),
  z.strictObject({ kind: z.literal("AÑADIR_TERMINAL"), terminal: PosTerminalSchema }),
  z.strictObject({ kind: z.literal("RETIRAR_TERMINAL"), terminalId: IdSchema }),
]);
export type MedioCommand = z.infer<typeof MedioCommandSchema>;
