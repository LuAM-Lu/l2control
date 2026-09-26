/**
 * El entorno se valida al arrancar — §10.3: «si falta una variable o un valor es
 * inválido, el proceso NO arranca. Nunca un valor por defecto silencioso en producción».
 *
 * El error nombra cada variable y qué le pasa, y NUNCA su valor: las variables de
 * entorno son justamente donde viven las contraseñas, y este mensaje acaba en un log.
 */
import { z } from "zod";

export class EntornoInvalido extends Error {
  readonly problemas: readonly string[];

  constructor(problemas: string[]) {
    super(`El entorno no es válido; el proceso no arranca:\n${problemas.map((p) => `  · ${p}`).join("\n")}`);
    this.name = "EntornoInvalido";
    this.problemas = problemas;
  }
}

/**
 * Valida `fuente` (por defecto `process.env`) contra `esquema` y devuelve el entorno ya
 * tipado. Lanza `EntornoInvalido` con TODOS los problemas a la vez, no el primero: quien
 * despliega arregla el `.env` de una sola pasada.
 */
export function leerEntorno<E extends z.ZodType>(
  esquema: E,
  fuente: Record<string, string | undefined> = process.env,
): z.infer<E> {
  const resultado = esquema.safeParse(fuente);
  if (resultado.success) return resultado.data;

  const problemas = resultado.error.issues.map((i) => {
    const variable = i.path.map(String).join(".") || "(entorno)";
    const falta = i.path.length > 0 && fuente[String(i.path[0])] === undefined;
    return falta ? `${variable}: falta` : `${variable}: ${describir(i)}`;
  });
  throw new EntornoInvalido(problemas);
}

/** El motivo, sin el valor. Los mensajes de Zod pueden citar lo recibido: no se usan tal cual. */
function describir(problema: z.core.$ZodIssue): string {
  switch (problema.code) {
    case "invalid_format":
      return `no tiene el formato esperado (${problema.format})`;
    case "invalid_value":
      return `no es uno de los valores admitidos (${problema.values.map(String).join(", ")})`;
    case "too_small":
      return `demasiado corto (mínimo ${String(problema.minimum)})`;
    case "invalid_type":
      return `se esperaba ${problema.expected}`;
    default:
      return "valor inválido";
  }
}

/** Una URL de PostgreSQL. Reutilizable por cada proceso que declare su esquema de entorno. */
export const urlPostgres = z.url({ protocol: /^postgres(ql)?$/ });
/** Una URL de Valkey (habla el protocolo de Redis). */
export const urlValkey = z.url({ protocol: /^rediss?$/ });
export const nivelLog = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
