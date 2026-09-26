/**
 * Lo que devuelve un comando del servidor (publicar, cobrar, abrir turno…) — B0-5.
 *
 * Un comando rechazado NO lanza hacia la pantalla: devuelve por qué, con un motivo que la
 * pantalla sabe pintar. Lanzar se reserva para lo inesperado, que la pantalla muestra como
 * error genérico. Así ningún rechazo queda oculto (CLAUDE.md: errores visibles).
 */
import { z } from "zod";

export const MotivoDeRechazoSchema = z.enum([
  /** Los datos no cumplen el contrato. `problemas` dice dónde, campo por campo. */
  "INVALIDO",
  /** Otra persona cambió lo mismo a la vez. Se vuelve a cargar y se decide de nuevo. */
  "CONFLICTO",
  /** Quien lo pide no tiene permiso. */
  "NO_PERMITIDO",
  /** El servidor no puede hacerlo ahora (falta configuración, la sucursal no existe…). */
  "NO_DISPONIBLE",
]);
export type MotivoDeRechazo = z.infer<typeof MotivoDeRechazoSchema>;

/** Un problema de validación: la ruta del campo y el mensaje del contrato. */
export const ProblemaSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type Problema = z.infer<typeof ProblemaSchema>;

export type Rechazo = Readonly<{
  ok: false;
  motivo: MotivoDeRechazo;
  /** Para la persona, en español y sin datos sensibles. */
  mensaje: string;
  problemas?: readonly Problema[];
}>;

export type Resultado<T> = Readonly<{ ok: true; valor: T }> | Rechazo;

/** Los problemas de un `safeParse` fallido, en la forma del cable. */
export function problemasDe(error: z.ZodError): Problema[] {
  return error.issues.map((i) => ({
    path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
    message: i.message,
  }));
}
