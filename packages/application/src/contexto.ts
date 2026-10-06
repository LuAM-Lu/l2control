/**
 * Dónde y quién: el contexto de toda operación. Todo caso de uso lo recibe y nunca lo deduce.
 * El tenant fija la RLS de la transacción; la sucursal, el alcance (F2-06); la persona y el
 * dispositivo van a la auditoría (§7.4, §9.10.5: responde la PERSONA, no el aparato).
 */
export interface Contexto {
  readonly tenantId: string;
  readonly branchId: string;
  /**
   * Quién opera y desde qué equipo. `userId` nulo = alguien sin identificar desde un equipo
   * conocido (un PIN de una persona que no existe): se audita, pero no puede nada.
   */
  readonly quien?: Readonly<{ userId: string | null; deviceId: string | null }>;
  /** Desde dónde llegó la petición, para la auditoría. */
  readonly ip?: string | null;
  /**
   * Hasta cuándo vale la elevación de la sesión con contraseña y llave de acceso (F2-04, ADR-020). Lo pone el
   * servidor desde la sesión, nunca el navegador.
   */
  readonly elevadaHasta?: string | null;
  /**
   * Operación del sistema, no de una persona: semillas y consola del servidor. No pasa por la
   * matriz de permisos. Sin `quien` y sin esto, todo se niega (deny-by-default).
   */
  readonly sistema?: true;
}
