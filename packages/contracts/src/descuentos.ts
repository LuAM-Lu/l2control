/**
 * Los descuentos — V-9, D-DESC, B3-6.
 *
 * Administración crea las **reglas** en Ajustes → Descuentos (por medio de pago, VIP o manual; un
 * porcentaje o un monto; sobre toda la cuenta, el parque, el restaurante o unas categorías; con su
 * vigencia por días) y marca a las familias VIP con una de sus reglas VIP. Una regla no se edita ni se
 * borra: se retira, y la que la sustituye es otra (lo cobrado con ella sigue diciendo cuál fue).
 *
 * En la caja, cada cuenta lleva **uno** (D-DESC): la caja propone el mayor y quien autoriza puede
 * elegir otro. El de medio pide la 🔐 de supervisión o administración y que toda la cuenta vaya por
 * ese medio; el manual, motivo de lista cerrada y 🔐 (supervisión hasta su tope, un ajuste del local);
 * el VIP lo ampara la marca de la familia; y administración aplica el que quiera con su PIN y un
 * motivo escrito. Siempre antes del IVA. El cobro lo consume: queda en la venta y en las excepciones.
 */
import { z } from "zod";
import { CodigoMedioSchema } from "./medios.ts";
import { FechaSchema, IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** Lo que se configura: por medio de pago, VIP o manual. */
export const TipoReglaDescuentoSchema = z.enum(["MEDIO", "VIP", "MANUAL"], { error: "Elige el tipo de descuento" });
export type TipoReglaDescuento = z.infer<typeof TipoReglaDescuentoSchema>;

/** De dónde sale el descuento de una cuenta: una regla, o administración en el momento. */
export const OrigenDescuentoSchema = z.enum(["MEDIO", "VIP", "MANUAL", "ADMIN"]);
export type OrigenDescuento = z.infer<typeof OrigenDescuentoSchema>;

/** Un porcentaje en puntos básicos (1000 = 10 %) o un monto en dólares. Nunca un decimal suelto. */
export const ValorDescuentoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("PORCENTAJE"),
    basisPoints: z.number().int("Porcentaje con hasta dos decimales").min(1, "Un descuento descuenta algo").max(10_000, "Hasta el 100 %"),
  }),
  z.object({
    tipo: z.literal("MONTO"),
    monto: MoneySchema.refine((m) => m.currency === "USD", "El monto va en dólares").refine(
      (m) => /^\d+$/.test(m.minor) && BigInt(m.minor) > 0n && BigInt(m.minor) <= 1_000_000n,
      "Un monto entre $ 0,01 y $ 10.000,00",
    ),
  }),
]);
export type ValorDescuentoDto = z.infer<typeof ValorDescuentoSchema>;

/** Sobre qué se descuenta. Las categorías son las del catálogo de productos. */
export const AlcanceDescuentoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("CUENTA") }),
  z.object({ tipo: z.literal("PARQUE") }),
  z.object({ tipo: z.literal("RESTAURANTE") }),
  z.object({
    tipo: z.literal("CATEGORIAS"),
    categorias: z.array(z.string().trim().min(1).max(40)).min(1, "Elige al menos una categoría").max(20),
  }),
]);
export type AlcanceDescuentoDto = z.infer<typeof AlcanceDescuentoSchema>;

/**
 * Por qué se aplica un descuento manual. Lista cerrada (§7.5): un campo libre acaba siendo «varios»
 * y el reporte de excepciones deja de servir. «Otro» exige explicarlo.
 */
export const MotivoDescuentoSchema = z.enum(["CLIENTE_FRECUENTE", "COMPENSACION", "PROMOCION", "OTRO"], {
  error: "Elige el motivo del descuento",
});
export type MotivoDescuento = z.infer<typeof MotivoDescuentoSchema>;

const Firma = z.object({ at: TimestampSchema, por: z.string().trim().min(2).max(80) });
const Nombre = z.string().trim().min(2, "Nombre demasiado corto").max(40, "Nombre demasiado largo");

/** Una regla de Ajustes → Descuentos, como la lee una pantalla. */
export const ReglaDescuentoSchema = z
  .object({
    id: IdSchema,
    nombre: Nombre,
    tipo: TipoReglaDescuentoSchema,
    valor: ValorDescuentoSchema,
    alcance: AlcanceDescuentoSchema,
    /** El medio de un descuento por medio de pago; `null` en los demás. */
    medio: CodigoMedioSchema.nullable(),
    desde: FechaSchema,
    hasta: FechaSchema.nullable(),
    creada: Firma,
    retirada: Firma.nullable(),
    /** Cuántas familias lleva marcadas una regla VIP (cero en las demás). */
    familias: z.number().int().min(0),
  })
  .superRefine((r, ctx) => {
    if ((r.tipo === "MEDIO") !== (r.medio !== null)) {
      ctx.addIssue({ code: "custom", path: ["medio"], message: "Solo el descuento por medio de pago dice su medio" });
    }
    if (r.hasta !== null && r.hasta < r.desde) ctx.addIssue({ code: "custom", path: ["hasta"], message: "Termina antes de empezar" });
  });
