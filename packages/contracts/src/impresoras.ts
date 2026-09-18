/**
 * Las impresoras del local — F1-12, F6-09b, ADR-015 y DEC-8.
 *
 * Una impresora en red **es un dispositivo en la red**: si alguien del local
 * puede alcanzarla, puede imprimir en la cocina. Por eso aquí no hay un campo
 * de texto libre para «la dirección»: hay una IP validada, un puerto, y la
 * constancia de que está en la VLAN de hardware con IP fija (§7.1, T4). Un
 * dato mal puesto aquí no es un error de pantalla, es una comanda que nadie ve.
 *
 * El ancho es **configuración por estación** y no una decisión de una vez
 * (DEC-8): la impresora que compró el cliente admite los dos, y las plantillas
 * de 58 y 80 mm se construyen ambas.
 *
 * Lo que este contrato NO hace: imprimir. La cola con sus estados
 * `PENDIENTE → ENVIADO → CONFIRMADO | FALLIDO` es de ADR-015 y vive en el
 * servidor; aquí solo está **a qué aparato se le habla y para qué**.
 */
import { z } from "zod";
import { IdSchema } from "./primitives.ts";

/**
 * Para qué sirve cada impresora.
 *
 * Son dos oficios distintos y se confunden con facilidad: la de cocina saca
 * comandas para que alguien cocine, la de caja saca recibos y documentos
 * fiscales. Una comanda en el rollo de la caja no la ve la cocina.
 */
export const OficioImpresoraSchema = z.enum(["COCINA", "CAJA", "BARRA"]);
export type OficioImpresora = z.infer<typeof OficioImpresoraSchema>;

/** Los dos anchos de rollo que existen en este negocio (DEC-8). */
export const AnchoPapelSchema = z.union([z.literal(58), z.literal(80)]);
export type AnchoPapel = z.infer<typeof AnchoPapelSchema>;

/**
 * IPv4 de la red local.
 *
 * Solo rangos privados: una impresora con IP pública es una impresora
 * expuesta a internet, que es justo lo que ADR-015 prohíbe. Si algún día hace
 * falta otra cosa, se cambia aquí y a la vista de todos (§7.6).
 */
export const IpLocalSchema = z
  .string()
  .trim()
  .regex(
    /^(10\.(\d{1,3}\.){2}\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/,
    "IP de red local: 192.168.x.x, 10.x.x.x o 172.16-31.x.x",
  )
  .refine((ip) => ip.split(".").every((o) => Number(o) <= 255), "Cada número va de 0 a 255");

export const ImpresoraSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(2, "Ponle un nombre que se reconozca").max(40),
  oficio: OficioImpresoraSchema,
  ip: IpLocalSchema,
  /** 9100 es el puerto de impresión directa (ADR-015). Se deja cambiar. */
  puerto: z.number().int().min(1).max(65_535),
  ancho: AnchoPapelSchema,
  /**
   * Que esté en la VLAN de hardware con IP fija. No es decorativo: sin las dos
   * cosas, cualquiera en la red del local imprime en la cocina, y la IP se
   * pierde al reiniciar el router (ADR-015, contrapartida).
   */
  enVlanDeHardware: z.boolean(),
  ipFija: z.boolean(),
  activa: z.boolean(),
});
export type ImpresoraDto = z.infer<typeof ImpresoraSchema>;

/**
 * Las impresoras del local.
 *
 * La regla que importa: **si hay cocina, tiene que haber una impresora de
 * cocina activa**… o decirse que no la hay. Eso último es `sinImpresoraDeCocina`,
 * y es deliberado: ADR-015 acepta operar sin papel —el KDS en pantalla es la
 * fuente de verdad— pero exige que sea una decisión escrita, no un descuido.
 */
export const ImpresorasSchema = z
  .object({
    impresoras: z.array(ImpresoraSchema),
    /** El local opera sin comanda en papel, a propósito (ADR-015). */
    sinImpresoraDeCocina: z.boolean(),
  })
  .refine((c) => new Set(c.impresoras.map((i) => i.id)).size === c.impresoras.length, {
    message: "Dos impresoras no pueden compartir identificador",
    path: ["impresoras"],
  })
  .refine(
    (c) =>
      new Set(c.impresoras.map((i) => `${i.ip}:${i.puerto}`)).size === c.impresoras.length,
    {
      // Dos nombres para el mismo aparato: al fallar uno, el otro parece sano.
      message: "Ya hay una impresora en esa dirección y ese puerto",
      path: ["impresoras"],
    },
  )
  .refine(
    (c) => c.sinImpresoraDeCocina || c.impresoras.some((i) => i.oficio === "COCINA" && i.activa),
    {
      message:
        "Sin impresora de cocina activa, dilo explícitamente: el KDS pasa a ser la única fuente",
      path: ["impresoras"],
    },
  )
  .refine((c) => c.impresoras.every((i) => !i.activa || (i.enVlanDeHardware && i.ipFija)), {
    // Fail-closed: una impresora sin las dos garantías no se enciende.
    message: "Una impresora activa va en la VLAN de hardware y con IP fija (ADR-015)",
    path: ["impresoras"],
  });
export type ImpresorasDto = z.infer<typeof ImpresorasSchema>;

/**
 * Los cambios. Una impresora se retira —es un aparato, no un asiento
 * contable—, pero retirar la de cocina con el local imprimiendo comandas lo
 * impide la regla de arriba, no un `if` de la pantalla.
 */
export const ImpresoraCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("AÑADIR"), impresora: ImpresoraSchema }),
  z.strictObject({ kind: z.literal("EDITAR"), impresora: ImpresoraSchema }),
  z.strictObject({ kind: z.literal("RETIRAR"), impresoraId: IdSchema }),
  z.strictObject({ kind: z.literal("ACTIVAR"), impresoraId: IdSchema, activa: z.boolean() }),
  z.strictObject({ kind: z.literal("SIN_COCINA"), sinImpresoraDeCocina: z.boolean() }),
]);
export type ImpresoraCommand = z.infer<typeof ImpresoraCommandSchema>;
