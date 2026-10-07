/**
 * Contratos de las credenciales de administración y de la instalación inicial — ADR-020, M-12.
 *
 * La contraseña y el PIN viajan aquí en claro solo del navegador al servidor, en el cuerpo de la
 * petición: nunca vuelven, nunca se guardan (solo su Argon2id) y nunca salen en un log. Que una
 * contraseña sea aceptable lo decide `checkNewPassword` de `@l2/domain-identity`; aquí solo se
 * exige que sea un texto de tamaño razonable.
 *
 * Las respuestas de una llave de acceso (WebAuthn) no se describen campo por campo: su forma la
 * fija el navegador y su firma la comprueba el servidor entera. Aquí pasan como un objeto opaco.
 */
import { z } from "zod";
import { IdSchema, TimestampSchema } from "./primitives.ts";

const ContrasenaSchema = z.string().min(1, "Escribe una contraseña").max(400);
const RespuestaDeLlaveSchema = z.record(z.string(), z.unknown());
const DesafioIdSchema = z.uuid();
/** Dónde se registró la llave, para reconocerla en la lista: «Laptop de la oficina». */
const EtiquetaDeLlaveSchema = z.string().trim().min(2, "Ponle un nombre de al menos dos letras").max(60);

/* ------------------------------------------------------------ enlaces de alta */

/**
 * `ALTA` da contraseña, llave y códigos de recuperación (y retira lo que la persona tuviera: sirve
 * también para reponerlos). `LLAVE` añade otra llave a quien ya tiene contraseña.
 */
export const TipoDeEnlaceSchema = z.enum(["ALTA", "LLAVE"]);
export type TipoDeEnlace = z.infer<typeof TipoDeEnlaceSchema>;

export const EnlaceDeAltaCommandSchema = z.strictObject({ userId: IdSchema, kind: TipoDeEnlaceSchema });
export type EnlaceDeAltaCommand = z.infer<typeof EnlaceDeAltaCommandSchema>;

/** El enlace recién creado. `url` se enseña UNA vez (y como QR): la base solo guarda su huella. */
export const EnlaceDeAltaSchema = z.object({
  userId: IdSchema,
  nombre: z.string().min(1).max(120),
  kind: TipoDeEnlaceSchema,
  url: z.url(),
  caduca: TimestampSchema,
});
export type EnlaceDeAltaDto = z.infer<typeof EnlaceDeAltaSchema>;

export const LlaveDeAccesoSchema = z.object({
  id: IdSchema,
  etiqueta: z.string().min(1).max(60),
  creada: TimestampSchema,
  ultimoUso: TimestampSchema.nullable(),
});
export type LlaveDeAccesoDto = z.infer<typeof LlaveDeAccesoSchema>;

/** Un equipo en el que esa persona confirma identidad solo con su contraseña (ADR-029). */
export const EquipoDeConfianzaSchema = z.object({
  id: IdSchema,
  equipo: z.string().min(1).max(60),
  desde: TimestampSchema,
});
export type EquipoDeConfianzaDto = z.infer<typeof EquipoDeConfianzaSchema>;

/** Lo que Panel → Personas enseña de las credenciales de cada persona. Nunca un secreto. */
export const CredencialesDePersonaSchema = z.object({
  userId: IdSchema,
  /** Su puesto hace algo que exige confirmar identidad: tiene sentido darle credenciales. */
  lasNecesita: z.boolean(),
  tieneContrasena: z.boolean(),
  llaves: z.array(LlaveDeAccesoSchema),
  /** Tiene la app de autenticación configurada y confirmada (ADR-029). */
  app: z.boolean(),
  equiposDeConfianza: z.array(EquipoDeConfianzaSchema),
  codigosRestantes: z.number().int().min(0).max(10),
  /** Un enlace de alta sin usar y sin caducar. */
  enlacePendiente: z.object({ kind: TipoDeEnlaceSchema, caduca: TimestampSchema }).nullable(),
});
export type CredencialesDePersonaDto = z.infer<typeof CredencialesDePersonaSchema>;

/** Lo que ve quien abre un enlace, antes de teclear nada. */
export const EnlaceAbiertoSchema = z.object({
  nombre: z.string().min(1).max(120),
  kind: TipoDeEnlaceSchema,
  caduca: TimestampSchema,
});
export type EnlaceAbiertoDto = z.infer<typeof EnlaceAbiertoSchema>;

/** Primer paso: la contraseña (nueva en ALTA, la actual en LLAVE). Devuelve el desafío de la llave. */
export const PrepararAltaSchema = z.strictObject({ contrasena: ContrasenaSchema });
export type PrepararAlta = z.infer<typeof PrepararAltaSchema>;

/** La llave es opcional donde ADR-029 lo permite: o viene con su nombre, o no viene ninguno de los dos. */
const llaveCompleta = (v: { respuesta?: unknown; etiqueta?: unknown }) => (v.respuesta === undefined) === (v.etiqueta === undefined);
const LLAVE_INCOMPLETA = { message: "Ponle un nombre a tu llave de acceso", path: ["etiqueta"] };

/**
 * Segundo paso: la respuesta de la llave al desafío. En un alta (no al añadir una llave) la llave es
 * opcional (ADR-029): sin ella, la persona confirma con un equipo de confianza, la app o un código.
 */
