/**
 * Sin actividad durante este tiempo, el servidor cierra la sesión. La estación se bloquea antes
 * (tres minutos, `DEFAULT_STATION_IDLE`) y pide el PIN; esto es la red por si el navegador no
 * avisa (se cerró la tapa, se fue la luz). Vive aparte para que dispositivos y sesiones lo
 * compartan sin depender uno del otro.
 */
export const SESION_INACTIVA_MS = 30 * 60_000;

/**
 * Lo que vale una solicitud de registro de un equipo (M-7). Pasado el plazo no se aprueba: el
 * equipo la renueva desde su pantalla. Así la lista no acumula solicitudes que nadie reconoce.
 */
export const SOLICITUD_EQUIPO_MS = 24 * 60 * 60_000;

/** Cuántas solicitudes de registro admite una misma dirección en una hora (M-7). */
export const SOLICITUDES_POR_HORA = 10;

/** Cuántas solicitudes vigentes puede haber a la vez en una sucursal (M-7). */
export const PENDIENTES_MAXIMAS = 20;