export type ReglaDescuentoDto = z.infer<typeof ReglaDescuentoSchema>;

/** Crear una regla. Quién y cuándo los pone el servidor; la vigencia, en días del local. */
export const CrearReglaDescuentoCommandSchema = z
  .strictObject({
    nombre: Nombre,
    tipo: TipoReglaDescuentoSchema,
    valor: ValorDescuentoSchema,
    alcance: AlcanceDescuentoSchema,
    medio: CodigoMedioSchema.optional(),
    desde: FechaSchema,
    hasta: FechaSchema.optional(),
  })
  .refine((c) => c.tipo !== "MEDIO" || c.medio !== undefined, { message: "Elige el medio de pago", path: ["medio"] })
  .refine((c) => c.tipo === "MEDIO" || c.medio === undefined, { message: "Solo el descuento por medio de pago lleva medio", path: ["medio"] })
  .refine((c) => c.hasta === undefined || c.hasta >= c.desde, { message: "Termina antes de empezar", path: ["hasta"] });
export type CrearReglaDescuentoCommand = z.infer<typeof CrearReglaDescuentoCommandSchema>;

export const RetirarReglaDescuentoCommandSchema = z.strictObject({ reglaId: z.uuid("Regla desconocida") });
export type RetirarReglaDescuentoCommand = z.infer<typeof RetirarReglaDescuentoCommandSchema>;

/** Marcar a una familia VIP con una regla VIP, o quitarle la marca (`null`). */
export const MarcarVipCommandSchema = z.strictObject({
  guardianId: z.uuid("Familia desconocida"),
  reglaId: z.uuid("Regla desconocida").nullable(),
});
export type MarcarVipCommand = z.infer<typeof MarcarVipCommandSchema>;

/** Los descuentos del local: sus reglas (las retiradas también) y el tope de supervisión. */
export const DescuentosDelLocalSchema = z.object({
  reglas: z.array(ReglaDescuentoSchema),
  /** Hasta cuánto de la cuenta autoriza supervisión en un manual, en puntos básicos (2000 = 20 %). */
  topeSupervision: z.number().int().min(0).max(10_000),
});
export type DescuentosDelLocalDto = z.infer<typeof DescuentosDelLocalSchema>;

/* ─────────────────────────────────────────────────────── en la cuenta */

/** Quién autorizó un descuento, con su rol: uno autorizado por quien no puede no es un descuento. */
const AutorizadoPorSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(2).max(80),
  role: z.enum(["ADMIN", "SUPERVISOR"]),
});

/**
 * El descuento que lleva una cuenta, como lo dejó su mando en el servidor. Copia de la regla lo que
 * decide el importe (si mañana la regla se retira, la cuenta sigue diciendo qué se aplicó).
 */
export const DescuentoAplicadoSchema = z
  .object({
    origen: OrigenDescuentoSchema,
    reglaId: IdSchema.nullable(),
    nombre: z.string().trim().min(2).max(60),
    valor: ValorDescuentoSchema,
    alcance: AlcanceDescuentoSchema,
    medio: CodigoMedioSchema.nullable(),
    motivo: MotivoDescuentoSchema.nullable(),
    detalle: z.string().trim().max(280).nullable(),
    /** `null` solo en el VIP: lo ampara la marca de la familia, que puso administración. */
    autorizadoPor: AutorizadoPorSchema.nullable(),
    en: TimestampSchema,
  })
  .superRefine((d, ctx) => {
    if ((d.origen === "ADMIN") !== (d.reglaId === null)) {
      ctx.addIssue({ code: "custom", path: ["reglaId"], message: "Solo el de administración no sale de una regla" });
    }
    if ((d.origen === "MEDIO") !== (d.medio !== null)) ctx.addIssue({ code: "custom", path: ["medio"], message: "El de medio dice su medio" });
    if (d.origen !== "VIP" && d.autorizadoPor === null) ctx.addIssue({ code: "custom", path: ["autorizadoPor"], message: "Falta quién lo autorizó" });
    if (d.origen === "ADMIN" && (d.autorizadoPor?.role !== "ADMIN" || (d.detalle?.length ?? 0) < 5)) {
      ctx.addIssue({ code: "custom", path: ["detalle"], message: "El de administración lo autoriza administración, con su motivo escrito" });
    }
    if (d.origen === "MANUAL" && d.motivo === null) ctx.addIssue({ code: "custom", path: ["motivo"], message: "El manual lleva su motivo" });
    if (d.motivo === "OTRO" && (d.detalle?.length ?? 0) < 3) ctx.addIssue({ code: "custom", path: ["detalle"], message: "Con «Otro» hay que explicarlo" });
  });
