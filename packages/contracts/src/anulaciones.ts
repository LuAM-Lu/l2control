/**
 * Pedir una anulación — B3-30 (M-40).
 *
 * Sin administración en el local, la caja pide anular un cobro con su motivo y lo que se hará con la cuenta (B3-18:
 * cobrarla de nuevo o anular la venta entera); la venta queda «Anulación pedida» y la caja sigue. Administración la aprueba
 * con su PIN, o la rechaza con su motivo, desde Inicio, también en su teléfono. Aprobada, la caja la hace sin PIN: el
 * dinero se devuelve donde está, en la gaveta o en el punto. La Z no se hace con un pedido sin resolver. `cobro.anular`
 * sigue siendo de administración (D-AUT): su aprobación es la autorización.
 */
import { z } from "zod";
import { DestinoDevueltoSchema, MotivoAnulacionSchema } from "./ventas.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

const CaminoSchema = z.enum(["COBRAR_DE_NUEVO", "ANULAR_VENTA"]);

/** La caja pide anular un cobro (su venta). Un reintento con la misma clave devuelve el mismo pedido. */
export const PedirAnulacionCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    accountId: z.uuid("Cuenta desconocida"),
    cobroKey: IdempotencyKeySchema,
    motivo: MotivoAnulacionSchema,
    detalle: z.string().trim().max(280).optional(),
    camino: CaminoSchema.default("COBRAR_DE_NUEVO"),
    inventario: DestinoDevueltoSchema.default("ESTANTE"),
  })
  .refine((c) => c.motivo !== "OTRO" || (c.detalle?.length ?? 0) >= 3, { message: "«Otro» exige explicarlo", path: ["detalle"] });
export type PedirAnulacionCommand = z.infer<typeof PedirAnulacionCommandSchema>;

/** Administración responde: aprueba (con su PIN, que va aparte) o rechaza con su motivo. */
export const ResponderAnulacionCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    pedidoId: IdSchema,
    respuesta: z.enum(["APROBAR", "RECHAZAR"]),
    motivo: z.string().trim().max(280).optional(),
  })
  .refine((c) => c.respuesta !== "RECHAZAR" || (c.motivo?.length ?? 0) >= 3, { message: "Di por qué no", path: ["motivo"] });
export type ResponderAnulacionCommand = z.infer<typeof ResponderAnulacionCommandSchema>;

/** PEDIDA: espera a administración. APROBADA: la caja la hace. HECHA: la venta está anulada. RECHAZADA: con su motivo. */
export const EstadoDeAnulacionPedidaSchema = z.enum(["PEDIDA", "APROBADA", "RECHAZADA", "HECHA"]);
export type EstadoDeAnulacionPedida = z.infer<typeof EstadoDeAnulacionPedidaSchema>;

export const AnulacionPedidaSchema = z.object({
  id: IdSchema,
  ventaId: IdSchema,
  cobroKey: IdSchema,
  accountId: IdSchema,
  turnoId: IdSchema,
  /** La venta, como la reconoce quien responde: su orden, de quién, cuánto y cuándo se cobró. */
  orden: z.number().int().positive(),
  cuenta: z.string(),
  total: MoneySchema,
  cobradaEl: TimestampSchema,
  cobradaPor: z.string(),
  motivo: MotivoAnulacionSchema,
  detalle: z.string().nullable(),
  camino: CaminoSchema,
  inventario: DestinoDevueltoSchema,
  pedidaPor: z.string(),
  pedidaEl: TimestampSchema,
  estado: EstadoDeAnulacionPedidaSchema,
  respuesta: z.object({ por: z.string(), el: TimestampSchema, motivo: z.string().nullable() }).nullable(),
});
export type AnulacionPedidaDto = z.infer<typeof AnulacionPedidaSchema>;

export const AnulacionesPedidasSchema = z.object({ pedidas: z.array(AnulacionPedidaSchema) });
export type AnulacionesPedidasDto = z.infer<typeof AnulacionesPedidasSchema>;

/** La aprobación como autorización de la anulación (`cuentas.anular`): la caja la hace sin PIN. */
export const AprobacionDeAnulacionSchema = z.strictObject({ aprobacion: IdSchema });
export type AprobacionDeAnulacionDto = z.infer<typeof AprobacionDeAnulacionSchema>;
