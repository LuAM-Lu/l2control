/**
 * Las entradas de mercancía — B9-3, F8-06, F8-01.
 *
 * Lo que llega de una vez: una compra a un proveedor (con su factura, si la hay) o una reposición
 * (lo que se trae del depósito, sin proveedor). Cada línea dice cuántos bultos de cuántas unidades y
 * lo que costó cada bulto, en dólares: se compra la caja de 24 y se vende la unidad. Una entrada no
 * se edita ni se borra; un error se corrige con otro movimiento (B9-4).
 *
 * El navegador dice qué llegó y a qué costo; el instante, quién lo recibe y la sucursal los pone el
 * servidor (ADR-017).
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";
import { CategoriaProductoSchema, CodigoBarrasSchema, NombreProductoSchema, PrecioMinorSchema, PresentacionSchema } from "./productos.ts";
import { TaxCodeDelCatalogoSchema } from "./impuestos.ts";

export const TipoEntradaSchema = z.enum(["COMPRA", "REPOSICION"], { error: "Elige si es una compra o una reposición" });
export type TipoEntrada = z.infer<typeof TipoEntradaSchema>;

/** El costo de un bulto en centavos de dólar y como texto: «1200» es $ 12,00. Cero vale (lo regalado). */
export const CostoMinorSchema = z.string().regex(/^\d{1,9}$/, "Un costo en centavos de dólar");

const cantidades = {
  bultos: z.number().int("Bultos enteros").min(1, "Al menos un bulto").max(10_000, "Hasta 10.000 bultos"),
  unidadesPorBulto: z.number().int("Unidades enteras").min(1, "Al menos una unidad por bulto").max(1_000, "Hasta 1.000 unidades por bulto"),
  costoBultoMinor: CostoMinorSchema,
};

/**
 * Un producto que llega por primera vez (B9-6, M-16): se da de alta en la misma entrada con su ficha
 * corta y nace a la venta con su stock y su costo. Siempre es un PRODUCTO (lo que se cuenta). Crearlo
 * es del catálogo: pide lo mismo que «Nuevo producto» en Productos.
 */
export const ProductoDeEntradaSchema = z.strictObject({
  nombre: NombreProductoSchema,
  categoria: CategoriaProductoSchema,
  taxCode: TaxCodeDelCatalogoSchema,
  precioMinor: PrecioMinorSchema,
  codigoBarras: CodigoBarrasSchema.optional(),
  presentacion: PresentacionSchema.optional(),
});
export type ProductoDeEntradaDto = z.infer<typeof ProductoDeEntradaSchema>;

/** Una línea: de un producto que ya existe, o de uno nuevo con su ficha corta. */
export const LineaEntradaSchema = z.union([
  z.strictObject({ productId: z.uuid("Producto desconocido"), ...cantidades }),
  z.strictObject({ nuevo: ProductoDeEntradaSchema, ...cantidades }),
]);
export type LineaEntradaDto = z.infer<typeof LineaEntradaSchema>;

/** Registrar una entrada. `idempotencyKey`: un doble clic no carga dos veces lo mismo. */
export const RegistrarEntradaCommandSchema = z
  .strictObject({
    idempotencyKey: z.uuid(),
    tipo: TipoEntradaSchema,
    proveedor: z.string().trim().min(2, "Nombre del proveedor demasiado corto").max(80, "Hasta 80 caracteres").optional(),
    factura: z.string().trim().min(1).max(40, "Hasta 40 caracteres").optional(),
    lineas: z.array(LineaEntradaSchema).min(1, "Añade al menos un producto").max(60, "Hasta 60 productos por entrada"),
  })
  .refine(
    (e) => {
      const ids = e.lineas.flatMap((l) => ("productId" in l ? [l.productId] : []));
      const nombres = e.lineas.flatMap((l) => ("nuevo" in l ? [l.nuevo.nombre.toLowerCase()] : []));
      const codigos = e.lineas.flatMap((l) => ("nuevo" in l && l.nuevo.codigoBarras ? [l.nuevo.codigoBarras] : []));
      return new Set(ids).size === ids.length && new Set(nombres).size === nombres.length && new Set(codigos).size === codigos.length;
    },
    { message: "Cada producto va una vez: suma sus bultos en una sola línea", path: ["lineas"] },
  );
export type RegistrarEntradaCommand = z.infer<typeof RegistrarEntradaCommandSchema>;

/** Una entrada ya registrada, como la lee la pantalla de entradas. */
export const EntradaSchema = z.object({
  id: IdSchema,
  tipo: TipoEntradaSchema,
  proveedor: z.string().nullable(),
  factura: z.string().nullable(),
  recibidaEn: TimestampSchema,
  recibidaPor: z.string().min(2),
  lineas: z.array(
    z.object({
      productId: IdSchema,
      nombre: z.string().min(1),
      bultos: z.number().int().min(1),
      unidadesPorBulto: z.number().int().min(1),
      unidades: z.number().int().min(1),
      costo: MoneySchema,
    }),
  ),
  total: MoneySchema,
});
export type EntradaDto = z.infer<typeof EntradaSchema>;

/** Las entradas recientes de la sucursal, de la más nueva a la más vieja. */
export const EntradasSchema = z.object({ entradas: z.array(EntradaSchema) });
export type EntradasDto = z.infer<typeof EntradasSchema>;
