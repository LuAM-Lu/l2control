/**
 * Cumpleaños: los paquetes y las reservas — B10-1, V-10, D-EVT.
 *
 * Administración carga los **paquetes de cumpleaños** (Ajustes → Cumpleaños): un precio por el alquiler,
 * lo que incluye (productos del catálogo, con su cantidad) y el mínimo y el máximo de invitados. Junto a
 * ellos va el **anticipo**, un porcentaje del precio del paquete (el 50 % por defecto). Se publican
 * juntos como una versión, igual que el tarifario o el plano.
 *
 * Una **reserva** fija el día, el horario, la familia, el cumpleañero, los invitados y el paquete, que
 * se COPIA: publicar otro catálogo no cambia lo que se le dijo al cliente. Al reservar nace la **cuenta
 * del evento** con el anticipo, que la caja cobra como cualquier cuenta (con su venta y en su turno). El
 * saldo queda para el día del evento (B10-2).
 */
import { z } from "zod";
import { GuardianSchema } from "./park.ts";
import { AccountStatusSchema } from "./account.ts";
import { FechaSchema, IdempotencyKeySchema, IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/* ─────────────────────────────────────────────────────────── el catálogo */

/** Un producto del catálogo que el paquete incluye, con su nombre copiado al publicar. */
export const IncluidoEnPaqueteSchema = z.object({
  productId: z.uuid("Producto desconocido"),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().int().min(1, "Al menos uno").max(999, "Hasta 999"),
});
export type IncluidoEnPaqueteDto = z.infer<typeof IncluidoEnPaqueteSchema>;

/** El tope de invitados de cualquier paquete; el de verdad es el aforo, que comprueba el servidor. */
const MAX_INVITADOS = 200;

export const PaqueteEventoSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(2, "Nombre demasiado corto").max(40, "Hasta 40 caracteres"),
  /** El precio del paquete entero, sin IVA, en dólares. */
  price: MoneySchema,
  minInvitados: z.number().int().min(1, "Al menos un invitado").max(MAX_INVITADOS),
  maxInvitados: z.number().int().min(1, "Al menos un invitado").max(MAX_INVITADOS),
  incluye: z.array(IncluidoEnPaqueteSchema).max(30, "Hasta 30 productos por paquete"),
  /** Un paquete se retira, no se borra (regla 5): las reservas de ayer lo nombran. */
  active: z.boolean(),
});
export type PaqueteEventoDto = z.infer<typeof PaqueteEventoSchema>;

/** Un nombre como lo lee una persona: sin mayúsculas, acentos ni espacios de más. */
const clave = (n: string) => n.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ");

/** El anticipo por defecto (D-EVT): la mitad del paquete. */
export const ANTICIPO_POR_DEFECTO_BPS = 5000;

export const CatalogoEventosSchema = z
  .object({
    /** El anticipo, en puntos básicos del precio del paquete: 5000 es el 50 %. */
    anticipoBps: z.number().int().min(1, "El anticipo es más de cero").max(10_000, "El anticipo no pasa del 100 %"),
    paquetes: z.array(PaqueteEventoSchema).max(30, "Hasta 30 paquetes"),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    const nombres = new Set<string>();
    c.paquetes.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["paquetes", i, "id"], message: "Dos paquetes con el mismo id" });
      ids.add(p.id);
      // Un paquete a precio cero sería un regalo, y eso tiene su camino con autorización (F6-14).
      if (BigInt(p.price.minor) <= 0n) {
        ctx.addIssue({ code: "custom", path: ["paquetes", i, "price"], message: `«${p.name}» necesita un precio mayor que cero` });
      }
      if (p.price.currency !== "USD") {
        ctx.addIssue({ code: "custom", path: ["paquetes", i, "price"], message: `«${p.name}» se cobra en dólares` });
      }
      if (p.minInvitados > p.maxInvitados) {
        ctx.addIssue({ code: "custom", path: ["paquetes", i, "minInvitados"], message: "El mínimo no puede pasar del máximo" });
      }
      const productos = new Set<string>();
      p.incluye.forEach((x, j) => {
        if (productos.has(x.productId)) {
          ctx.addIssue({ code: "custom", path: ["paquetes", i, "incluye", j, "productId"], message: `«${x.name}» está dos veces: súmalo en una línea` });
        }
        productos.add(x.productId);
      });
      if (!p.active) return;
      if (nombres.has(clave(p.name))) {
        ctx.addIssue({ code: "custom", path: ["paquetes", i, "name"], message: `Ya hay un paquete «${p.name}» a la venta` });
      }
      nombres.add(clave(p.name));
    });
  });
export type CatalogoEventosDto = z.infer<typeof CatalogoEventosSchema>;

/** El catálogo vigente: `catalogo: null` si nunca se publicó (no hay paquetes y no se reserva). */
export const CatalogoEventosPublicadoSchema = z.object({
  catalogo: CatalogoEventosSchema.nullable(),
  version: z.number().int().min(1).nullable(),
  publicadoEn: TimestampSchema.nullable(),
  publicadoPor: z.string().nullable(),
  /** El aforo del tarifario vigente: ningún paquete admite más invitados (D-EVT). */
  aforo: z.number().int().positive().nullable(),
});
export type CatalogoEventosPublicadoDto = z.infer<typeof CatalogoEventosPublicadoSchema>;

