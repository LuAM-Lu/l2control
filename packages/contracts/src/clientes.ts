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

/**
 * Buscar a un cliente que ya vino, por su cédula o su teléfono completos (no por pedazos: se escribe entero), o por su
 * ficha del directorio (T-23: el que se eligió de «aquí ahora» o de la lista).
 */
export const BuscarClienteSchema = z
  .strictObject({
    cedula: z.string().trim().max(20).optional(),
    telefono: z.string().trim().max(20).optional(),
    clienteId: IdSchema.optional(),
  })
  .refine((b) => (b.cedula ?? "") !== "" || (b.telefono ?? "") !== "" || b.clienteId !== undefined, { message: "Escribe la cédula o el teléfono" });
export type BuscarClienteQuery = z.infer<typeof BuscarClienteSchema>;

/**
 * El buscador de clientes (T-19, M-34): por su nombre, su cédula o su teléfono, como se escriba. Encuentra en el
 * directorio; lo abierto (sus cuentas, sus niños en la sala) lo pone cada pantalla con lo que ya tiene.
 */
export const EncontrarClienteSchema = z.strictObject({
  texto: z.string().trim().min(3, "Escribe al menos 3 letras o dígitos").max(80),
  /** Cuántos como mucho: 12 de fábrica (la lupa); el campo del cliente pide 6 (T-23). */
  limite: z.number().int().min(1).max(12).optional(),
});
export type EncontrarClienteQuery = z.infer<typeof EncontrarClienteSchema>;

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
  /** La última vez que vino (su última entrada al parque o su última cuenta), para reconocerlo en la lista (T-23). */
  vinoEl: TimestampSchema.nullable().default(null),
  /** Cuántos niños tiene en el directorio (T-23). */
  ninos: z.number().int().min(0).default(0),
});
export type ClienteEncontradoDto = z.infer<typeof ClienteEncontradoSchema>;

/**
 * Los clientes que están aquí ahora (T-23, M-38, W-12): los que el campo del cliente propone antes de escribir nada. Una
 * familia con niños en la sala (sus estancias, para llevar su tiempo a una mesa al sentarla), el cliente de una cuenta
 * abierta y el representante de un cumpleaños de hoy.
 */
export const ClienteDeAquiSchema = z.object({
  cliente: ClienteEncontradoSchema,
  /** HOY (T-24): vino hoy y ya se fue (salió del parque o pagó su cuenta); puede volver a la mesa o a la caja. */
  motivo: z.enum(["SALA", "CUENTA", "CUMPLEANOS", "HOY"]),
  /** «2 niños en la sala», «Mesa 4», «Cumpleaños de Sofía», «Salió del parque». */
  detalle: z.string().max(80),
  /** Cuándo (T-24): a qué hora salió o pagó, para los que vinieron hoy; la pantalla la dice en su formato. */
  en: TimestampSchema.nullable().default(null),
  /** Las estancias de sus niños en la sala (SALA): las que se llevan a la mesa al sentarla. */
  estancias: z.array(IdSchema).default([]),
});
export type ClienteDeAquiDto = z.infer<typeof ClienteDeAquiSchema>;
export const ClientesDeAquiSchema = z.object({ clientes: z.array(ClienteDeAquiSchema).max(24) });
export type ClientesDeAquiDto = z.infer<typeof ClientesDeAquiSchema>;

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
