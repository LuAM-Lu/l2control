/**
 * El logger del servidor — §10.2: JSON estructurado, con el contexto de la operación y
 * redacción activa. Todo lo que se escribe pasa por `redactar()`: el objeto, el mensaje,
 * los errores y el contexto de los hijos. No hay un camino que la salte.
 */
import { pino, type DestinationStream, type Logger as Pino } from "pino";
import { redactar, redactarTexto } from "./redaccion.ts";

export type NivelLog = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

/** El contexto que §10.2 pide en cada línea. Nada de esto es sensible; aun así se redacta. */
export interface ContextoLog {
  traceId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  deviceId?: string;
  businessDate?: string;
}

export type Logger = Pino;

export interface OpcionesLogger {
  /** Qué proceso escribe: `web`, `worker`… Va en cada línea. */
  servicio: string;
  nivel?: NivelLog;
  /** Por defecto, la salida estándar. Las pruebas pasan un colector. */
  destino?: DestinationStream;
}

export function crearLogger({ servicio, nivel = "info", destino }: OpcionesLogger): Logger {
  return blindarHijos(pino(
    {
      level: nivel,
      base: { servicio },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (etiqueta) => ({ level: etiqueta }),
        bindings: (contexto) => redactar(contexto) as Record<string, unknown>,
        log: (objeto) => redactar(objeto) as Record<string, unknown>,
      },
      hooks: {
        // El mensaje y los argumentos de interpolación también son texto libre.
        logMethod(argumentos, metodo) {
          const limpios = argumentos.map((a) => (typeof a === "string" ? redactarTexto(a) : redactar(a)));
          return metodo.apply(this, limpios as Parameters<typeof metodo>);
        },
      },
    },
    destino,
  ));
}

/**
 * pino NO pasa por `formatters.bindings` lo que se da a `child()`: solo el contexto base.
 * Sin esto, `log.child({ pin })` escribiría el PIN en cada línea del hijo (lo cazó la
 * prueba). Se parchea la raíz: en pino cada hijo hereda de su padre por prototipo, así
 * que hijos y nietos usan este mismo `child`, con `this` apuntando a quien lo llama.
 */
function blindarHijos(raiz: Pino): Pino {
  const crearHijo = raiz.child;
  const blindado = function (this: Pino, contexto: Record<string, unknown>, opciones?: unknown) {
    return crearHijo.call(this, redactar(contexto) as Record<string, unknown>, opciones as never);
  };
  raiz.child = blindado as unknown as Pino["child"];
  return raiz;
}

/** Un hijo del logger que lleva el contexto de la operación en cada línea. */
export function conContexto(logger: Logger, contexto: ContextoLog): Logger {
  return logger.child(contexto);
}
