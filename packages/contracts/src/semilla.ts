/**
 * La semilla del local — B7-2, M-24; con casillas, B7-7 (M-29).
 *
 * Lo tedioso de teclear, en un archivo: se descarga de un local (Ajustes → Sistema → Semilla) y se carga en otro,
 * que solo AÑADE lo que le falta y nunca pisa lo que ya tiene. Lleva los ajustes de la sucursal, las
 * tarifas y paquetes del parque, las categorías y la carta con sus precios, el plano del restaurante y
 * los paquetes de cumpleaños; desde la versión 2 (B7-7), también los medios de pago (con los datos que el
 * cliente ve para pagar), los descuentos, los impuestos y las impresoras. Nunca personas, PIN, llaves,
 * equipos ni existencias: se dan de alta (o se cuentan) en el local. Es el camino de la corrida limpia de
 * producción: base nueva y la semilla, sin sacar partes de un respaldo.
 *
 * Quien la descarga o la carga elige qué va con casillas (por parte y por elemento): la semilla recortada
 * es otra semilla, y el servidor la revalida entera.
 *
 * Los identificadores no viajan (cada local tiene los suyos): lo que un paquete de cumpleaños incluye
 * se nombra por el nombre del producto, y el local que la carga lo busca en su catálogo.
 */
import { z } from "zod";
import { FechaSchema, TimestampSchema } from "./primitives.ts";
import { BasisPointsSchema, ImpuestoSchema, TaxCodeDelCatalogoSchema, TratoProgramableSchema } from "./impuestos.ts";
import { CodigoMedioSchema, DatosPagoMovilSchema, DatosZelleSchema, MonedaSchema, TipoDatosSchema } from "./medios.ts";
import { AlcanceDescuentoSchema, TipoReglaDescuentoSchema, ValorDescuentoSchema } from "./descuentos.ts";
import { DatosImpresoraSchema } from "./impresoras.ts";
import { AreaDeProductoSchema, CategoriaProductoSchema, CodigoBarrasSchema, NombreProductoSchema, PrecioMinorSchema, PresentacionSchema, TipoProductoSchema } from "./productos.ts";
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
  /** En qué comanda sale, si no es la de su tipo (B6-10). Una semilla de antes no la trae. */
  area: AreaDeProductoSchema.optional(),
});
export type ProductoDeSemillaDto = z.infer<typeof ProductoDeSemillaSchema>;

/** Un paquete de cumpleaños sin su id: lo que incluye va por el nombre del producto. */
export const PaqueteDeSemillaSchema = PaqueteEventoSchema.omit({ id: true, incluye: true }).extend({
  incluye: z
    .array(z.strictObject({ producto: NombreProductoSchema, cantidad: z.number().int().min(1).max(999) }))
    .max(30, "Hasta 30 productos por paquete"),
});

/** Un medio de pago (B7-7): lo que se configura de él, por su código estable. */
export const MedioDeSemillaSchema = z.strictObject({
  code: CodigoMedioSchema,
  label: z.string().trim().min(2).max(24),
  currency: MonedaSchema,
  triggersIgtf: z.boolean(),
  canGiveChange: z.boolean(),
  datos: TipoDatosSchema.nullable(),
  activo: z.boolean(),
});
export type MedioDeSemillaDto = z.infer<typeof MedioDeSemillaSchema>;

/**
 * Los medios de pago del local (B7-7) y los datos que el cliente ve para pagar (el Pago Móvil, el Zelle y los
 * terminales del punto). Son del local, no de un cliente: viajan para no teclearlos otra vez.
 */
export const MediosDeSemillaSchema = z.strictObject({
  medios: z.array(MedioDeSemillaSchema).max(40),
  pagoMovil: DatosPagoMovilSchema.nullable(),
  zelle: DatosZelleSchema.nullable(),
  terminales: z.array(z.strictObject({ name: z.string().trim().min(2).max(40), bank: z.string().trim().min(2).max(40) })).max(40),
});
export type MediosDeSemillaDto = z.infer<typeof MediosDeSemillaSchema>;

/** Una regla de descuento vigente (B7-7), sin su id ni quién la creó. Las familias VIP no viajan: son clientes. */
export const DescuentoDeSemillaSchema = z.strictObject({
  nombre: z.string().trim().min(2).max(40),
  tipo: TipoReglaDescuentoSchema,
  valor: ValorDescuentoSchema,
  alcance: AlcanceDescuentoSchema,
  medio: CodigoMedioSchema.nullable(),
  desde: FechaSchema,
  hasta: FechaSchema.nullable(),
});
export type DescuentoDeSemillaDto = z.infer<typeof DescuentoDeSemillaSchema>;

