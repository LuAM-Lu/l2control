/**
 * Sin actividad durante este tiempo, el servidor cierra la sesión. La estación se bloquea antes
 * (tres minutos, `DEFAULT_STATION_IDLE`) y pide el PIN; esto es la red por si el navegador no
 * avisa (se cerró la tapa, se fue la luz). Vive aparte para que dispositivos y sesiones lo
 * compartan sin depender uno del otro.
 */
export const SESION_INACTIVA_MS = 30 * 60_000;
