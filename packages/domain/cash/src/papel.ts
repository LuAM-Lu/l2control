/**
 * La carga de lo anotado en papel — B3-7, V-12, ADR-027, JORNADA §4 y §7.
 *
 * Si caen los dos enlaces (ADR-021, N2) se trabaja en formularios. Al volver, la cajera carga en su
 * turno lo que se anotó, y lo cargado lleva la **hora real que se escribió en el papel**: la única hora
 * que declara una pantalla (excepción explícita a ADR-017 y ADR-010, con su límite). Esa hora no se
 * acepta suelta: tiene que caer dentro de la **ventana del corte** que la cajera declara al abrir la
 * carga, y la ventana tiene sus propios límites. Aquí viven esas reglas, sin reloj: el instante entra
 * siempre como argumento (regla 1).
 *
 * Una carga avanza ABIERTA → CERRADA (la cajera terminó de cargar) → REVISADA (supervisión la comparó
 * con el papel). Una sin registros no se revisa: al terminar se DESCARTA. Mientras una carga no esté
 * revisada, su turno no se sella y la jornada no se cierra.
 *
 * Los instantes son milisegundos desde 1970 (UTC), como en el resto del dominio del cobro.
 */

/** Cuánto puede durar un corte que se carga de una vez: más de un día no es un corte, es otra cosa. */
export const VENTANA_MAXIMA_MS = 24 * 3_600_000;

/**
 * Cuánto antes de abrirse su turno puede empezar la ventana. Un corte pudo impedir abrir el turno (sin
 * conexión no se abre), así que lo anotado puede ser anterior a él; pero no de otro día de negocio.
 */
export const ANTELACION_MAXIMA_MS = 24 * 3_600_000;

/** El tramo de tiempo en que no hubo sistema, tal como lo declara la cajera. Los dos extremos cuentan. */
export type VentanaDelCorte = Readonly<{ desde: number; hasta: number }>;

export type ProblemaDeVentana =
  /** `desde` no es anterior a `hasta`. */
  | "AL_REVES"
  /** Termina después de ahora: no se carga lo que todavía no pasó. */
  | "EN_EL_FUTURO"
  /** Dura más de lo que admite un corte (`VENTANA_MAXIMA_MS`). */
  | "DEMASIADO_LARGA"
  /** Empieza mucho antes de abrirse el turno en que se carga (`ANTELACION_MAXIMA_MS`). */
  | "ANTES_DEL_TURNO";

/**
 * ¿Sirve esta ventana para abrir una carga? `ahora` es el instante del servidor al abrirla, y
 * `turnoAbiertoEn`, cuándo se abrió el turno en que se va a cargar.
 */
export function ventanaProblem(ventana: VentanaDelCorte, ctx: Readonly<{ ahora: number; turnoAbiertoEn: number }>): ProblemaDeVentana | null {
  if (!(ventana.desde < ventana.hasta)) return "AL_REVES";
  if (ventana.hasta > ctx.ahora) return "EN_EL_FUTURO";
  if (ventana.hasta - ventana.desde > VENTANA_MAXIMA_MS) return "DEMASIADO_LARGA";
  if (ventana.desde < ctx.turnoAbiertoEn - ANTELACION_MAXIMA_MS) return "ANTES_DEL_TURNO";
  return null;
}

export type ProblemaDeHora =
  /** Es posterior a ahora: nadie anota hoy lo de mañana. */
  | "EN_EL_FUTURO"
  | "ANTES_DE_LA_VENTANA"
  | "DESPUES_DE_LA_VENTANA";

/** ¿Cae la hora anotada dentro de la ventana de su carga, y no después de ahora? */
export function horaRealProblem(hora: number, ventana: VentanaDelCorte, ahora: number): ProblemaDeHora | null {
  if (hora > ahora) return "EN_EL_FUTURO";
  if (hora < ventana.desde) return "ANTES_DE_LA_VENTANA";
  if (hora > ventana.hasta) return "DESPUES_DE_LA_VENTANA";
  return null;
}

/* ------------------------------------------------------------- estados */

export type EstadoDeCarga = "ABIERTA" | "CERRADA" | "REVISADA" | "DESCARTADA";

/** Solo en una carga abierta se añaden registros. */
export const admiteRegistros = (estado: EstadoDeCarga): boolean => estado === "ABIERTA";

/** Lo cargado sin revisar impide sellar el turno y cerrar la jornada: abierta o cerrada, pero no revisada. */
export const bloqueaElCierre = (estado: EstadoDeCarga): boolean => estado === "ABIERTA" || estado === "CERRADA";

/** Supervisión revisa lo que la cajera ya terminó de cargar. */
export const sePuedeRevisar = (estado: EstadoDeCarga): boolean => estado === "CERRADA";

/**
 * En qué queda una carga cuando la cajera termina de cargar: cerrada, a la espera de revisión, o
 * descartada si no cargó nada (no hay qué revisar).
 */
export const estadoAlTerminar = (registros: number): Extract<EstadoDeCarga, "CERRADA" | "DESCARTADA"> => (registros > 0 ? "CERRADA" : "DESCARTADA");
