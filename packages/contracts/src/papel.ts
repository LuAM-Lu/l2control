/**
 * La carga de lo anotado en papel — B3-7, V-12, ADR-027, JORNADA §4 y §7.
 *
 * Si caen los dos enlaces se trabaja en formularios. Al volver, la cajera abre una **carga** en su turno,
 * declarando la **ventana del corte** (desde cuándo y hasta cuándo no hubo sistema), y va cargando los
 * registros del papel: entradas, salidas y cobros. Cada uno lleva la **hora real que se anotó**, que es
 * la única hora que declara una pantalla (excepción explícita a ADR-017 y ADR-010): el servidor la
 * acepta solo dentro de la ventana de su carga, y guarda además cuándo se cargó.
 *
 * Una carga avanza ABIERTA → CERRADA (la cajera terminó) → REVISADA (supervisión la comparó con el
 * papel). Mientras no esté revisada, el turno no se sella (Z) y la jornada no se cierra.
 */
import { z } from "zod";
import { PaymentModeSchema } from "./account.ts";
import { IdSchema, IdempotencyKeySchema, MoneySchema, TimestampSchema } from "./primitives.ts";

const Texto = (max: number) => z.string().max(max);

export const EstadoDeCargaSchema = z.enum(["ABIERTA", "CERRADA", "REVISADA", "DESCARTADA"]);
export type EstadoDeCargaDto = z.infer<typeof EstadoDeCargaSchema>;

export const TipoDeRegistroSchema = z.enum(["ENTRADA", "SALIDA", "COBRO"]);
export type TipoDeRegistro = z.infer<typeof TipoDeRegistroSchema>;

/* ───────────────────────────────────────────── lo que declara la pantalla */

/**
 * Lo que acompaña a una entrada, una salida o un cobro cargados desde papel: a qué carga pertenecen y
 * la hora real que se anotó en el formulario. Es lo único que el navegador declara (ADR-027); el
 * servidor lo comprueba contra la ventana de la carga y contra su propio reloj.
 */
export const DesdePapelSchema = z.strictObject({
  cargaId: z.uuid("Carga desconocida"),
  ocurrioEn: TimestampSchema,
});
export type DesdePapel = z.infer<typeof DesdePapelSchema>;

/** Lo que queda escrito en lo cargado: de qué carga es, cuándo ocurrió de verdad y cuándo se cargó. */
export const MarcaDePapelSchema = z.object({
  cargaId: IdSchema,
  ocurrioEn: TimestampSchema,
  cargadoEn: TimestampSchema,
});
export type MarcaDePapelDto = z.infer<typeof MarcaDePapelSchema>;

/** Abrir una carga en el turno del equipo, con la ventana del corte. */
export const AbrirCargaCommandSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    desde: TimestampSchema,
    hasta: TimestampSchema,
    /** Qué pasó («se fue la luz»), para quien revisa. */
    nota: z.string().trim().max(160).optional(),
  })
  .refine((c) => Date.parse(c.desde) < Date.parse(c.hasta), { message: "El corte empieza antes de terminar", path: ["hasta"] });
export type AbrirCargaCommand = z.infer<typeof AbrirCargaCommandSchema>;

/** La cajera termina de cargar: la carga queda a la espera de supervisión (o se descarta, si está vacía). */
export const TerminarCargaCommandSchema = z.strictObject({ cargaId: z.uuid("Carga desconocida") });
export type TerminarCargaCommand = z.infer<typeof TerminarCargaCommandSchema>;

/** Supervisión da por buena la carga contra los formularios. La confirma con su PIN. */
export const RevisarCargaCommandSchema = z.strictObject({
  cargaId: z.uuid("Carga desconocida"),
  nota: z.string().trim().max(280).optional(),
});
export type RevisarCargaCommand = z.infer<typeof RevisarCargaCommandSchema>;

/* ───────────────────────────────────────────── lo que devuelve el servidor */

const Nino = z.object({ pulsera: Texto(24), nombre: Texto(80).nullable() });

/** Lo que dice un registro, en una forma que se compara de un vistazo con el formulario. */
const BaseDelRegistro = z.object({
  id: IdSchema,
  cuentaId: IdSchema,
  orden: z.number().int().positive(),
  familia: Texto(80),
  /** La hora real anotada en el papel. */
  ocurrioEn: TimestampSchema,
  /** Cuándo se cargó, con el reloj del servidor. */
  cargadoEn: TimestampSchema,
  cargadoPor: Texto(80),
});

export const RegistroDePapelSchema = z.discriminatedUnion("tipo", [
  BaseDelRegistro.extend({
    tipo: z.literal("ENTRADA"),
    modo: PaymentModeSchema,
    ninos: z.array(Nino),
    total: MoneySchema,
  }),
  BaseDelRegistro.extend({
    tipo: z.literal("SALIDA"),
    ninos: z.array(Nino),
    /** El tiempo de más que liquidó la salida (cero si salió a tiempo). */
    excedente: MoneySchema,
  }),
  BaseDelRegistro.extend({
    tipo: z.literal("COBRO"),
    total: MoneySchema,
    pagos: z.array(z.object({ medio: Texto(40), monto: MoneySchema })),
  }),
]);
export type RegistroDePapelDto = z.infer<typeof RegistroDePapelSchema>;

export const CargaDePapelSchema = z.object({
  id: IdSchema,
  turnoId: IdSchema,
  /** El punto de cobro del turno donde se cargó (el nombre del equipo). */
  punto: Texto(80),
  estado: EstadoDeCargaSchema,
  /** La ventana del corte que declaró la cajera. */
  desde: TimestampSchema,
  hasta: TimestampSchema,
  nota: Texto(160).nullable(),
  abiertaEn: TimestampSchema,
  abiertaPor: Texto(80),
  terminadaEn: TimestampSchema.nullable(),
  terminadaPor: Texto(80).nullable(),
  revisadaEn: TimestampSchema.nullable(),
  revisadaPor: Texto(80).nullable(),
  notaDeRevision: Texto(280).nullable(),
  /** En el orden en que ocurrieron (la hora real), no en el que se cargaron. */
  registros: z.array(RegistroDePapelSchema),
});
export type CargaDePapelDto = z.infer<typeof CargaDePapelSchema>;

/**
 * Lo que enseña la pantalla de la carga: la de este equipo (la abierta y las de su turno) y, para
 * quien revisa, todas las que esperan revisión en la sucursal. `ahora` es el reloj del servidor: con él
 * la pantalla acota la ventana y la hora de cada registro, que el servidor vuelve a comprobar.
 */
export const CargasDePapelSchema = z.object({
  ahora: TimestampSchema,
  /** El turno abierto del equipo, o `null`: sin turno no se carga. */
  turnoId: IdSchema.nullable(),
  turnoAbiertoEn: TimestampSchema.nullable(),
  cargas: z.array(CargaDePapelSchema),
});
export type CargasDePapelDto = z.infer<typeof CargasDePapelSchema>;

/** Una carga que impide cerrar: lo que sale en los pendientes del cierre (JORNADA §5, C2). */
export const CargaPendienteSchema = z.object({
  id: IdSchema,
  punto: Texto(80),
  estado: z.enum(["ABIERTA", "CERRADA"]),
  abiertaPor: Texto(80),
  desde: TimestampSchema,
  hasta: TimestampSchema,
  registros: z.number().int().nonnegative(),
});
export type CargaPendienteDto = z.infer<typeof CargaPendienteSchema>;
