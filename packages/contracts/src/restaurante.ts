/**
 * Contratos del restaurante: el plano de mesas y la carta — F6-01, F6-03.
 *
 * El número de mesas y sus sillas son **datos**, no constantes del código
 * (criterio de F6-01): DEC-7 habla de 7 a 10 mesas de 4 a 6 sillas, y el
 * relevamiento en sitio (F0-03) dirá cuántas son. La carta, igual: sus
 * precios reales llegan con F0-04.
 */
import { z } from "zod";
import { IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/**
 * Dónde está una mesa **en el local**, no en la pantalla — V3, D11.
 *
 * En CENTÍMETROS desde la esquina superior izquierda, y el centro de la mesa,
 * no su esquina: así girarla no la mueve de sitio. En unidades del local y no
 * en píxeles porque el mismo plano se pinta a 1366, en tablet y en móvil, y
 * porque las medidas reales del relevamiento (F0-03) entran tal cual.
 */
export const FormaMesaSchema = z.enum(["REDONDA", "CUADRADA", "RECTANGULAR"]);
export type FormaMesa = z.infer<typeof FormaMesaSchema>;

const Centimetros = z.number().int().min(0).max(5000);

export const DiningTableSchema = z.object({
  id: IdSchema,
  /**
   * Lo que se lee en la mesa y en la comanda: «3», «T1».
   *
   * Es una ETIQUETA, no la identidad: renumerar una mesa no reescribe los
   * pedidos ya cobrados, que guardaron el número que se imprimió ese día.
   */
  label: z.string().trim().min(1).max(20),
  zone: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(20),
  shape: FormaMesaSchema,
  /** Centro de la mesa, en cm desde la esquina superior izquierda del local. */
  x: Centimetros,
  y: Centimetros,
  /** Tamaño en cm. En una mesa redonda, el diámetro va en los dos. */
  width: Centimetros,
  height: Centimetros,
  /** Giro en grados. Solo cambia cómo se dibuja, nunca dónde está. */
  rotation: z.number().int().min(0).max(359).default(0),
  /**
   * Cuándo se retiró del salón. **Una mesa no se borra** (regla 5): los pedidos
   * y los cobros del pasado la nombran, y sin ella ese historial diría «mesa
   * desconocida». Retirada no se pinta en servicio ni se puede abrir.
   */
  retiredAt: TimestampSchema.optional(),
});
export type DiningTableDto = z.infer<typeof DiningTableSchema>;

export const FloorPlanSchema = z
  .array(DiningTableSchema)
  .min(1, "Un plano sin mesas no sirve para atender")
  .refine((mesas) => new Set(mesas.map((m) => m.id)).size === mesas.length, "Dos mesas con el mismo id")
  .refine(
    // Las retiradas conservan su número para el historial; solo las del salón
    // tienen que ser distintas entre sí, o la cocina no sabría a cuál llevar el plato.
    (mesas) => {
      const enSalon = mesas.filter((m) => !m.retiredAt).map((m) => m.label);
      return new Set(enSalon).size === enSalon.length;
    },
    "Dos mesas del salón con el mismo número: la cocina no sabría a cuál llevar el plato",
  );
export type FloorPlanDto = z.infer<typeof FloorPlanSchema>;

/**
 * Lo que no se mueve: paredes, puertas, el parque, la caja y la cocina.
 *
 * Va en su propia capa porque se edita pocas veces y porque en servicio nadie
 * debe poder tocarla (§2.3 de UX-MEJORAS: capa bloqueada).
 */
export const ElementoFijoSchema = z.object({
  id: IdSchema,
  kind: z.enum(["PARED", "PUERTA", "PARQUE", "CAJA", "COCINA", "BARRA"]),
  /** Esquina superior izquierda, en cm. Aquí sí es la esquina: son rectángulos. */
  x: Centimetros,
  y: Centimetros,
  width: Centimetros,
  height: Centimetros,
  /** Lo que se escribe encima, si lleva algo: «Parque», «Caja». */
  label: z.string().trim().max(40).optional(),
  /**
   * Contorno propio, en cm, para lo que no es un rectángulo: una barra en L es
   * UNA pieza, no dos cajas pegadas. Si viene, manda sobre el rectángulo, que
   * pasa a ser solo su caja envolvente (para colocar el rótulo).
   */
  points: z.array(z.object({ x: Centimetros, y: Centimetros })).min(3).max(24).optional(),
});
export type ElementoFijoDto = z.infer<typeof ElementoFijoSchema>;

/**
 * El plano del local: sus medidas, sus mesas y su estructura — F6-01, V3.
 *
 * Fail-closed: una mesa fuera de las paredes o dos mesas encima no son un
 * plano que se pueda publicar. Se comprueba aquí, en el contrato, para que el
 * editor (V4) y el servidor apliquen la misma regla sin repetirla.
 */
export const PlanoLocalSchema = z
  .object({
    /** Medidas del local en cm. */
    width: Centimetros,
    height: Centimetros,
    tables: FloorPlanSchema,
    fixtures: z.array(ElementoFijoSchema),
  })
  .superRefine((plano, ctx) => {
    const caja = (m: { x: number; y: number; width: number; height: number }) => ({
      x1: m.x - m.width / 2,
      y1: m.y - m.height / 2,
      x2: m.x + m.width / 2,
      y2: m.y + m.height / 2,
    });
    plano.fixtures.forEach((f, i) => {
      for (const p of f.points ?? []) {
        if (p.x > plano.width || p.y > plano.height) {
          ctx.addIssue({ code: "custom", path: ["fixtures", i], message: `${f.label ?? f.kind} se sale del local` });
          return;
        }
      }
    });
    const enSalon = plano.tables.filter((m) => !m.retiredAt);
    if (new Set(enSalon.map((m) => m.label)).size !== enSalon.length) {
      ctx.addIssue({ code: "custom", path: ["tables"], message: "Dos mesas en el salón con el mismo número" });
    }
    enSalon.forEach((m, i) => {
      const c = caja(m);
      if (c.x1 < 0 || c.y1 < 0 || c.x2 > plano.width || c.y2 > plano.height) {
        ctx.addIssue({ code: "custom", path: ["tables", i], message: `La mesa ${m.label} se sale del local` });
      }
    });
    for (let i = 0; i < enSalon.length; i += 1) {
      for (let j = i + 1; j < enSalon.length; j += 1) {
        const a = caja(enSalon[i]!);
        const b = caja(enSalon[j]!);
        if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) {
          ctx.addIssue({
            code: "custom",
            path: ["tables", j],
            message: `Las mesas ${enSalon[i]!.label} y ${enSalon[j]!.label} están una encima de otra`,
          });
        }
      }
    }
  });
export type PlanoLocalDto = z.infer<typeof PlanoLocalSchema>;

export const MenuItemSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  /** Precio de carta. Un plato a precio cero sería una cortesía, y eso exige autorización (F6-14). */
  price: MoneySchema.refine((m) => BigInt(m.minor) > 0n, "Un plato de la carta tiene precio"),
  /** Si se agota, sigue en la carta pero no se puede pedir. */
  available: z.boolean(),
});
export type MenuItemDto = z.infer<typeof MenuItemSchema>;

export const MenuSchema = z
  .array(MenuItemSchema)
  .min(1)
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, "Dos platos con el mismo id");
export type MenuDto = z.infer<typeof MenuSchema>;