/**
 * Una alícuota (B7-7): la que rige al descargarla (`desde: null`, en el otro local rige desde que se carga) o una
 * programada para un día que todavía no llegó.
 */
export const ImpuestoDeSemillaSchema = z
  .strictObject({
    impuesto: ImpuestoSchema,
    code: TratoProgramableSchema.nullable(),
    basisPoints: BasisPointsSchema,
    desde: FechaSchema.nullable(),
  })
  .refine((v) => (v.impuesto === "IVA") === (v.code !== null), { message: "El IVA lleva su trato; el IGTF, ninguno", path: ["code"] });
export type ImpuestoDeSemillaDto = z.infer<typeof ImpuestoDeSemillaSchema>;

/** Las versiones del formato que este servidor sabe leer: la 1 (B7-2) no traía medios, descuentos, impuestos ni impresoras. */
export const VERSION_DE_SEMILLA = 2;

export const SemillaSchema = z.strictObject({
  formato: z.literal("l2-semilla", { error: "Ese archivo no es una semilla de L2 Control" }),
  version: z.union([z.literal(1), z.literal(2)], { error: "Esa semilla es de una versión que este servidor no conoce" }),
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
  // Desde la versión 2 (B7-7). Una semilla de la versión 1 no las trae: `null`.
  medios: MediosDeSemillaSchema.nullable().default(null),
  descuentos: z.array(DescuentoDeSemillaSchema).max(100).nullable().default(null),
  impuestos: z.array(ImpuestoDeSemillaSchema).max(20).nullable().default(null),
  impresoras: z.array(DatosImpresoraSchema).max(10).nullable().default(null),
});
export type SemillaDto = z.infer<typeof SemillaSchema>;

/** Las partes de una semilla, en el orden en que se cargan (y se enseñan). */
export const ParteDeSemillaSchema = z.enum([
  "AJUSTES",
  "IMPUESTOS",
  "MEDIOS",
  "TARIFARIO",
  "CATEGORIAS",
  "PRODUCTOS",
  "DESCUENTOS",
  "PLANO",
  "CUMPLEANOS",
  "IMPRESORAS",
]);
export type ParteDeSemilla = z.infer<typeof ParteDeSemillaSchema>;

/**
 * Qué pasa (o pasó) con cada parte en el local que la carga:
 *  · CARGA      falta aquí y entra (con `cuantos`, si es una lista);
 *  · YA_ESTA    el local ya la tiene y no se toca;
 *  · NO_TRAE    la semilla no la trae (el local de origen tampoco la tenía).
 * `avisos`: lo que se salta dentro de una parte que sí carga (un producto con un código ya usado aquí).
 * `elementos`: en una parte que es una lista, los que entrarían, por su nombre (los mismos con que se marcan las
 * casillas al cargar, B7-7).
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
      elementos: z.array(z.string()).default([]),
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

/* ─────────────────────────────────────────────── las casillas (B7-7) */

/** Las partes que son una lista: cada elemento lleva su casilla. Las demás (ajustes, tarifas, plano) van enteras. */
export const PARTES_CON_ELEMENTOS = ["IMPUESTOS", "MEDIOS", "CATEGORIAS", "PRODUCTOS", "DESCUENTOS", "CUMPLEANOS", "IMPRESORAS"] as const satisfies readonly ParteDeSemilla[];
export type ParteConElementos = (typeof PARTES_CON_ELEMENTOS)[number];

export const DATOS_PAGO_MOVIL = "Datos de Pago Móvil";
export const DATOS_ZELLE = "Datos de Zelle";
const TRATO: Readonly<Record<string, string>> = { GENERAL: "general", REDUCIDA: "reducido" };

/** «IVA general 16 %», «IGTF 0 %», «IVA general 15 % desde 2026-11-01»: cómo se nombra una alícuota en las casillas. */
export function nombreDeImpuesto(i: Pick<ImpuestoDeSemillaDto, "impuesto" | "code" | "basisPoints" | "desde">): string {
  const porcentaje = `${(i.basisPoints / 100).toLocaleString("es-VE", { maximumFractionDigits: 2 })} %`;
  const que = i.impuesto === "IVA" ? `IVA ${TRATO[i.code ?? ""] ?? ""}`.trim() : i.impuesto;
  return `${que} ${porcentaje}${i.desde ? ` desde ${i.desde}` : ""}`;
}

