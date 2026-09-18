/**
 * Las alícuotas del local, con su vigencia — F3-06, F3-07, §5.3.
 *
 * Un impuesto no es una constante: es un **dato con fecha**. Cuando el IVA
 * cambie, se añade una vigencia nueva; la de antes se queda, porque la factura
 * del mes pasado tiene que seguir calculándose con la alícuota que tenía.
 * Cambiar la tabla no puede reescribir el pasado (regla 5).
 *
 * Quien calcula con esto es `@l2/domain-tax`, que ya elige la regla aplicable
 * a un instante (`findRule`). Aquí está la forma y lo que no se puede
 * expresar: dos vigencias del mismo impuesto pisándose, o una que empieza
 * después de terminar.
 *
 * ⚠ **Los valores los confirma el contador** (DEC-1). El diseño está hecho
 * para que la alícuota sea un dato configurable precisamente porque va a
 * cambiar, y porque hoy nadie del equipo puede afirmar cuál es la correcta.
 */
import { z } from "zod";
import { TimestampSchema } from "./primitives.ts";

/** Los tres tratos del IVA que usa el catálogo (§5.3). */
export const TaxCodeSchema = z.enum(["GENERAL", "REDUCIDA", "EXENTA"]);
export type TaxCode = z.infer<typeof TaxCodeSchema>;

/**
 * Una alícuota en puntos básicos: 16 % = 1600.
 *
 * Entero y no decimal, por lo mismo que el dinero (ADR-004). El tope es el
 * 100 %: por encima, alguien se equivocó de unidad.
 */
export const BasisPointsSchema = z
  .number()
  .int("La alícuota va en puntos básicos enteros: 16 % = 1600")
  .min(0)
  .max(10_000, "Una alícuota no pasa del 100 %");

/**
 * Una vigencia: desde cuándo rige esta alícuota y hasta cuándo.
 *
 * `hasta` nulo significa «hasta nuevo aviso», que es lo normal: la vigencia
 * abierta se cierra el día que llega la siguiente.
 */
export const VigenciaIvaSchema = z
  .object({
    code: TaxCodeSchema,
    basisPoints: BasisPointsSchema,
    desde: TimestampSchema,
    hasta: TimestampSchema.nullable(),
  })
  .refine((v) => v.hasta === null || Date.parse(v.hasta) > Date.parse(v.desde), {
    message: "Una vigencia no puede terminar antes de empezar",
    path: ["hasta"],
  })
  .refine((v) => v.code !== "EXENTA" || v.basisPoints === 0, {
    // Exento significa cero. Un «exento al 8 %» es una contradicción que
    // acabaría cobrándose.
    message: "Lo exento es cero por definición",
    path: ["basisPoints"],
  });
export type VigenciaIvaDto = z.infer<typeof VigenciaIvaSchema>;

/** Dos vigencias del mismo impuesto que se pisan en el tiempo. */
function seSolapan(a: VigenciaIvaDto, b: VigenciaIvaDto): boolean {
  if (a.code !== b.code) return false;
  const aDesde = Date.parse(a.desde);
  const aHasta = a.hasta === null ? Infinity : Date.parse(a.hasta);
  const bDesde = Date.parse(b.desde);
  const bHasta = b.hasta === null ? Infinity : Date.parse(b.hasta);
  return aDesde < bHasta && bDesde < aHasta;
}

/**
 * La tabla completa: el IVA con sus vigencias y el IGTF.
 *
 * El IGTF va aparte porque no es lo mismo (§5.3): el IVA grava lo que se
 * vende y el IGTF, **el medio con el que se paga**. Confundirlos es el error
 * clásico, y por eso ni siquiera comparten forma.
 */
export const ImpuestosSchema = z
  .object({
    iva: z.array(VigenciaIvaSchema).min(1, "Hace falta al menos una alícuota"),
    /** IGTF sobre pagos en divisas. 3 % = 300 (DEC-1, a confirmar). */
    igtfBasisPoints: BasisPointsSchema,
    /** Desde cuándo rige ese IGTF. El anterior se queda en el historial. */
    igtfDesde: TimestampSchema,
  })
  .refine(
    (t) => {
      for (let i = 0; i < t.iva.length; i++) {
        for (let j = i + 1; j < t.iva.length; j++) {
          if (seSolapan(t.iva[i]!, t.iva[j]!)) return false;
        }
      }
      return true;
    },
    {
      // Con dos vigencias pisándose, el total de una factura dependería del
      // orden de la lista. Eso es un cobro que no se puede defender.
      message: "Dos vigencias del mismo impuesto no pueden pisarse",
      path: ["iva"],
    },
  )
  .refine(
    (t) =>
      TaxCodeSchema.options.every((code) =>
        t.iva.some((v) => v.code === code && v.hasta === null),
      ),
    {
      // Sin vigencia abierta para un trato, mañana no habría con qué calcular
      // una línea de ese tipo y la caja se quedaría sin cobrar (fail-closed).
      message: "Cada trato del IVA necesita una vigencia abierta (sin fecha de fin)",
      path: ["iva"],
    },
  );
export type ImpuestosDto = z.infer<typeof ImpuestosSchema>;

/**
 * Programar un cambio de alícuota.
 *
 * No hay «editar una vigencia»: se **programa la siguiente**, que cierra la
 * abierta el día que empieza. Así el pasado queda intacto y el cambio se puede
 * dejar preparado con fecha, que es como llega una gaceta.
 */
export const ProgramarIvaCommandSchema = z.strictObject({
  code: TaxCodeSchema,
  basisPoints: BasisPointsSchema,
  desde: TimestampSchema,
  /** Quién lo programó: esto mueve lo que cobra el negocio (§7.4). */
  por: z.string().trim().min(2).max(80),
});
export type ProgramarIvaCommand = z.infer<typeof ProgramarIvaCommandSchema>;

export const ProgramarIgtfCommandSchema = z.strictObject({
  basisPoints: BasisPointsSchema,
  desde: TimestampSchema,
  por: z.string().trim().min(2).max(80),
});
export type ProgramarIgtfCommand = z.infer<typeof ProgramarIgtfCommandSchema>;

export const ImpuestoCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("PROGRAMAR_IVA"), ...ProgramarIvaCommandSchema.shape }),
  z.strictObject({ kind: z.literal("PROGRAMAR_IGTF"), ...ProgramarIgtfCommandSchema.shape }),
]);
export type ImpuestoCommand = z.infer<typeof ImpuestoCommandSchema>;
