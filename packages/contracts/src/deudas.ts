/**
 * Las deudas de clientes — B3-11, M-33.
 *
 * Quien se sienta (o deja una venta pendiente) y se va sin pagar deja una deuda a su nombre: la cuenta pasa a
 * incobrable —sale de la cola y del cierre y libera la mesa— y la deuda guarda al cliente (nombre, cédula y teléfono),
 * lo que debe en dólares, quién lo sentó, quién la marcó y quién lo autorizó con su PIN. Cuando vuelve, la caja la cobra
 * con la tasa del día en una cuenta del mostrador con lo que consumió; administración puede darla por perdida.
 */
import { z } from "zod";
import { ClienteDeCuentaSchema, DatosDelClienteSchema } from "./clientes.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** «Se fue sin pagar»: la cuenta queda en deuda a nombre de su cliente. */
export const MarcarDeudaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
  /** La versión que se veía: si otra tablet pidió algo mientras tanto, choca. */
  version: z.number().int().positive(),
  detalle: z.string().trim().max(200, "Hasta 200 caracteres").optional(),
  /** Una cuenta sin cliente (de antes de B6-9, o una venta sin datos) queda en deuda si se le ponen ahora. */
  cliente: DatosDelClienteSchema.optional(),
});
export type MarcarDeudaCommand = z.infer<typeof MarcarDeudaCommandSchema>;

/** Cobrar una deuda cuando el cliente vuelve: abre (o devuelve) la cuenta del mostrador con lo que consumió. */
export const CobrarDeudaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  deudaId: z.uuid("Deuda desconocida"),
});
export type CobrarDeudaCommand = z.infer<typeof CobrarDeudaCommandSchema>;

/** Devolverla a las deudas: el cliente vino pero no pagó; su cuenta de cobro sale de la caja y la deuda sigue pendiente. */
export const DevolverDeudaCommandSchema = CobrarDeudaCommandSchema;
export type DevolverDeudaCommand = CobrarDeudaCommand;

/** Darla por perdida: administración, con su PIN y un motivo. */
export const PerderDeudaCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  deudaId: z.uuid("Deuda desconocida"),
  motivo: z.string().trim().min(3, "Escribe el motivo").max(280),
});
export type PerderDeudaCommand = z.infer<typeof PerderDeudaCommandSchema>;

export const EstadoDeudaSchema = z.enum(["PENDIENTE", "COBRADA", "PERDIDA"]);
export type EstadoDeuda = z.infer<typeof EstadoDeudaSchema>;

/** Una deuda como la lee la caja: de quién, de dónde, cuánto, quién intervino y cómo va. */
export const DeudaSchema = z.object({
  id: IdSchema,
  cuentaId: IdSchema,
  /** El número de orden de la cuenta en que se consumió. */
  orden: z.number().int().positive(),
  /** Dónde se consumió: «Mesa 2», «De pie» o «Mostrador». */
  lugar: z.string(),
  cliente: ClienteDeCuentaSchema,
  monto: MoneySchema,
  /** Quién sentó al cliente (o dejó pendiente la venta): a quién se le atribuye. */
  sentadoPor: z.string(),
  marcadaEl: TimestampSchema,
  marcadaPor: z.string(),
  autorizadaPor: z.string().nullable(),
  detalle: z.string().nullable(),
  estado: EstadoDeudaSchema,
  /** Cómo terminó, si terminó. */
  desenlace: z
    .object({
      el: TimestampSchema,
      por: z.string(),
      autorizadoPor: z.string().nullable(),
      motivo: z.string().nullable(),
      /** La cuenta con que se cobró. */
      cuentaCobro: IdSchema.nullable(),
    })
    .nullable(),
  /** La cuenta del mostrador abierta para cobrarla, si hay una en la caja. */
  enCobro: IdSchema.nullable(),
});
export type DeudaDto = z.infer<typeof DeudaSchema>;

export const DeudasSchema = z.object({ deudas: z.array(DeudaSchema) });
export type DeudasDto = z.infer<typeof DeudasSchema>;

/** Lo que se avisa al encontrar a un cliente que debe: cuánto, de cuándo y de qué orden. */
export const AvisoDeDeudaSchema = z.object({
  id: IdSchema,
  orden: z.number().int().positive(),
  lugar: z.string(),
  monto: MoneySchema,
  marcadaEl: TimestampSchema,
});
export type AvisoDeDeudaDto = z.infer<typeof AvisoDeDeudaSchema>;
