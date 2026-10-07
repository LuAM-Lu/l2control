/**
 * Las categorías del catálogo como lista propia — T-10, M-24.
 *
 * El local administra su lista: la crea, la renombra (y con ella cambia en sus productos), une dos en
 * una (los productos de la que se va pasan a la otra) y retira una vacía. Nace con unas de arranque.
 * Un nombre que solo cambia en mayúsculas, acentos o espacios es la misma categoría.
 */
import { z } from "zod";
import { CategoriaProductoSchema } from "./productos.ts";

export const CategoriaCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CREAR"), nombre: CategoriaProductoSchema }),
  z.strictObject({ kind: z.literal("RENOMBRAR"), id: z.uuid("Categoría desconocida"), nombre: CategoriaProductoSchema }),
  /** Los productos de `id` pasan a `en`, y `id` se retira. */
  z
    .strictObject({ kind: z.literal("UNIR"), id: z.uuid("Categoría desconocida"), en: z.uuid("Elige en cuál se une") })
    .refine((c) => c.id !== c.en, { message: "Elige otra categoría", path: ["en"] }),
  /** Solo una sin productos: la que tiene, se une a otra. */
  z.strictObject({ kind: z.literal("RETIRAR"), id: z.uuid("Categoría desconocida") }),
]);
export type CategoriaCommand = z.infer<typeof CategoriaCommandSchema>;
