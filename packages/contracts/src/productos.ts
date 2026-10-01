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
/**
 * De qué tipo es (B9-6, M-16): un PRODUCTO se cuenta (lleva existencia, código de barras, entradas y
 * conteo), un PREPARADO se hace al momento (café, tequeños) y un SERVICIO no es una cosa (alquiler,
 * paquetes).
 */
export const TipoProductoSchema = z.enum(["PRODUCTO", "PREPARADO", "SERVICIO"], { error: "Elige el tipo" });
export type TipoProducto = z.infer<typeof TipoProductoSchema>;

/** El código de barras del empaque, como se guarda: sin espacios y en mayúsculas. El dígito de control lo mira el dominio. */
export const CodigoBarrasSchema = z
  .string()
  .transform((c) => c.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^[0-9A-Z-]{4,32}$/, "De 4 a 32 dígitos, letras o guiones"));

/** «Lata 355 ml», «Bolsa 45 g». */
export const PresentacionSchema = z.string().trim().min(2, "Escribe la presentación").max(40, "Hasta 40 caracteres");

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
    /** De qué tipo es (B9-6). */
    tipo: TipoProductoSchema,
    /** Si su existencia se lleva por movimientos (B9-2): lo dice el tipo (solo el PRODUCTO). */
    controlaStock: z.boolean(),
    /** El código interno, «BEB-0001»: lo pone el servidor y no cambia (B9-6). */
    sku: z.string().regex(/^[A-Z]{3}-\d{4,6}$/),
    codigoBarras: z.string().nullable(),
    presentacion: z.string().nullable(),
    /** Uno apartado no se ofrece en la caja. No se borra: lo vendido lo nombra. */
    activo: z.boolean(),
    /** El calendario de precios, del más viejo al más nuevo. */
    precios: z.array(TramoPrecioSchema),
    /**
     * Cuántas unidades quedan en la sucursal de quien lee (B9-2): la suma de sus movimientos. `null`
     * si no lleva existencia. Lo que una cuenta abierta ya tiene, ya salió (ADR-023).
     */
    existencia: z.number().int().min(0, "La existencia no baja de cero").nullable(),
    /**
     * El costo promedio ponderado de una unidad (B9-3), redondeado al céntimo para enseñarlo: el valor
     * al costo de lo que queda entre sus unidades. `null` sin existencia o si no la lleva.
     */
    costoPromedio: MoneySchema.nullable(),
    /** Cuántas unidades traía el bulto de la última entrada: la pantalla de entradas lo propone. */
    ultimoBulto: z.number().int().min(1).nullable(),
    /** El stock mínimo, su punto de reorden (B9-5): con la existencia en él o por debajo, avisa. */
    minimo: z.number().int().min(0).nullable(),
    /** Lo que vale al costo lo que queda (B9-6): la suma del valor de sus movimientos. `null` si no lleva existencia. */
    valor: MoneySchema.nullable(),
  })
  .refine((p) => p.controlaStock === (p.tipo === "PRODUCTO"), {
    message: "Solo el producto lleva existencia",
    path: ["controlaStock"],
  })
  .refine((p) => (p.existencia === null) === !p.controlaStock, {
    message: "Solo lleva existencia lo que controla stock",
    path: ["existencia"],
  })
  .refine((p) => p.costoPromedio === null || (p.existencia !== null && p.existencia > 0), {
    message: "Sin existencia no hay costo promedio",
    path: ["costoPromedio"],
  })
  .refine((p) => p.minimo === null || p.controlaStock, {
    message: "Solo tiene mínimo lo que lleva existencia",
    path: ["minimo"],
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
export const ProductoNuevoSchema = z
  .strictObject({
    nombre: NombreProductoSchema,
    categoria: CategoriaProductoSchema,
    taxCode: TaxCodeDelCatalogoSchema,
    tipo: TipoProductoSchema,
    precioMinor: PrecioMinorSchema,
    codigoBarras: CodigoBarrasSchema.optional(),
    presentacion: PresentacionSchema.optional(),
  })
  .refine((p) => p.codigoBarras === undefined || p.tipo === "PRODUCTO", {
    message: "Solo un producto que se cuenta lleva código de barras",
    path: ["codigoBarras"],
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
    tipo: TipoProductoSchema,
    /** `null` lo quita. */
    codigoBarras: CodigoBarrasSchema.nullable(),
    presentacion: PresentacionSchema.nullable(),
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

/**
 * Fijar el stock mínimo de un producto (B9-5). Es de quien recibe la mercancía (`inventario.entrada`),
 * no del catálogo: no cambia lo que se cobra. `null` quita el mínimo (solo avisa al agotarse).
 */
export const FijarMinimoCommandSchema = z.strictObject({
  productId: z.uuid("Producto desconocido"),
  minimo: z.number().int("Unidades enteras").min(0, "El mínimo no puede ser negativo").max(1_000_000, "Mínimo desmesurado").nullable(),
});
export type FijarMinimoCommand = z.infer<typeof FijarMinimoCommandSchema>;
