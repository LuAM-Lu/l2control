/**
 * El directorio de familias hasta B4-1: **vacío**, no inventado.
 *
 * Hasta el 2026-09-26 había familias de ejemplo con nombres y teléfonos. Se quitaron a pedido del
 * cliente. Las familias que se registren en la entrada viven en memoria de la sesión hasta B4-1,
 * que las guarda en la base y borra este archivo.
 */
import { DirectorioRepresentantesSchema, type DirectorioRepresentantesDto } from "@l2/contracts";

export const DIRECTORIO_DEMO: DirectorioRepresentantesDto = DirectorioRepresentantesSchema.parse({ representantes: [] });
