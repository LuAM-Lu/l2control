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
  | "cobro.anular"
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
  // DEC-24: anular un cobro ya cerrado. Lo pide quien cobra; lo autoriza un
  // supervisor con su PIN o el administrador.
  "cobro.anular": fila(P, A, A, D, A, D),

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
  /**
   * Concesiones sobre el rol — DEC-15, §9.10.6. «Marisol es cajera, pero
   * además puede confirmar la tasa.» Sustituyen la celda de la matriz para
   * esa acción y esa persona.
   *
   * El rol es la base; la excepción es un DATO. Nunca se inventa un rol
   * nuevo para una sola persona: los roles a medida son como una matriz de
   * permisos acaba siendo imposible de leer.
   */
  grants?: Readonly<Partial<Record<Action, Permission>>>;
  /** Revocaciones sobre el rol: le quitan a una persona lo que su puesto da. */
  revokes?: readonly Action[];
}>;

/** De dónde sale el permiso efectivo de una persona para una acción. */
export type PermissionSource = "ROL" | "CONCESION" | "REVOCACION";

export type PermissionExplanation = Readonly<{
  /** Lo que da el rol, según la matriz. */
  base: Permission;
  /** Lo que la persona tiene de verdad, con sus excepciones aplicadas. */
  effective: Permission;
  source: PermissionSource;
}>;

/**
 * ¿Puede este actor hacer esta acción, aquí?
 *
 * **Deny by default en dos sentidos.** Si la acción no está en la matriz, se
 * deniega; y si la operación es sobre una sucursal a la que el actor no
 * pertenece, se deniega sin mirar siquiera la matriz. Esa segunda parte es la
 * que impide la escalada trivial del hallazgo H-07: un cajero anulando
 * tickets de otra sede.
 *
 * **Las excepciones por persona (F2-11) se aplican DESPUÉS de la sucursal**,
 * y ese orden es la regla 2 de §9.10.6: un permiso extra nunca saca a nadie
 * de su sede. El orden completo es sucursal → acción conocida → revocación →
 * concesión → matriz.
 */
export function can(
  actor: Actor,
  action: Action,
  context?: { branchId?: string },
): Permission {
  const branchId = context?.branchId;
  if (branchId !== undefined && !actor.branchIds.includes(branchId)) return D;
  return explainPermission(actor, action).effective;
}

/**
 * Explica de dónde sale el permiso de una persona para una acción.
 *
 * La pantalla de usuarios lo necesita para mostrar **el rol y las excepciones
 * por separado** (§9.10.6, regla 3): que se vea de un vistazo quién tiene
 * poderes que su puesto no da. Y `can` lo usa por dentro, así que la regla de
 * las excepciones está escrita una sola vez.
 *
 * No evalúa la sucursal: describe a la persona, no una operación concreta.
 */
export function explainPermission(actor: Actor, action: Action): PermissionExplanation {
  const fila = MATRIZ[action];
  // Una acción que la matriz no conoce no existe, y una concesión no la crea.
  if (!fila) return Object.freeze({ base: D, effective: D, source: "ROL" });

  const base = fila[actor.role] ?? D;

  // Revocación antes que concesión: si la misma acción aparece en las dos,
  // gana la que niega. Ante la duda, fail-closed (regla 4 del repositorio).
  if (actor.revokes?.includes(action)) {
    return Object.freeze({ base, effective: D, source: "REVOCACION" });
  }

  const concedido = actor.grants?.[action];
  if (concedido !== undefined) {
    return Object.freeze({ base, effective: concedido, source: "CONCESION" });
  }

  return Object.freeze({ base, effective: base, source: "ROL" });
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

/** Los roles que pueden dar la autorización de un 🔐 (§7.3, DEC-24). */
const AUTORIZADORES: readonly Role[] = ["ADMIN", "SUPERVISOR"];

/**
 * ¿Puede `authorizer` autorizar que `requester` haga `action`?
 *
 * Solo un supervisor o el administrador, y solo si ellos mismos pueden
 * alcanzar la acción en esa sucursal: una concesión que le quita la acción a
 * un supervisor le quita también autorizarla. Si quien la pide ya la tiene
 * permitida sin más, no hay nada que autorizar; si la tiene denegada, nadie
 * se la abre.
 *
 * Un supervisor puede autorizarse a sí mismo: con dos personas en el turno
 * no siempre hay un segundo. Queda igual el motivo y su PIN en auditoría.
 */
export function canAuthorize(
  authorizer: Actor,
  requester: Actor,
  action: Action,
  context?: { branchId?: string },
): boolean {
  if (!AUTORIZADORES.includes(authorizer.role)) return false;
  if (can(requester, action, context) !== "REQUIERE_AUTORIZACION") return false;
  return isReachable(authorizer, action, context);
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
