/**
 * Salidas y conteo físico del inventario — B9-4, F8-07.
 *
 * Lo que sale sin venderse (merma o daño, consumo interno, regalo, devolución al proveedor) sale con su
 * motivo de una lista cerrada; un conteo dice lo que hay de verdad y la existencia queda igual a lo
 * contado. Las dos cosas las autoriza alguien con su PIN (§7.3), y nada se edita ni se borra.
 *
 * El navegador dice qué y cuánto; el instante, quién lo hace, quién autoriza y el costo los pone el
 * servidor (ADR-017).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

export const MotivoSalidaSchema = z.enum(["MERMA", "CONSUMO_INTERNO", "REGALO", "DEVOLUCION_PROVEEDOR"], {
  error: "Elige por qué sale",
});
export type MotivoSalida = z.infer<typeof MotivoSalidaSchema>;

const DetalleSchema = z.string().trim().min(3, "Explica un poco más").max(280, "Hasta 280 caracteres");
const unicos = (lineas: readonly { productId: string }[]) => new Set(lineas.map((l) => l.productId)).size === lineas.length;

/** Registrar una salida. `idempotencyKey`: un doble clic no saca dos veces. */
export const RegistrarSalidaCommandSchema = z
  .strictObject({
    idempotencyKey: z.uuid(),
    motivo: MotivoSalidaSchema,
    detalle: DetalleSchema.optional(),
    lineas: z
      .array(
        z.strictObject({
          productId: z.uuid("Producto desconocido"),
          cantidad: z.number().int("Unidades enteras").min(1, "Al menos una unidad").max(10_000, "Hasta 10.000 unidades"),
        }),
      )
      .min(1, "Añade al menos un producto")
      .max(60, "Hasta 60 productos por salida"),
  })
  .refine((s) => unicos(s.lineas), { message: "Cada producto va una vez", path: ["lineas"] });
export type RegistrarSalidaCommand = z.infer<typeof RegistrarSalidaCommandSchema>;

/**
 * Registrar un conteo. Cada línea dice lo que el sistema decía al contar (`esperado`) y lo que se
 * contó: si la existencia cambió mientras tanto (se vendió algo), el servidor no ajusta a ciegas.
 */
export const RegistrarConteoCommandSchema = z
  .strictObject({
    idempotencyKey: z.uuid(),
    detalle: DetalleSchema.optional(),
    lineas: z
      .array(
        z.strictObject({
          productId: z.uuid("Producto desconocido"),
          esperado: z.number().int().min(0),
          contado: z.number().int("Unidades enteras").min(0, "No se cuentan unidades negativas").max(1_000_000, "Demasiadas unidades"),
        }),
      )
      .min(1, "Cuenta al menos un producto")
      .max(300, "Hasta 300 productos por conteo"),
  })
  .refine((c) => unicos(c.lineas), { message: "Cada producto se cuenta una vez", path: ["lineas"] });
export type RegistrarConteoCommand = z.infer<typeof RegistrarConteoCommandSchema>;

/** Una salida o un conteo ya registrados, como los lee la pantalla. Cantidades y valores con su signo. */
export const AjusteInventarioSchema = z.object({
  id: IdSchema,
  tipo: z.enum(["SALIDA", "CONTEO"]),
  motivo: MotivoSalidaSchema.nullable(),
  detalle: z.string().nullable(),
  en: TimestampSchema,
  por: z.string().min(2),
  autorizadoPor: z.string().min(2),
  lineas: z.array(
    z.object({
      productId: IdSchema,
      nombre: z.string().min(1),
      /** Su categoría (B9-10): el informe de diferencias suma por ella. */
      categoria: z.string().default("Sin categoría"),
      /** Lo que movió: negativo sale, positivo entra; 0 si el conteo cuadró. */
      cantidad: z.number().int(),
      /** En un conteo, lo que decía el sistema y lo que se contó. */
      esperado: z.number().int().min(0).nullable(),
      contado: z.number().int().min(0).nullable(),
      valor: MoneySchema,
    }),
  ),
  /** Lo que movió al costo, con su signo: lo perdido es negativo. */
  valor: MoneySchema,
});
export type AjusteInventarioDto = z.infer<typeof AjusteInventarioSchema>;

/** Las salidas y los conteos recientes de la sucursal, del más nuevo al más viejo. */
export const AjustesInventarioSchema = z.object({ ajustes: z.array(AjusteInventarioSchema) });
export type AjustesInventarioDto = z.infer<typeof AjustesInventarioSchema>;
