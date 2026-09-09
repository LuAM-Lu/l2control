/**
 * Matriz de permisos — implementa §7.3 del plan (F2-05).
 *
 * PRINCIPIO: los permisos son un CONJUNTO TIPADO, no una cadena de texto.
 * Nunca se compara `role === "admin"`; se pregunta `can(actor, accion, ctx)`.
 *
 * Y la comprobación de sucursal es **parte del permiso**, no un `if` aparte
 * que alguien olvidará en la ruta nueva: un supervisor de la sucursal A no
 * autoriza nada en la B, y eso lo impone esta función, no la disciplina.
 */

export type Role =
  | "ADMIN"
  | "SUPERVISOR"
  | "CAJERO"
  | "MESERO"
  | "MONITOR_PARQUE"
  | "COCINA";

/** Cada operación con impacto monetario o de acceso tiene su acción. */
export type Action =
  | "turno.abrir"
  | "turno.corteX"
  | "turno.corteZ"
  | "pedido.tomar"
  | "pedido.enviarCocina"
  | "pedido.anularNoEnviado"
  | "pedido.anularEnProduccion"
  | "cuenta.descuento"
  | "cuenta.cortesia"
  | "documento.emitir"
  | "documento.notaCredito"
  | "documento.reimprimir"
  | "mesa.reabrir"
  | "kds.cambiarEstado"
  | "parque.checkIn"
  | "parque.checkOut"
  | "parque.extenderSinCobro"
  | "parque.vincularMesa"
  | "parque.verContacto"
  | "tasa.confirmar"
  | "catalogo.modificar"
  | "inventario.ajustar"
  | "reportes.verSucursal"
  | "reportes.verTodas"
  | "usuarios.gestionar"
  | "camaras.ver";

/**
 * Resultado de una comprobación.
 *
 * `REQUIERE_AUTORIZACION` no es «sí» ni «no»: es el 🔐 de la matriz. La
 * operación puede hacerse, pero exige motivo de lista cerrada y la identidad
 * de quien autoriza, registrados **antes** de ejecutar (§7.3).
 */
export type Permission = "PERMITIDO" | "REQUIERE_AUTORIZACION" | "DENEGADO";

type Matriz = Readonly<Record<Action, Readonly<Record<Role, Permission>>>>;

const P = "PERMITIDO" as const;
const A = "REQUIERE_AUTORIZACION" as const;
const D = "DENEGADO" as const;

/** Orden fijo: ADMIN, SUPERVISOR, CAJERO, MESERO, MONITOR_PARQUE, COCINA. */
const fila = (
  admin: Permission,
  supervisor: Permission,
  cajero: Permission,
  mesero: Permission,
  monitor: Permission,
  cocina: Permission,
): Readonly<Record<Role, Permission>> =>
  Object.freeze({
    ADMIN: admin,
    SUPERVISOR: supervisor,
    CAJERO: cajero,
    MESERO: mesero,
    MONITOR_PARQUE: monitor,
    COCINA: cocina,
  });

/**
 * La matriz de §7.3, como DATO.
 *
 * Que sea una tabla y no una maraña de condicionales es deliberado: se lee de
 * un vistazo, se compara con el documento, y cada celda tiene su prueba.
 */