/** «Terminal Banesco 1»: cómo se nombra un terminal del punto en las casillas. */
export const nombreDeTerminal = (t: { name: string }) => `Terminal ${t.name}`;

/** Los elementos de cada parte que es una lista, por su nombre: lo que se marca o se desmarca. */
export function elementosDeSemilla(s: SemillaDto): Record<ParteConElementos, string[]> {
  return {
    IMPUESTOS: (s.impuestos ?? []).map(nombreDeImpuesto),
    MEDIOS: s.medios
      ? [
          ...s.medios.medios.map((m) => m.label),
          ...(s.medios.pagoMovil ? [DATOS_PAGO_MOVIL] : []),
          ...(s.medios.zelle ? [DATOS_ZELLE] : []),
          ...s.medios.terminales.map(nombreDeTerminal),
        ]
      : [],
    CATEGORIAS: s.categorias,
    PRODUCTOS: s.productos.map((p) => p.nombre),
    DESCUENTOS: (s.descuentos ?? []).map((d) => d.nombre),
    CUMPLEANOS: (s.cumpleanos?.paquetes ?? []).map((p) => p.name),
    IMPRESORAS: (s.impresoras ?? []).map((i) => i.nombre),
  };
}

/** Lo que se deja fuera: partes enteras y, de las que son listas, elementos por su nombre. */
export type FueraDeSemilla = Readonly<{ partes: readonly ParteDeSemilla[]; elementos: Readonly<Partial<Record<ParteConElementos, readonly string[]>>> }>;

/**
 * La semilla sin lo que se dejó fuera (B7-7): una parte desmarcada no viaja (`null`, o vacía si es una lista que
 * no admite nulo) y de una lista solo quedan los elementos marcados. Una lista que se queda sin nada, tampoco.
 * La semilla recortada es otra semilla válida: el servidor la revalida entera al cargarla.
 */
export function recortarSemilla(s: SemillaDto, fuera: FueraDeSemilla): SemillaDto {
  const sin = new Set(fuera.partes);
  const quedan = (p: ParteConElementos) => {
    const quitar = new Set(fuera.elementos[p] ?? []);
    return (nombre: string) => !sin.has(p) && !quitar.has(nombre);
  };
  const impuesto = quedan("IMPUESTOS");
  const medio = quedan("MEDIOS");
  const categoria = quedan("CATEGORIAS");
  const producto = quedan("PRODUCTOS");
  const descuento = quedan("DESCUENTOS");
  const paquete = quedan("CUMPLEANOS");
  const impresora = quedan("IMPRESORAS");
  const noVacia = <T,>(lista: T[]): T[] | null => (lista.length > 0 ? lista : null);

  const medios = s.medios && !sin.has("MEDIOS")
    ? {
        medios: s.medios.medios.filter((m) => medio(m.label)),
        pagoMovil: s.medios.pagoMovil && medio(DATOS_PAGO_MOVIL) ? s.medios.pagoMovil : null,
        zelle: s.medios.zelle && medio(DATOS_ZELLE) ? s.medios.zelle : null,
        terminales: s.medios.terminales.filter((t) => medio(nombreDeTerminal(t))),
      }
    : null;
  const paquetes = s.cumpleanos ? s.cumpleanos.paquetes.filter((p) => paquete(p.name)) : [];
  return {
    ...s,
    ajustes: sin.has("AJUSTES") ? null : s.ajustes,
    tarifario: sin.has("TARIFARIO") ? null : s.tarifario,
    plano: sin.has("PLANO") ? null : s.plano,
    categorias: s.categorias.filter(categoria),
    productos: s.productos.filter((p) => producto(p.nombre)),
    cumpleanos: s.cumpleanos && paquetes.length > 0 ? { ...s.cumpleanos, paquetes } : null,
    medios: medios && (medios.medios.length > 0 || medios.pagoMovil || medios.zelle || medios.terminales.length > 0) ? medios : null,
    descuentos: noVacia((s.descuentos ?? []).filter((d) => descuento(d.nombre))),
    impuestos: noVacia((s.impuestos ?? []).filter((i) => impuesto(nombreDeImpuesto(i)))),
    impresoras: noVacia((s.impresoras ?? []).filter((i) => impresora(i.nombre))),
  };
}