/**
 * Publicar el catálogo. Lo que incluye cada paquete se manda como producto y cantidad: el nombre lo
 * copia el servidor del catálogo de productos, no lo dice la pantalla. `sobre` es la versión que se
 * editó (`null` si no había ninguna): si otra persona publicó entre medias, choca.
 */
export const PublicarCatalogoEventosCommandSchema = z.strictObject({
  sobre: z.number().int().min(1).nullable(),
  catalogo: z.object({
    anticipoBps: z.number().int().min(1).max(10_000),
    paquetes: z.array(
      PaqueteEventoSchema.extend({
        incluye: z.array(IncluidoEnPaqueteSchema.omit({ name: true })).max(30, "Hasta 30 productos por paquete"),
      }),
    ),
  }),
});
export type PublicarCatalogoEventosCommand = z.infer<typeof PublicarCatalogoEventosCommandSchema>;

/* ─────────────────────────────────────────────────────────── la reserva */

/** Una hora del día en minutos desde la medianoche, en la hora del local: 900 son las 3:00 pm. */
export const MinutoDelDiaSchema = z.number().int().min(0, "Hora no válida").max(24 * 60, "Hora no válida");

export const ReservarEventoCommandSchema = z
  .strictObject({
    /** Un doble clic no reserva dos veces (I-11). */
    idempotencyKey: IdempotencyKeySchema,
    fecha: FechaSchema,
    inicio: MinutoDelDiaSchema,
    fin: MinutoDelDiaSchema,
    paqueteId: IdSchema,
    invitados: z.number().int().min(1, "Al menos un invitado").max(MAX_INVITADOS),
    /** Quién cumple años: es como se nombra el evento en la agenda y en la caja. */
    cumpleanero: z.string().trim().min(2, "Nombre demasiado corto").max(60, "Hasta 60 caracteres"),
    /** Los años que cumple, si se sabe (la torta y las velas). */
    edad: z.number().int().min(1, "Edad no válida").max(18, "Edad no válida").optional(),
    /** La familia: una del directorio o una nueva, como en la entrada. */
    guardianId: IdSchema.optional(),
    guardian: GuardianSchema.optional(),
  })
  .refine((v) => Boolean(v.guardianId) !== Boolean(v.guardian), {
    message: "Indica un representante existente o crea uno nuevo, no ambos",
    path: ["guardian"],
  })
  .refine((v) => v.inicio < v.fin, { message: "El evento termina después de empezar", path: ["fin"] });
export type ReservarEventoCommand = z.infer<typeof ReservarEventoCommandSchema>;

/**
 * En qué va una reserva. Sale de su cuenta, no de una columna que alguien tenga que mantener:
 *  · ANTICIPO_POR_COBRAR — la cuenta del evento está en la cola de la caja;
 *  · CONFIRMADA          — el anticipo está cobrado;
 *  · CANCELADA           — se canceló antes de cobrar el anticipo (o después de anular su cobro).
 */
export const EstadoReservaSchema = z.enum(["ANTICIPO_POR_COBRAR", "CONFIRMADA", "CANCELADA"]);
export type EstadoReserva = z.infer<typeof EstadoReservaSchema>;

export const ReservaEventoSchema = z.object({
  id: IdSchema,
  fecha: FechaSchema,
  inicio: MinutoDelDiaSchema,
  fin: MinutoDelDiaSchema,
  invitados: z.number().int().min(1),
  cumpleanero: z.string(),
  edad: z.number().int().nullable(),
  representante: z.object({ id: IdSchema, fullName: z.string() }),
  /** El paquete como se reservó (copiado). */
  paquete: PaqueteEventoSchema.omit({ active: true }),
  anticipoBps: z.number().int().min(1).max(10_000),
  /** Bases sin IVA: anticipo + saldo = precio del paquete. */
  anticipo: MoneySchema,
  saldo: MoneySchema,
  estado: EstadoReservaSchema,
  /** La cuenta del anticipo: su número de orden es el que se dice en la caja. */
  cuenta: z.object({ id: IdSchema, orderNumber: z.number().int().positive(), status: AccountStatusSchema }),
  reservadaEn: TimestampSchema,
  reservadaPor: z.string(),
  /** Quién la canceló y cuándo, si se canceló. */
  cancelada: z.object({ en: TimestampSchema, por: z.string() }).nullable(),
});
export type ReservaEventoDto = z.infer<typeof ReservaEventoSchema>;

/** La agenda entre dos días (los dos incluidos), como mucho tres meses. */
export const AgendaEventosQuerySchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema })
  .refine((q) => q.desde <= q.hasta, { message: "El rango empieza antes de terminar", path: ["hasta"] })
  .refine((q) => Date.parse(q.hasta) - Date.parse(q.desde) <= 93 * 86_400_000, {
    message: "Como mucho tres meses de agenda a la vez",
    path: ["hasta"],
  });
export type AgendaEventosQuery = z.infer<typeof AgendaEventosQuerySchema>;

export const AgendaEventosSchema = z.object({
  /** El día de hoy en el calendario del local, para que la pantalla no use el del navegador. */
  hoy: FechaSchema,
  /** En orden de día y de hora. */
  reservas: z.array(ReservaEventoSchema),
});
export type AgendaEventosDto = z.infer<typeof AgendaEventosSchema>;

/** Cancelar una reserva cuyo anticipo no se ha cobrado: su cuenta se cierra sin consumo. */
export const CancelarReservaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  reservaId: IdSchema,
});
export type CancelarReservaCommand = z.infer<typeof CancelarReservaCommandSchema>;
