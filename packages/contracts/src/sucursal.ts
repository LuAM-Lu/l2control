import { z } from "zod";
import { IdSchema, MoneySchema } from "./primitives.ts";

/**
 * Los ajustes de la sucursal — F2-03, F5-08b, F4-04c y F6-13 (D8).
 *
 * Son **datos, no constantes del código** (§9.9): lo que aquí se cambia
 * cambia todas las superficies sin desplegar. Por eso viven en un contrato y
 * no en un archivo de configuración escondido.
 *
 * Lo que NO está aquí, a propósito:
 *  · el aforo y las reglas del parque viven en el tarifario (F5-04), donde se
 *    editan junto a los paquetes que los usan;
 *  · las alícuotas de IVA y el IGTF viven en su propio contrato fiscal, porque
 *    se versionan por fecha y estos ajustes no;
 *  · la tasa del día vive en `ExchangeRate`, que es un histórico inmutable.
 */

/** Hora del reloj de pared, «HH:MM» en 24 h. No es un instante: no lleva día. */
export const HoraDelDiaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato HH:MM, de 00:00 a 23:59");
export type HoraDelDia = z.infer<typeof HoraDelDiaSchema>;

const minutos = (hora: string) => {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
};

export const DiaSemanaSchema = z.enum([
  "LUNES",
  "MARTES",
  "MIERCOLES",
  "JUEVES",
  "VIERNES",
  "SABADO",
  "DOMINGO",
]);
export type DiaSemana = z.infer<typeof DiaSemanaSchema>;

/**
 * El horario de un día. Unión discriminada y no un par de horas opcionales:
 * «cerrado» no es «abre a las 00:00» ni un hueco sin llenar (ADR-011).
 */
export const HorarioDelDiaSchema = z.discriminatedUnion("kind", [
  z.object({ dia: DiaSemanaSchema, kind: z.literal("CERRADO") }),
  z
    .object({
      dia: DiaSemanaSchema,
      kind: z.literal("ABIERTO"),
      abre: HoraDelDiaSchema,
      cierra: HoraDelDiaSchema,
    })
    .refine((h) => minutos(h.cierra) > minutos(h.abre), {
      // El local cierra el mismo día. Un horario que cruza la medianoche
      // rompería el día de negocio (ADR-009) sin que nadie lo note.
      message: "La hora de cierre tiene que ser posterior a la de apertura",
      path: ["cierra"],
    }),
]);
export type HorarioDelDiaDto = z.infer<typeof HorarioDelDiaSchema>;

/**
 * Servicio y propina (F6-13, DEC-6, decidido en D8).
 *
 * Es un ajuste del local, no un paso del cobro. «Sin servicio» es explícito:
 * un cero suelto no distingue «no se cobra» de «falta configurarlo».
 */
export const ServicioSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("SIN_SERVICIO") }),
  z.object({
    kind: z.literal("SUGERIDO"),
    /** Puntos básicos, como el IVA: 1000 = 10 %. Nunca un `float`. */
    basisPoints: z
      .number()
      .int("El servicio se expresa en puntos básicos enteros")
      .min(1, "Un servicio sugerido de 0 es «sin servicio»")
      .max(3000, "Un servicio por encima del 30 % pide una decisión, no un ajuste"),
  }),
]);
export type ServicioDto = z.infer<typeof ServicioSchema>;

const RIF = /^[JGVEP]-\d{8}-\d$/;

export const AjustesSucursalSchema = z
  .object({
    branchId: IdSchema,
    nombre: z.string().trim().min(2, "Nombre demasiado corto").max(80),
    /** RIF venezolano: letra, ocho dígitos y dígito verificador. */
    rif: z.string().trim().regex(RIF, "RIF con formato J-12345678-9"),
    direccionFiscal: z.string().trim().min(8, "Dirección demasiado corta").max(160),
    telefono: z.string().trim().min(7).max(20).optional(),
    /**
     * DEC-2: la moneda funcional es el dólar. Se declara en vez de darse por
     * supuesta, para que el día que cambie se vea en un contrato y no en
     * veinte comparaciones sueltas.
     */
    monedaFuncional: z.literal("USD"),
    /** Afecta a TODAS las superficies a la vez (F5-08b). */
    formatoHora: z.enum(["12h", "24h"]),
    horario: z.array(HorarioDelDiaSchema).length(7, "El horario declara los siete días"),
    /**
     * Residuo que la caja puede quedarse cuando no hay vuelto exacto (F4-04c).
     * Por encima, hay que dar vuelto o marcarlo como propina.
     */
    maxRetenido: MoneySchema,
    servicio: ServicioSchema,
  })
  .refine((a) => new Set(a.horario.map((h) => h.dia)).size === 7, {
    message: "Cada día de la semana aparece una sola vez en el horario",
    path: ["horario"],
  })
  .refine((a) => a.maxRetenido.currency === a.monedaFuncional, {
    message: "El umbral de residuo va en la moneda funcional",
    path: ["maxRetenido"],
  })
  .refine((a) => BigInt(a.maxRetenido.minor) > 0n, {
    // Un umbral de cero deja la caja sin salida cuando falta un centavo: no
    // se puede retener, no se puede dar vuelto exacto y el cobro se traba.
    message: "El umbral de residuo tiene que ser mayor que cero",
    path: ["maxRetenido"],
  });
export type AjustesSucursalDto = z.infer<typeof AjustesSucursalSchema>;