export type DescuentoAplicadoDto = z.infer<typeof DescuentoAplicadoSchema>;

/**
 * Poner un descuento a una cuenta (o quitárselo, con `quitar`). Con una regla, su `reglaId`; el de
 * administración trae su valor (sobre toda la cuenta) y su motivo escrito en `detalle`. La 🔐 viaja
 * aparte, como en la cortesía.
 */
export const AplicarDescuentoCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    version: z.number().int().positive(),
    quitar: z.boolean(),
    origen: OrigenDescuentoSchema.optional(),
    reglaId: z.uuid("Regla desconocida").optional(),
    valor: ValorDescuentoSchema.optional(),
    motivo: MotivoDescuentoSchema.optional(),
    detalle: z.string().trim().max(280).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.quitar) return;
    if (!c.origen) {
      ctx.addIssue({ code: "custom", path: ["origen"], message: "Elige el descuento" });
      return;
    }
    if (c.origen === "ADMIN") {
      if (!c.valor) ctx.addIssue({ code: "custom", path: ["valor"], message: "Escribe cuánto se descuenta" });
      if (c.reglaId) ctx.addIssue({ code: "custom", path: ["reglaId"], message: "El de administración no sale de una regla" });
      if ((c.detalle?.length ?? 0) < 5) ctx.addIssue({ code: "custom", path: ["detalle"], message: "Escribe el motivo" });
    } else {
      if (!c.reglaId) ctx.addIssue({ code: "custom", path: ["reglaId"], message: "Elige el descuento" });
      if (c.valor) ctx.addIssue({ code: "custom", path: ["valor"], message: "El valor lo dice la regla" });
    }
    if (c.origen === "MANUAL" && !c.motivo) ctx.addIssue({ code: "custom", path: ["motivo"], message: "Elige el motivo del descuento" });
    if (c.motivo === "OTRO" && (c.detalle?.length ?? 0) < 3) ctx.addIssue({ code: "custom", path: ["detalle"], message: "Con «Otro» hay que explicarlo" });
  });
export type AplicarDescuentoCommand = z.infer<typeof AplicarDescuentoCommandSchema>;

/** Qué hace falta para aplicarlo: nada (VIP), la 🔐 de supervisión o administración, o la de administración. */
export const RequiereDescuentoSchema = z.enum(["NADA", "AUTORIZACION", "ADMINISTRACION"]);
export type RequiereDescuento = z.infer<typeof RequiereDescuentoSchema>;

/** Lo que la caja puede ofrecerle a una cuenta, el mayor primero, con lo que descuenta en ella. */
export const DescuentosDeCuentaSchema = z.object({
  accountId: IdSchema,
  version: z.number().int().positive(),
  /** Lo que suma lo que se cobra, antes del IVA: la base del tope. */
  subtotal: MoneySchema,
  topeSupervision: z.number().int().min(0).max(10_000),
  /** La regla VIP de la familia de la cuenta, si la marcaron (aunque hoy no rija). */
  vip: z.object({ reglaId: IdSchema, nombre: z.string() }).nullable(),
  candidatos: z.array(z.object({ regla: ReglaDescuentoSchema, importe: MoneySchema, requiere: RequiereDescuentoSchema })),
});
export type DescuentosDeCuentaDto = z.infer<typeof DescuentosDeCuentaSchema>;

/** El descuento de una venta: lo que se aplicó, quién lo autorizó y cuánto descontó antes del IVA. */
export const DescuentoDeVentaSchema = z.object({
  origen: OrigenDescuentoSchema,
  nombre: z.string().max(60),
  valor: ValorDescuentoSchema,
  alcance: AlcanceDescuentoSchema,
  motivo: MotivoDescuentoSchema.nullable(),
  detalle: z.string().max(280).nullable(),
  autorizadoPor: z.object({ name: z.string().max(80), role: z.enum(["ADMIN", "SUPERVISOR"]) }).nullable(),
  importe: MoneySchema,
});
export type DescuentoDeVentaDto = z.infer<typeof DescuentoDeVentaSchema>;
