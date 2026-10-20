/**
 * El cliente de una cuenta — B6-9, M-33.
 *
 * Quien abre una cuenta en el salón (una mesa o de pie) consume primero y paga al final: si se va sin pagar, hay que
 * saber a quién cobrarle. Por eso sentar a alguien pide **nombre, cédula y teléfono**, y el servidor no abre la cuenta
 * sin ellos. Desde B6-22 (M-40) administración lo elige en Ajustes → Sucursal: con «Más rápido» basta el nombre (la
 * cédula, antes del segundo pedido y antes de cobrar) y el teléfono puede pedirse solo cuando queda una deuda. En el
 * mostrador se cobra al momento («Consumidor final», DEC-23): solo una venta que se deja pendiente pide los tres datos.
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

/** Un dato que no se dio: el campo vacío es lo mismo que no mandarlo. */
const opcional = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : sinSeparadores(v));

/**
 * El cliente al sentarlo o al completarlo (B6-22): el nombre siempre; la cédula y el teléfono, si se dieron. Qué hace
 * falta lo dice el servidor con los ajustes de la sucursal (`sentar`, `telefonoDelCliente`), no la tablet.
 */
export const DatosParcialesDelClienteSchema = z.strictObject({
  nombre: DatosDelClienteSchema.shape.nombre,
  cedula: z.preprocess(opcional, DocumentoVeSchema.optional()),
  telefono: z.preprocess(opcional, TelefonoVeSchema.optional()),
});
export type DatosParcialesDelClienteDto = z.infer<typeof DatosParcialesDelClienteSchema>;

/**
 * El cliente de una cuenta como lo lee la pantalla: lo que se dio, ya escrito como se escribe («V-12345678»,
 * «0414-1234567»), y el cliente del directorio si se reconoció. Sin cédula (sentado «Más rápido», B6-22) o sin teléfono
 * («Solo si queda una deuda»), `null`.
 */
export const ClienteDeCuentaSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  cedula: z.string().trim().min(6).max(20).nullable(),
  telefono: z.string().trim().min(11).max(20).nullable(),
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
 * Poner el cliente de una cuenta abierta (una venta del mostrador que se deja pendiente), completarlo (la cédula de
 * quien se sentó «Más rápido», B6-22) o cambiarlo (un dato mal escrito). Ponerlo y completarlo lo hace quien atiende;
 * cambiarlo, con la autorización de supervisión. La cédula se exige siempre; el teléfono, según la sucursal (y siempre
 * en una venta que queda pendiente).
 */
export const AsignarClienteCommandSchema = z.strictObject({
  idempotencyKey: IdempotencyKeySchema,
  accountId: z.uuid("Cuenta desconocida"),
  cliente: DatosParcialesDelClienteSchema,
});
export type AsignarClienteCommand = z.infer<typeof AsignarClienteCommandSchema>;

/* ───────────────────────────────────────────── Clientes (T-25, M-40): el directorio de todos */

/**
 * Los filtros de Clientes: todos; las familias del parque (con niños); los de mesa (alguna cuenta del salón o una venta
 * que quedó pendiente a su nombre); los que deben (B3-11); los VIP (B3-6).
 */
export const FiltroDeClientesSchema = z.enum(["TODOS", "FAMILIAS", "DE_MESA", "CON_DEUDA", "VIP"]);
export type FiltroDeClientes = z.infer<typeof FiltroDeClientesSchema>;

/** Una página de Clientes: lo buscado (nombre, cédula, teléfono o un niño, como el campo de T-24) y el filtro, de a 50. */
export const PaginaDeClientesQuerySchema = z.strictObject({
  texto: z.string().trim().max(80).default(""),
  filtro: FiltroDeClientesSchema.default("TODOS"),
  desde: z.number().int().min(0).max(1_000_000).default(0),
  cuantos: z.number().int().min(1).max(100).default(50),
});
export type PaginaDeClientesQuery = z.input<typeof PaginaDeClientesQuerySchema>;

/** Dónde vino: el parque, una mesa, de pie, una venta del mostrador a su nombre o un cumpleaños. */
export const DondeVinoSchema = z.enum(["PARQUE", "MESA", "DE_PIE", "MOSTRADOR", "CUMPLEANOS"]);
export type DondeVino = z.infer<typeof DondeVinoSchema>;

/** Un cliente en la lista: lo justo para reconocerlo sin abrir su ficha. */
export const ClienteDelDirectorioSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  cedula: z.string().nullable(),
  telefono: z.string(),
  /** Sus niños (los que no se retiraron). */
  ninos: z.number().int().min(0),
  ultimaVez: z.object({ en: TimestampSchema, donde: DondeVinoSchema }).nullable(),
  /** Lo que debe (B3-11), si debe algo. */
  debe: MoneySchema.nullable(),
  /** El nombre de su regla VIP (B3-6), si la tiene. */
  vip: z.string().nullable(),
});
export type ClienteDelDirectorioDto = z.infer<typeof ClienteDelDirectorioSchema>;