export const MATRIZ: Matriz = Object.freeze({
  "turno.abrir": fila(P, P, P, D, D, D),
  "turno.corteX": fila(P, P, P, D, D, D),
  "turno.corteZ": fila(P, P, A, D, D, D),

  "pedido.tomar": fila(P, P, P, P, D, D),
  "pedido.enviarCocina": fila(P, P, P, P, D, D),
  "pedido.anularNoEnviado": fila(P, P, P, P, D, D),
  "pedido.anularEnProduccion": fila(P, A, A, A, D, D),

  "cuenta.descuento": fila(P, A, A, D, D, D),
  "cuenta.cortesia": fila(P, A, A, D, D, D),

  "documento.emitir": fila(P, P, P, D, P, D),
  "documento.notaCredito": fila(P, A, D, D, D, D),
  "documento.reimprimir": fila(P, A, A, D, A, D),

  "mesa.reabrir": fila(P, A, D, D, D, D),
  "kds.cambiarEstado": fila(P, P, D, D, D, P),

  "parque.checkIn": fila(P, P, P, D, P, D),
  "parque.checkOut": fila(P, P, P, D, P, D),
  "parque.extenderSinCobro": fila(P, A, D, D, A, D),
  "parque.vincularMesa": fila(P, P, P, P, P, D),
  "parque.verContacto": fila(P, P, D, D, P, D),

  "tasa.confirmar": fila(P, A, D, D, D, D),
  "catalogo.modificar": fila(P, D, D, D, D, D),
  "inventario.ajustar": fila(P, A, D, D, D, D),

  "reportes.verSucursal": fila(P, P, D, D, D, D),
  "reportes.verTodas": fila(P, D, D, D, D, D),
  "usuarios.gestionar": fila(P, D, D, D, D, D),
  "camaras.ver": fila(P, D, D, D, D, D),
});

export type Actor = Readonly<{
  id: string;
  role: Role;
  /** Sucursales en las que el actor puede operar. */
  branchIds: readonly string[];
}>;

/**
 * ¿Puede este actor hacer esta acción, aquí?
 *
 * **Deny by default en dos sentidos.** Si la acción no está en la matriz, se
 * deniega; y si la operación es sobre una sucursal a la que el actor no
 * pertenece, se deniega sin mirar siquiera la matriz. Esa segunda parte es la
 * que impide la escalada trivial del hallazgo H-07: un cajero anulando
 * tickets de otra sede.
 */
export function can(
  actor: Actor,
  action: Action,
  context?: { branchId?: string },
): Permission {
  const branchId = context?.branchId;
  if (branchId !== undefined && !actor.branchIds.includes(branchId)) return D;

  const fila = MATRIZ[action];
  if (!fila) return D;
  return fila[actor.role] ?? D;
}

/** Atajo para el caso «¿puedo hacerlo sin pedir autorización?». */
export function isAllowedOutright(
  actor: Actor,
  action: Action,
  context?: { branchId?: string },
): boolean {
  return can(actor, action, context) === "PERMITIDO";
}

/** Atajo para «¿puedo hacerlo, aunque sea con autorización?». */
export function isReachable(
  actor: Actor,
  action: Action,
  context?: { branchId?: string },
): boolean {
  return can(actor, action, context) !== "DENEGADO";
}

/* ------------------------------------------------------- superficies */

/**
 * Superficies del sistema y la acción que da acceso a cada una.
 *
 * Que el acceso a una pantalla se derive de una ACCIÓN y no de una lista de
 * roles evita el error clásico: añadir un rol nuevo y olvidar actualizar
 * catorce listas repartidas por el código.
 */
export type SurfaceId =
  | "monitor"
  | "entrada"
  | "salida"
  | "caja"
  | "turno"
  | "mesas"
  | "kds"
  | "inventario"
  | "reportes"
  | "usuarios"
  | "camaras";

export const SURFACE_ACTION: Readonly<Record<SurfaceId, Action>> = Object.freeze({
  monitor: "parque.checkIn",
  entrada: "parque.checkIn",
  salida: "parque.checkOut",
  caja: "documento.emitir",
  turno: "turno.corteX",
  mesas: "pedido.tomar",
  kds: "kds.cambiarEstado",
  inventario: "inventario.ajustar",
  reportes: "reportes.verSucursal",
  usuarios: "usuarios.gestionar",
  camaras: "camaras.ver",
});

/** Superficies que este actor puede abrir, en el orden dado. */
export function visibleSurfaces(
  actor: Actor,
  order: readonly SurfaceId[],
): readonly SurfaceId[] {
  return order.filter((s) => isReachable(actor, SURFACE_ACTION[s]));
}
