/**
 * Las alícuotas del local, con su vigencia — F3-06, F3-07, §5.3, en el servidor desde B2-2.
 *
 * Un impuesto no es una constante: es un **dato con fecha**. Cuando el IVA
 * cambie, se programa una vigencia nueva; la de antes se queda, porque lo
 * vendido el mes pasado tiene que seguir calculándose con la alícuota que tenía.
 * Cambiar la tabla no puede reescribir el pasado (regla 5).
 *
 * Quien calcula con esto es `@l2/domain-tax`: arma el calendario de lo programado
 * (`taxTimeline`) y elige la regla de un instante (`findRule`, `igtfAt`). Aquí
 * está la forma y lo que no se puede expresar: dos vigencias del mismo impuesto
 * pisándose, una que termina antes de empezar, un «exento» distinto de cero.
 *
 * ⚠ **Los valores los confirma el contador** (DEC-1). El diseño está hecho
 * para que la alícuota sea un dato configurable precisamente porque va a
 * cambiar, y porque hoy nadie del equipo puede afirmar cuál es la correcta.
 */
import { z } from "zod";
import { FechaSchema, IdSchema, TimestampSchema } from "./primitives.ts";

/** Los tres tratos del IVA que usa el catálogo (§5.3). */
export const TaxCodeSchema = z.enum(["GENERAL", "REDUCIDA", "EXENTA"]);
export type TaxCode = z.infer<typeof TaxCodeSchema>;

/**
 * Los tratos que se eligen al crear o editar un producto (v0.30.1, pedido del cliente): el IVA
 * reducido no se usa en el local, así que no se ofrece ni se acepta. Sigue en `TaxCodeSchema` y en el
 * motor para leer lo que ya exista y por si algún día hiciera falta.
 */
export const TaxCodeDelCatalogoSchema = z.enum(["GENERAL", "EXENTA"], {
  error: "Este local no usa el IVA reducido: elige IVA general o exento",
});
export type TaxCodeDelCatalogo = z.infer<typeof TaxCodeDelCatalogoSchema>;

/**
 * Los tratos que se programan. Lo exento no: es cero por definición, y el
 * dominio lo añade siempre. Un «exento al 8 %» es una contradicción que
 * acabaría cobrándose.
 */
export const TratoProgramableSchema = z.enum(["GENERAL", "REDUCIDA"]);
export type TratoProgramable = z.infer<typeof TratoProgramableSchema>;

/** IVA grava lo que se vende; IGTF, el medio con el que se paga (§5.3). */
export const ImpuestoSchema = z.enum(["IVA", "IGTF"]);
export type Impuesto = z.infer<typeof ImpuestoSchema>;

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

/** El IVA lleva su trato; el IGTF no tiene (grava el pago, no el producto). */
const conTratoSoloEnIva = (v: { impuesto: Impuesto; code: TratoProgramable | null }) =>
  (v.impuesto === "IVA") === (v.code !== null);
const MENSAJE_TRATO = "El IVA lleva su trato (general o reducido); el IGTF, ninguno";

/**
 * Una vigencia: desde cuándo rige una alícuota y hasta cuándo, con quién la
 * programó. `hasta` nulo es «hasta nuevo aviso»: se cierra el día que empieza
 * la siguiente del mismo impuesto.
 */
export const VigenciaImpuestoSchema = z
  .object({
    id: IdSchema,
    impuesto: ImpuestoSchema,
    code: TratoProgramableSchema.nullable(),
    basisPoints: BasisPointsSchema,
    desde: TimestampSchema,
    hasta: TimestampSchema.nullable(),
    programadaEl: TimestampSchema,
    /** Quién la programó (§7.4): mueve lo que cobra el negocio. */
    programadaPor: z.string().trim().min(2).max(80),
  })
  .refine(conTratoSoloEnIva, { message: MENSAJE_TRATO, path: ["code"] })
  .refine((v) => v.hasta === null || Date.parse(v.hasta) > Date.parse(v.desde), {
    message: "Una vigencia no puede terminar antes de empezar",
    path: ["hasta"],
  });
export type VigenciaImpuestoDto = z.infer<typeof VigenciaImpuestoSchema>;

/** Dos vigencias del mismo impuesto (y trato) que se pisan en el tiempo. */
function seSolapan(a: VigenciaImpuestoDto, b: VigenciaImpuestoDto): boolean {
  if (a.impuesto !== b.impuesto || a.code !== b.code) return false;
  const aDesde = Date.parse(a.desde);
  const aHasta = a.hasta === null ? Infinity : Date.parse(a.hasta);
  const bDesde = Date.parse(b.desde);
  const bHasta = b.hasta === null ? Infinity : Date.parse(b.hasta);
  return aDesde < bHasta && bDesde < aHasta;
}

/**
 * El calendario completo: lo que rigió, lo que rige y lo programado, por
 * impuesto. Puede estar vacío en un local nuevo; entonces la caja no cobra
 * (fail-closed) y la pantalla de Impuestos dice qué falta.
 */
export const ImpuestosSchema = z
  .object({
    vigencias: z.array(VigenciaImpuestoSchema),
    /** La zona que decide qué día es «hoy» al programar. */
    zonaHoraria: z.string().min(1),
    /** Hasta cuántos días por delante se puede programar. */
    diasPorAdelantado: z.number().int().min(1),
  })
  .refine(
    (t) => {
      for (let i = 0; i < t.vigencias.length; i++) {
        for (let j = i + 1; j < t.vigencias.length; j++) {
          if (seSolapan(t.vigencias[i]!, t.vigencias[j]!)) return false;
        }
      }
      return true;
    },
    {
      // Con dos vigencias pisándose, el total de una factura dependería del
      // orden de la lista. Eso es un cobro que no se puede defender.
      message: "Dos vigencias del mismo impuesto no pueden pisarse",
      path: ["vigencias"],
    },
  );
export type ImpuestosDto = z.infer<typeof ImpuestosSchema>;

/**
 * Programar un cambio de alícuota.
 *
 * No hay «editar una vigencia»: se **programa la siguiente**, que cierra la
 * abierta el día que empieza. Así el pasado queda intacto y el cambio se puede
 * dejar preparado con fecha, que es como llega una gaceta. Para corregir una
 * programada, se programa otra para el mismo día: manda la última.
 *
 * El navegador dice el DÍA; el instante lo pone el servidor (hoy, desde este
 * momento; otro día, desde su medianoche en el local), igual que quién lo
 * programa, que sale de la sesión (ADR-017).
 */
export const ProgramarImpuestoCommandSchema = z
  .strictObject({
    impuesto: ImpuestoSchema,
    code: TratoProgramableSchema.nullable(),
    basisPoints: BasisPointsSchema,
    dia: FechaSchema,
  })
  .refine(conTratoSoloEnIva, { message: MENSAJE_TRATO, path: ["code"] })
  .refine((c) => c.impuesto !== "IGTF" || c.basisPoints < 10_000, {
    // El IGTF grava el pago: con el 100 % no hay pago que se cubra a sí mismo.
    message: "El IGTF no puede ser del 100 %",
    path: ["basisPoints"],
  });
export type ProgramarImpuestoCommand = z.infer<typeof ProgramarImpuestoCommandSchema>;
