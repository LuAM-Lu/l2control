/**
 * El catálogo de productos — F8-02, B9-1.
 *
 * Lo que la caja vende en el mostrador o añade a una cuenta abierta: bebidas, snacks, golosinas,
 * café. Es un dato del local, no una lista del código (§9.9): un producto nuevo se crea sin
 * desplegar, y uno que ya no se vende se aparta, no se borra (lo vendido lo nombra).
 *
 * Dos formas separadas, como en los impuestos:
 *  · **El producto** (nombre, categoría, trato del IVA, si lleva stock) se edita: el cambio queda
 *    en la auditoría con lo que había y lo que queda, y lo vendido ya copió lo suyo.
 *  · **El precio** no se edita: se programa el siguiente, con su día (`PROGRAMAR_PRECIO`). El
 *    calendario lo arma `@l2/domain-inventory` (`priceTimeline`).
 *
 * Todo precio va en dólares (la moneda funcional, DEC-1), en unidades menores y como texto.
 */
import { z } from "zod";
import { TaxCodeDelCatalogoSchema, TaxCodeSchema } from "./impuestos.ts";
import { FechaSchema, IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

export const NombreProductoSchema = z
  .string()
  .trim()
  .min(2, "Escribe el nombre del producto")
  .max(40, "Hasta 40 caracteres: es lo que cabe en el botón de la caja");

export const CategoriaProductoSchema = z
  .string()
  .trim()
  .min(2, "Escribe la categoría")
  .max(24, "Hasta 24 caracteres: es una pestaña de la caja");

/**
 * Un precio tecleado, en centavos de dólar y como texto: «150» es $ 1,50. Mayor que cero: lo que se
 * regala es una cortesía, con su motivo y su firma. El tope lo pone el dominio (`priceProblem`).
 */
export const PrecioMinorSchema = z
  .string()
  .regex(/^\d{1,9}$/, "Un precio en centavos de dólar")
  // Zod sigue con el refine aunque la regex falle: el guard evita que BigInt reviente con «1,50».
  .refine((p) => !/^\d+$/.test(p) || BigInt(p) > 0n, "El precio tiene que ser mayor que cero");

/**
 * Un tramo del calendario de precios: el precio que rige desde `desde` hasta `hasta` (nulo = hasta
 * nuevo aviso), con quién lo programó (§7.4: mueve lo que cobra el negocio).
 */
export const TramoPrecioSchema = z
  .object({
    id: IdSchema,
    precio: MoneySchema.refine((m) => m.currency === "USD", "Los precios del catálogo van en dólares"),
    desde: TimestampSchema,
    hasta: TimestampSchema.nullable(),
    programadoEl: TimestampSchema,
    programadoPor: z.string().trim().min(2).max(80),
  })
  .refine((t) => t.hasta === null || Date.parse(t.hasta) > Date.parse(t.desde), {
    message: "Un tramo no puede terminar antes de empezar",
    path: ["hasta"],
  });
export type TramoPrecioDto = z.infer<typeof TramoPrecioSchema>;

export const ProductoSchema = z
  .object({
    id: IdSchema,
    nombre: NombreProductoSchema,
    categoria: CategoriaProductoSchema,
    /** El trato del IVA con que se vende (§5.3): la alícuota la pone el calendario de impuestos. */
    taxCode: TaxCodeSchema,
    /** Si su existencia se lleva por movimientos (B9-2). Un café hecho al momento, no. */
    controlaStock: z.boolean(),
    /** Uno apartado no se ofrece en la caja. No se borra: lo vendido lo nombra. */
    activo: z.boolean(),
    /** El calendario de precios, del más viejo al más nuevo. */
    precios: z.array(TramoPrecioSchema),
    /**
     * Cuántas unidades quedan en la sucursal de quien lee (B9-2): la suma de sus movimientos. `null`
     * si no lleva existencia. Lo que una cuenta abierta ya tiene, ya salió (ADR-023).
     */
    existencia: z.number().int().min(0, "La existencia no baja de cero").nullable(),
  })
  .refine((p) => (p.existencia === null) === !p.controlaStock, {
    message: "Solo lleva existencia lo que controla stock",
    path: ["existencia"],
  });
export type ProductoDto = z.infer<typeof ProductoSchema>;

/**
 * El catálogo del local. Puede estar vacío (un local nuevo): la caja entonces no vende en el
 * mostrador y lo dice.
 */
export const CatalogoSchema = z
  .object({
    productos: z.array(ProductoSchema),
    /** La zona que decide qué día es «hoy» al programar un precio. */
    zonaHoraria: z.string().min(1),
    /** Hasta cuántos días por delante se programa un precio. */
    diasPorAdelantado: z.number().int().min(1),
  })
  .refine((c) => new Set(c.productos.map((p) => p.id)).size === c.productos.length, {
    message: "Dos productos no pueden compartir identificador",
    path: ["productos"],
  });
export type CatalogoDto = z.infer<typeof CatalogoSchema>;

/** Un producto nuevo: nace a la venta, con su primer precio rigiendo desde que se guarda. */
export const ProductoNuevoSchema = z.strictObject({
  nombre: NombreProductoSchema,
  categoria: CategoriaProductoSchema,
  taxCode: TaxCodeDelCatalogoSchema,
  controlaStock: z.boolean(),
  precioMinor: PrecioMinorSchema,
});
export type ProductoNuevoDto = z.infer<typeof ProductoNuevoSchema>;

/**
 * Los cambios posibles.
 *
 * No hay «borrar un producto» (se aparta con `ACTIVAR`) ni «editar un precio»: se programa el
 * siguiente para un día. Hoy rige desde que se guarda; otro día, desde su medianoche en el local.
 * El DÍA lo dice el navegador; el instante y quién lo programa, el servidor (ADR-017).
 */
export const ProductoCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CREAR"), producto: ProductoNuevoSchema }),
  z.strictObject({
    kind: z.literal("EDITAR"),
    productId: z.uuid("Producto desconocido"),
    nombre: NombreProductoSchema,
    categoria: CategoriaProductoSchema,
    taxCode: TaxCodeDelCatalogoSchema,
    controlaStock: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("ACTIVAR"), productId: z.uuid("Producto desconocido"), activo: z.boolean() }),
  z.strictObject({
    kind: z.literal("PROGRAMAR_PRECIO"),
    productId: z.uuid("Producto desconocido"),
    precioMinor: PrecioMinorSchema,
    dia: FechaSchema,
  }),
]);
export type ProductoCommand = z.infer<typeof ProductoCommandSchema>;