export const CompletarAltaSchema = z
  .strictObject({
    desafioId: DesafioIdSchema,
    respuesta: RespuestaDeLlaveSchema.optional(),
    etiqueta: EtiquetaDeLlaveSchema.optional(),
  })
  .refine(llaveCompleta, LLAVE_INCOMPLETA);
export type CompletarAlta = z.infer<typeof CompletarAltaSchema>;

/* -------------------------------------------------------- instalación inicial */

/** `K7F2Q-X9B3M`, como lo escribe el servidor en su registro. Se acepta sin guion y en minúsculas. */
const CodigoDeInstalacionSchema = z.string().trim().min(10, "El código tiene diez caracteres").max(20);

/**
 * Lo que pide «Instalar L2 Control» (JORNADA §2, P2 a P4): el código que solo ve quien despliega,
 * el local, y la primera persona de administración con su contraseña y su PIN.
 */
export const PrepararInstalacionSchema = z.strictObject({
  codigo: CodigoDeInstalacionSchema,
  local: z.string().trim().min(2, "El nombre del local, al menos dos letras").max(80),
  sucursal: z.string().trim().min(2, "El nombre de la sucursal, al menos dos letras").max(80),
  nombre: z.string().trim().min(2, "Tu nombre completo, al menos dos letras").max(80),
  contrasena: ContrasenaSchema,
  pin: z.string().regex(/^\d{4}$/, "El PIN son cuatro dígitos"),
});
export type PrepararInstalacion = z.infer<typeof PrepararInstalacionSchema>;

/**
 * El último paso de la instalación. La llave es opcional (ADR-029): este equipo queda aprobado y de
 * confianza para la primera administración, con o sin ella.
 */
export const CompletarInstalacionSchema = z
  .strictObject({
    codigo: CodigoDeInstalacionSchema,
    desafioId: DesafioIdSchema,
    respuesta: RespuestaDeLlaveSchema.optional(),
    etiqueta: EtiquetaDeLlaveSchema.optional(),
    /** El nombre de este equipo, que queda aprobado: «PC de la oficina». */
    equipo: z.string().trim().min(2, "El nombre del equipo, al menos dos letras").max(40),
  })
  .refine(llaveCompleta, LLAVE_INCOMPLETA);

/* ------------------------------------------------------ app de autenticación */

/** El código de 6 cifras que da la app. Se aceptan espacios («123 456»). */
export const CodigoDeAppSchema = z.string().trim().regex(/^\d{3}\s?\d{3}$/, "Son seis cifras");

/** Para darla de alta en la app: el QR (`otpauth://…`) y el secreto, por si hay que teclearlo. Se enseña UNA vez. */
export const AppNuevaSchema = z.object({
  otpauth: z.string().startsWith("otpauth://totp/"),
  secreto: z.string().regex(/^[A-Z2-7]{16,64}$/),
});
export type AppNuevaDto = z.infer<typeof AppNuevaSchema>;

export const ConfirmarAppSchema = z.strictObject({ codigo: CodigoDeAppSchema });
export const RetirarAppSchema = z.strictObject({ userId: IdSchema });
export const RetirarConfianzaSchema = z.strictObject({ id: IdSchema });
export type CompletarInstalacion = z.infer<typeof CompletarInstalacionSchema>;

/* ------------------------------------------------------------- puesta a punto */

/**
 * Un punto de la Puesta a punto (JORNADA §2): se tacha solo cuando el dato existe. `bloquea` dice
 * qué no funcionará todavía; `null` es «recomendable, no detiene nada».
 */
export const PuntoDePuestaAPuntoIdSchema = z.enum([
    "personas",
    "equipos",
    "tarifas",
    "impuestos",
    "tasa",
    "medios",
    "catalogo",
    "impresoras",
    "feriados",
    "carta_y_plano",
    "existencias",
    "descuentos",
    "segunda_administracion",
    "otros_equipos",
  ]);
export type PuntoDePuestaAPuntoId = z.infer<typeof PuntoDePuestaAPuntoIdSchema>;

export const PuntoDePuestaAPuntoSchema = z.object({
  id: PuntoDePuestaAPuntoIdSchema,
  hecho: z.boolean(),
  bloquea: z.string().min(1).max(80).nullable(),
  /** Lo que hay o lo que falta, en una frase: «3 personas con PIN», «Falta la tasa de hoy». */
  detalle: z.string().min(1).max(160),
  /**
   * Un recomendable que administración dejó para después (T-8b): no cuenta como pendiente y se retoma
   * cuando se quiera. Lo que bloquea no se pospone.
   */
  paraDespues: z.object({ desde: TimestampSchema, por: z.string().min(2) }).nullable().default(null),
});
export type PuntoDePuestaAPuntoDto = z.infer<typeof PuntoDePuestaAPuntoSchema>;

export const PuestaAPuntoSchema = z.object({
  puntos: z.array(PuntoDePuestaAPuntoSchema),
  /** Lo que falta de lo que bloquea algún puesto. Con 0, el local puede abrir. */
  pendientesQueBloquean: z.number().int().min(0),
});
export type PuestaAPuntoDto = z.infer<typeof PuestaAPuntoSchema>;

/** Dejar un recomendable para después, o retomarlo. */
export const PosponerPuntoCommandSchema = z.strictObject({ id: PuntoDePuestaAPuntoIdSchema, paraDespues: z.boolean() });
export type PosponerPuntoCommand = z.infer<typeof PosponerPuntoCommandSchema>;
