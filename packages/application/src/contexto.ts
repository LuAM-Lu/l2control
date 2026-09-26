/**
 * Dónde ocurre una operación: el tenant y la sucursal. Todo caso de uso lo recibe y nunca lo
 * deduce: el tenant fija la RLS de la transacción y la sucursal, el alcance (F2-06).
 *
 * Hoy lo pone el proceso desde su entorno (un solo local). Con la sesión en el servidor (B1)
 * saldrá del dispositivo y de la persona autenticados.
 */
export interface Contexto {
  readonly tenantId: string;
  readonly branchId: string;
}