export const PaginaDeClientesSchema = z.object({
  clientes: z.array(ClienteDelDirectorioSchema),
  /** Cuántos hay con lo buscado y el filtro. */
  total: z.number().int().min(0),
  /** Cuántos hay en cada filtro, sin lo buscado: lo que dicen los chips. */
  porFiltro: z.object({ TODOS: z.number().int(), FAMILIAS: z.number().int(), DE_MESA: z.number().int(), CON_DEUDA: z.number().int(), VIP: z.number().int() }),
});
export type PaginaDeClientesDto = z.infer<typeof PaginaDeClientesSchema>;

/** Algo que hizo en el local, para «Lo que hizo en el local»: lo más reciente primero. */
export const MovimientoDelClienteSchema = z.object({
  en: TimestampSchema,
  que: z.enum(["PARQUE", "MESA", "DE_PIE", "MOSTRADOR", "CUMPLEANOS", "DEUDA"]),
  /** «Sofía y Mateo · 2 horas», «#0230 · 3 personas», «Cumpleaños de Sofía · 15 invitados», «Se fue sin pagar». */
  detalle: z.string().max(120),
  /** Lo que se cobró o lo que dejó a deber; sin cobrar todavía, `null`. */
  monto: MoneySchema.nullable(),
});
export type MovimientoDelClienteDto = z.infer<typeof MovimientoDelClienteSchema>;

/**
 * La ficha de un cliente (T-25): sus datos, sus cifras, sus niños, lo que hizo en el local y quién se le parece. Lo de
 * los registros que se juntaron con él cuenta como suyo.
 */
export const FichaDelClienteSchema = z.object({
  id: IdSchema,
  nombre: z.string(),
  cedula: z.string().nullable(),
  telefono: z.string(),
  /** Desde cuándo está en el directorio. */
  desde: TimestampSchema,
  /** Los días que vino (al parque, al salón o a un cumpleaños). */
  visitas: z.number().int().min(0),
  /** Lo cobrado de sus cuentas, sin lo anulado. */
  gastado: MoneySchema,
  /** Lo que debe (B3-11). */
  debe: MoneySchema,
  vip: z.object({ reglaId: IdSchema, nombre: z.string() }).nullable(),
  ninos: z.array(
    z.object({
      id: IdSchema,
      nombre: z.string(),
      apodo: z.string().nullable(),
      visitas: z.number().int().min(0),
      /** Retirado de la familia: sus estancias lo siguen nombrando; la entrada ya no lo ofrece. */
      retirado: z.object({ en: TimestampSchema, por: z.string() }).nullable(),
    }),
  ),
  historia: z.array(MovimientoDelClienteSchema).max(40),
  /** Otros del directorio con el mismo nombre: quizás la misma persona, que quedó dos veces. */
  parecidos: z.array(
    z.object({ id: IdSchema, nombre: z.string(), cedula: z.string().nullable(), telefono: z.string(), ultimaVez: TimestampSchema.nullable() }),
  ),
  /** Los registros que se juntaron con este (T-25). */
  juntados: z.array(z.object({ nombre: z.string(), en: TimestampSchema, por: z.string() })),
});
export type FichaDelClienteDto = z.infer<typeof FichaDelClienteSchema>;

/**
 * Corregir los datos de un cliente (T-25): su nombre, su teléfono (el directorio lo necesita: el parque llama al
 * representante) y su cédula. La cédula se anota o se corrige; no se quita.
 */
export const CorregirClienteCommandSchema = z.strictObject({
  clienteId: IdSchema,
  nombre: DatosDelClienteSchema.shape.nombre,
  cedula: z.preprocess(opcional, DocumentoVeSchema.optional()),
  telefono: z.preprocess(sinSeparadores, TelefonoVeSchema),
});
export type CorregirClienteCommand = z.infer<typeof CorregirClienteCommandSchema>;

const nombreDelNino = z.string().trim().min(2, "Nombre demasiado corto").max(60, "Un nombre de hasta 60 caracteres");
const apodoDelNino = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(30).optional());

/** Los niños de un cliente (T-25): agregar uno, corregirlo o retirarlo (un error, o ya no viene; no se borra). */
export const NinoDelClienteCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("AGREGAR"), clienteId: IdSchema, nombre: nombreDelNino, apodo: apodoDelNino }),
  z.strictObject({ kind: z.literal("CORREGIR"), clienteId: IdSchema, ninoId: IdSchema, nombre: nombreDelNino, apodo: apodoDelNino }),
  z.strictObject({ kind: z.literal("RETIRAR"), clienteId: IdSchema, ninoId: IdSchema }),
]);
export type NinoDelClienteCommand = z.infer<typeof NinoDelClienteCommandSchema>;

/**
 * Juntar a la misma persona que quedó dos veces (T-25): la que se va pasa a la que queda (sus niños, su historia, lo que
 * debe) y buscarla por su cédula o su teléfono lleva a la que queda. No se deshace; con dos cédulas distintas no son la
 * misma persona.
 */
export const JuntarClientesCommandSchema = z
  .strictObject({ quedaId: IdSchema, seVaId: IdSchema })
  .refine((c) => c.quedaId !== c.seVaId, { message: "Elige otro cliente", path: ["seVaId"] });
export type JuntarClientesCommand = z.infer<typeof JuntarClientesCommandSchema>;
