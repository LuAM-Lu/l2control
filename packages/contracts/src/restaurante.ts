/**
 * Contratos del restaurante: el plano de mesas y la carta — F6-01, F6-03.
 *
 * El número de mesas y sus sillas son **datos**, no constantes del código
 * (criterio de F6-01): DEC-7 habla de 7 a 10 mesas de 4 a 6 sillas, y el
 * relevamiento en sitio (F0-03) dirá cuántas son. La carta, igual: sus
 * precios reales llegan con F0-04.
 */
import { z } from "zod";
import { IdSchema, MoneySchema } from "./primitives.ts";

export const DiningTableSchema = z.object({
  id: IdSchema,
  /** Lo que se lee en la mesa y en la comanda: «3», «T1». */
  label: z.string().trim().min(1).max(20),
  zone: z.string().trim().min(1).max(40),
  seats: z.number().int().min(1).max(20),
});
export type DiningTableDto = z.infer<typeof DiningTableSchema>;

export const FloorPlanSchema = z
  .array(DiningTableSchema)
  .min(1, "Un plano sin mesas no sirve para atender")
  .refine((mesas) => new Set(mesas.map((m) => m.id)).size === mesas.length, "Dos mesas con el mismo id")
  .refine(
    (mesas) => new Set(mesas.map((m) => m.label)).size === mesas.length,
    "Dos mesas con el mismo número: la cocina no sabría a cuál llevar el plato",
  );
export type FloorPlanDto = z.infer<typeof FloorPlanSchema>;

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
