/**
 * El cliente de una cuenta — B6-9, M-33.
 *
 * Quien abre una cuenta en el salón (una mesa o de pie) consume primero y paga al final: si se va sin pagar, hay que
 * saber a quién cobrarle. Por eso sentar a alguien pide **nombre, cédula y teléfono**, los tres, y el servidor no abre
 * la cuenta sin ellos. En el mostrador se cobra al momento («Consumidor final», DEC-23): solo una venta que se deja
 * pendiente pide los mismos datos.
 *
 * El directorio de representantes (B4-1) es también el de los clientes: el que vuelve se reconoce por su cédula o su
 * teléfono y no se teclea dos veces. Todo el que atiende ve los datos completos (M-33); nunca salen en los registros,
 * la URL ni la captura de un reporte (PLAN §7.6).
 */
import { z } from "zod";
import { DocumentoVeSchema, TelefonoVeSchema } from "./pagos.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** La cédula y el teléfono como los escriba una persona: «v 12.345.678», «(0414) 123 45 67». */
const sinSeparadores = (v: unknown) => (typeof v === "string" ? v.replace(/[\s.()]/g, "").toUpperCase() : v);

/** Lo que se pide al sentar a alguien o al dejar pendiente una venta: los tres datos, obligatorios. */
export const DatosDelClienteSchema = z.strictObject({
  nombre: z.string().trim().min(2, "Escribe el nombre y el apellido").max(80, "Un nombre de hasta 80 caracteres"),
  /** Cédula (V-, E-) o RIF (J-, G-, P-). */
  cedula: z.preprocess(sinSeparadores, DocumentoVeSchema),
  telefono: z.preprocess(sinSeparadores, TelefonoVeSchema),
});
export type DatosDelClienteDto = z.infer<typeof DatosDelClienteSchema>;

/**
 * El cliente de una cuenta como lo lee la pantalla: lo que se dio, ya escrito como se escribe («V-12345678»,
 * «0414-1234567»), y el cliente del directorio si se reconoció.
 */
export const ClienteDeCuentaSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  cedula: z.string().trim().min(6).max(20),
  telefono: z.string().trim().min(11).max(20),
  clienteId: IdSchema.optional(),
});
export type ClienteDeCuentaDto = z.infer<typeof ClienteDeCuentaSchema>;

/** Buscar a un cliente que ya vino, por su cédula o su teléfono completos (no por pedazos: se escribe entero). */
export const BuscarClienteSchema = z
  .strictObject({
    cedula: z.string().trim().max(20).optional(),
    telefono: z.string().trim().max(20).optional(),
  })
  .refine((b) => (b.cedula ?? "") !== "" || (b.telefono ?? "") !== "", { message: "Escribe la cédula o el teléfono" });
export type BuscarClienteQuery = z.infer<typeof BuscarClienteSchema>;

/**
 * El cliente del directorio que se encontró. Un representante del parque puede no tener cédula todavía. `deudas`: lo
 * que dejó sin pagar (B3-11), para avisarlo al encontrarlo.
 */
export const ClienteEncontradoSchema = z.object({
  clienteId: IdSchema,
  nombre: z.string(),
  cedula: z.string().nullable(),
  telefono: z.string(),
  deudas: z
    .array(z.object({ id: IdSchema, orden: z.number().int().positive(), lugar: z.string(), monto: MoneySchema, marcadaEl: TimestampSchema }))
    .default([]),
});
export type ClienteEncontradoDto = z.infer<typeof ClienteEncontradoSchema>;

/**
 * Poner el cliente de una cuenta abierta (una venta del mostrador que se deja pendiente) o cambiarlo (un dato mal
 * escrito). Ponerlo lo hace quien atiende; cambiarlo, con la autorización de supervisión.
 */
export const AsignarClienteCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
  cliente: DatosDelClienteSchema,
});
export type AsignarClienteCommand = z.infer<typeof AsignarClienteCommandSchema>;
