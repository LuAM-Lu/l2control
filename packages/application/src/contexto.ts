/**
 * Dónde y quién: el contexto de toda operación. Todo caso de uso lo recibe y nunca lo deduce.
 * El tenant fija la RLS de la transacción; la sucursal, el alcance (F2-06); la persona y el
 * dispositivo van a la auditoría (§7.4, §9.10.5: responde la PERSONA, no el aparato).
 */
export interface Contexto {
  readonly tenantId: string;
  readonly branchId: string;
  /** Quién opera. Ausente = el sistema (semillas, trabajos programados). */
  readonly quien?: Readonly<{ userId: string; deviceId: string | null }>;
  /** Desde dónde llegó la petición, para la auditoría. */
  readonly ip?: string | null;
}
