/**
 * El turno de caja — F4-01, F4-01b, DEC-13, DEC-26, I-06.
 *
 * Un turno es el marco de todo el dinero del día: sin turno abierto **no se
 * cobra** (fail-closed), y cuando se cierra con el corte Z queda sellado —
 * después del Z ninguna operación monetaria lo toca (F4-06). Eso último lo
 * impone el dominio (`assertShiftAcceptsMoney`); aquí está la forma.
 *
 * DEC-26 lo deja genérico a propósito: **un turno, una gaveta, un arqueo por
 * caja**. Ninguna pantalla depende de que solo haya uno, así que turnos por
 * persona o por punto de cobro se deciden con el backend sin rehacer nada.
 *
 * El fondo inicial va **por moneda** porque la gaveta tiene dólares y
 * bolívares, y un arqueo que los sume en un solo número esconde justo lo que
 * hay que ver (§5.6).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

export const EstadoTurnoSchema = z.enum(["ABIERTO", "EN_CIERRE", "CERRADO_Z"]);
export type EstadoTurno = z.infer<typeof EstadoTurnoSchema>;

const Persona = z.object({
  id: IdSchema,
  name: z.string().trim().min(2, "Nombre demasiado corto").max(80),
});

/**
 * Lo que se declara al abrir: cuánto hay en la gaveta de cada moneda.
 *
 * Cero es un fondo válido y explícito —se empieza sin cambio—, pero negativo
 * no: una gaveta no puede empezar debiendo dinero.
 */
export const FondoInicialSchema = z.object({
  currency: z.enum(["USD", "VES"]),
  amount: MoneySchema,
}).refine((f) => f.amount.currency === f.currency, {
  message: "El fondo tiene que estar en la moneda que declara",
  path: ["amount"],
}).refine((f) => !f.amount.minor.startsWith("-"), {
  message: "Un fondo inicial no puede ser negativo",
  path: ["amount"],
});
export type FondoInicialDto = z.infer<typeof FondoInicialSchema>;

export const TurnoSchema = z
  .object({
    id: IdSchema,
    /** El equipo en el que se abrió. Un equipo, un turno abierto (I-06). */
    deviceId: IdSchema,
    estado: EstadoTurnoSchema,
    abiertoPor: Persona,
    abiertoEn: TimestampSchema,
    fondos: z.array(FondoInicialSchema).min(1, "Declara el fondo de cada moneda"),
    /** Quién hizo el corte Z y cuándo. Van juntos o no van (§7.4). */
    cerradoPor: Persona.optional(),
    cerradoEn: TimestampSchema.optional(),
  })
  .refine((t) => new Set(t.fondos.map((f) => f.currency)).size === t.fondos.length, {
    message: "Una moneda se declara una sola vez",
    path: ["fondos"],
  })
  .refine(
    (t) =>
      (t.estado === "CERRADO_Z") === (t.cerradoPor !== undefined && t.cerradoEn !== undefined),
    {
      // Un turno cerrado sin firma no se puede auditar, y una firma sobre un
      // turno abierto es un cierre que no ocurrió.
      message: "Un turno con corte Z dice quién lo cerró y cuándo; uno abierto, no lo dice",
      path: ["estado"],
    },
  )
  .refine((t) => t.cerradoEn === undefined || Date.parse(t.cerradoEn) >= Date.parse(t.abiertoEn), {
    message: "Un turno no se cierra antes de abrirse",
    path: ["cerradoEn"],
  });
export type TurnoDto = z.infer<typeof TurnoSchema>;

/**
 * Los turnos del local.
 *
 * La invariante I-06: **un equipo no puede tener dos turnos abiertos**. Con
 * dos, el mismo dinero se contaría en dos arqueos y ninguno cuadraría.
 */
export const TurnosSchema = z
  .object({ turnos: z.array(TurnoSchema) })
  .refine((t) => new Set(t.turnos.map((x) => x.id)).size === t.turnos.length, {
    message: "Dos turnos no pueden compartir identificador",
    path: ["turnos"],
  })
  .refine(
    (t) => {
      const abiertos = t.turnos.filter((x) => x.estado !== "CERRADO_Z").map((x) => x.deviceId);
      return new Set(abiertos).size === abiertos.length;
    },
    {
      message: "Ese equipo ya tiene un turno abierto (I-06)",
      path: ["turnos"],
    },
  );
export type TurnosDto = z.infer<typeof TurnosSchema>;

/**
 * Abrir el turno (F4-01).
 *
 * No admite `estado`: un turno nace abierto y no hay otra forma de nacer. Y
 * no admite `id` ni `abiertoEn`: los pone quien lo aplica, para que nadie
 * pueda declarar que abrió a otra hora.
 */
export const AbrirTurnoCommandSchema = z.strictObject({
  deviceId: IdSchema,
  abiertoPor: Persona,
  fondos: z.array(FondoInicialSchema).min(1, "Declara el fondo de cada moneda"),
});
export type AbrirTurnoCommand = z.infer<typeof AbrirTurnoCommandSchema>;

/**
 * Los pasos del cierre. El corte Z es **irreversible** (F4-06): no existe un
 * mando para reabrir un turno cerrado, y esa ausencia es la decisión.
 */
export const TurnoCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ABRIR"), ...AbrirTurnoCommandSchema.shape }),
  z.strictObject({ kind: z.literal("INICIAR_CIERRE"), turnoId: IdSchema }),
  z.strictObject({ kind: z.literal("CORTE_Z"), turnoId: IdSchema, por: Persona }),
]);
export type TurnoCommand = z.infer<typeof TurnoCommandSchema>;
