/**
 * La semilla del local — B7-2, M-24.
 *
 * Lo tedioso de teclear, en un archivo: se descarga de un local (Ajustes → Semilla) y se carga en otro,
 * que solo AÑADE lo que le falta y nunca pisa lo que ya tiene. Lleva los ajustes de la sucursal, las
 * tarifas y paquetes del parque, las categorías y la carta con sus precios, el plano del restaurante y
 * los paquetes de cumpleaños. Nada más: ni personas, ni medios de pago, ni impuestos, ni existencias.
 *
 * Los identificadores no viajan (cada local tiene los suyos): lo que un paquete de cumpleaños incluye
 * se nombra por el nombre del producto, y el local que la carga lo busca en su catálogo.
 */
import { z } from "zod";
import { TimestampSchema } from "./primitives.ts";
import { TaxCodeDelCatalogoSchema } from "./impuestos.ts";
import { CategoriaProductoSchema, CodigoBarrasSchema, NombreProductoSchema, PrecioMinorSchema, PresentacionSchema, TipoProductoSchema } from "./productos.ts";
import { TarifarioSchema } from "./park.ts";
import { PlanoLocalSchema } from "./restaurante.ts";
import { PaqueteEventoSchema } from "./reservas.ts";
import { AjustesSucursalSchema } from "./sucursal.ts";

/** Un producto de la carta o del mostrador, con el precio que regía al descargarla. */
export const ProductoDeSemillaSchema = z.strictObject({
  nombre: NombreProductoSchema,
  categoria: CategoriaProductoSchema,
  tipo: TipoProductoSchema,
  taxCode: TaxCodeDelCatalogoSchema,
  precioMinor: PrecioMinorSchema,
  presentacion: PresentacionSchema.nullable(),
  codigoBarras: CodigoBarrasSchema.nullable(),
  enCarta: z.boolean(),
  minimo: z.number().int().min(0).max(1_000_000).nullable(),
});
export type ProductoDeSemillaDto = z.infer<typeof ProductoDeSemillaSchema>;

/** Un paquete de cumpleaños sin su id: lo que incluye va por el nombre del producto. */
export const PaqueteDeSemillaSchema = PaqueteEventoSchema.omit({ id: true, incluye: true }).extend({
  incluye: z
    .array(z.strictObject({ producto: NombreProductoSchema, cantidad: z.number().int().min(1).max(999) }))
    .max(30, "Hasta 30 productos por paquete"),
});

export const SemillaSchema = z.strictObject({
  formato: z.literal("l2-semilla", { error: "Ese archivo no es una semilla de L2 Control" }),
  version: z.literal(1, { error: "Esa semilla es de una versión que este servidor no conoce" }),
  exportadaEn: TimestampSchema,
  /** El local de donde salió, para reconocerla. */
  local: z.string().trim().min(1).max(80),
  ajustes: AjustesSucursalSchema.nullable(),
  tarifario: TarifarioSchema.nullable(),
  categorias: z.array(CategoriaProductoSchema).max(200),
  productos: z.array(ProductoDeSemillaSchema).max(2000),
  plano: PlanoLocalSchema.nullable(),
  cumpleanos: z
    .object({
      anticipoBps: z.number().int().min(1).max(10_000),
      paquetes: z.array(PaqueteDeSemillaSchema).max(30),
    })
    .nullable(),
});
export type SemillaDto = z.infer<typeof SemillaSchema>;

/** Las partes de una semilla, en el orden en que se cargan. */
export const ParteDeSemillaSchema = z.enum(["AJUSTES", "TARIFARIO", "CATEGORIAS", "PRODUCTOS", "PLANO", "CUMPLEANOS"]);
export type ParteDeSemilla = z.infer<typeof ParteDeSemillaSchema>;

/**
 * Qué pasa (o pasó) con cada parte en el local que la carga:
 *  · CARGA      falta aquí y entra (con `cuantos`, si es una lista);
 *  · YA_ESTA    el local ya la tiene y no se toca;
 *  · NO_TRAE    la semilla no la trae (el local de origen tampoco la tenía).
 * `avisos`: lo que se salta dentro de una parte que sí carga (un producto con un código ya usado aquí).
 */
export const InformeDeSemillaSchema = z.object({
  local: z.string(),
  exportadaEn: TimestampSchema,
  cargada: z.boolean(),
  partes: z.array(
    z.object({
      parte: ParteDeSemillaSchema,
      estado: z.enum(["CARGA", "YA_ESTA", "NO_TRAE"]),
      detalle: z.string(),
      cuantos: z.number().int().min(0).nullable(),
      avisos: z.array(z.string()),
    }),
  ),
});
export type InformeDeSemillaDto = z.infer<typeof InformeDeSemillaSchema>;

/** Revisar o cargar una semilla: `cargar: false` solo dice qué pasaría, sin escribir nada. */
export const CargarSemillaCommandSchema = z.strictObject({
  semilla: z.unknown(),
  cargar: z.boolean(),
});
export type CargarSemillaCommand = z.infer<typeof CargarSemillaCommandSchema>;
