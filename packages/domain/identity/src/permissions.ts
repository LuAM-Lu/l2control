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
  | "cuenta.incobrable"
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
  | "parque.cerrarHuerfana"
  | "parque.anularEntrada"
  | "evento.reservar"
  | "papel.revisar"
  | "tasa.confirmar"
  | "catalogo.modificar"
  | "inventario.ajustar"
  | "inventario.entrada"
  | "inventario.catalogo"
  | "soporte.gestionar"
  | "reportes.verSucursal"
  | "reportes.verTodas"
  | "usuarios.gestionar"
  | "camaras.ver"
  | "sistema.actualizar";

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
  // D-JOR: una cuenta que no se va a cobrar se marca incobrable con motivo y 🔐 de supervisión.
  "cuenta.incobrable": fila(P, A, A, D, D, D),

  // DEC-25: solo la caja cobra, lo del parque y lo del restaurante. La
  // monitora registra entradas y salidas y la cuenta pasa a la cola de la
  // caja; no cobra, no reimprime ni anula. Si un local la necesita cobrando,
  // la administración se lo concede en Roles y accesos (F2-13), sin programar.
  "documento.emitir": fila(P, P, P, D, D, D),
  "documento.notaCredito": fila(P, A, D, D, D, D),
  "documento.reimprimir": fila(P, A, A, D, D, D),
  // DEC-24: anular un cobro ya cerrado. Lo pide quien cobra; lo autoriza un
  // supervisor con su PIN o el administrador.
  "cobro.anular": fila(P, A, A, D, D, D),

  "mesa.reabrir": fila(P, A, D, D, D, D),
  "kds.cambiarEstado": fila(P, P, D, D, D, P),

  "parque.checkIn": fila(P, P, P, D, P, D),
  "parque.checkOut": fila(P, P, P, D, P, D),
  "parque.extenderSinCobro": fila(P, A, D, D, A, D),
  "parque.vincularMesa": fila(P, P, P, P, P, D),
  "parque.verContacto": fila(P, P, D, D, P, D),
  // F5-13, H-19: una estancia huérfana (el niño se fue sin registrar la salida) la cierra la
  // dirección del local con un motivo, sin cobrar tiempo de más.
  "parque.cerrarHuerfana": fila(P, P, D, D, D, D),
  // Anular una entrada registrada por error (B4-10, M-27): administración; supervisión con la 🔐 de administración.
  "parque.anularEntrada": fila(P, A, D, D, D, D),
  // B10-1 (V-10): reservar un cumpleaños, y cancelarlo mientras su anticipo no se haya cobrado. Lo hace
  // quien atiende al cliente en la caja; el anticipo lo cobra la caja como cualquier cuenta.
  "evento.reservar": fila(P, P, P, D, D, D),
  // B3-7 (V-12, ADR-027): lo que la cajera carga desde el papel lo revisa supervisión contra los
  // formularios, con su PIN, antes del Z. Cargarlo es de la caja (`documento.emitir`, `parque.checkIn`,
  // `parque.checkOut`): quien carga no se revisa a sí misma.
  "papel.revisar": fila(P, P, D, D, D, D),

  "tasa.confirmar": fila(P, A, D, D, D, D),
  "catalogo.modificar": fila(P, D, D, D, D, D),
  "inventario.ajustar": fila(P, A, D, D, D, D),
  // B9-3: recibir mercancía (compra o reposición) no es un ajuste: entra lo que llegó, con su costo.
  // Lo hace quien recibe al proveedor; cada entrada queda con su autor y no se edita.
  "inventario.entrada": fila(P, P, D, D, D, D),
  // Dar de alta, editar la ficha y apartar productos, y la lista de categorías (T-13, M-27): de administración, y se
  // puede dar por rol o por persona (p. ej. a supervisión para cargar el inventario inicial). Cambiar precios y la
  // carta sigue en `catalogo.modificar`, que no se regala.
  "inventario.catalogo": fila(P, D, D, D, D, D),

  "reportes.verSucursal": fila(P, P, D, D, D, D),
  "reportes.verTodas": fila(P, D, D, D, D, D),
  "usuarios.gestionar": fila(P, D, D, D, D, D),
  "camaras.ver": fila(P, D, D, D, D, D),
  // T-8b (ADR-028): cuándo se pone una versión nueva lo decide administración, con su identidad
  // confirmada; el resto del equipo no decide nada (su pantalla se pone al día sola).
  "sistema.actualizar": fila(P, D, D, D, D, D),
  // T-11 (M-27, P-4, D-SOP): atender los reportes de problemas (verlos todos, sus capturas, y marcarlos visto, en
  // curso o resuelto). Reportar no pide nada: lo hace cualquiera con sesión. La cuenta de soporte del desarrollo es
  // de administración; se puede dar por persona a quien ayude con el soporte en el local.
  "soporte.gestionar": fila(P, D, D, D, D, D),
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
  /**
   * Ajustes que la sucursal le ha hecho **al rol entero**, no a esta persona.
   *
   * La matriz de §7.3 es la base sensata, no un dogma: un local decide que su
   * caja también ve los reportes, y eso no debería exigir un despliegue ni
   * conceder lo mismo persona por persona. Se edita en Configuración, queda con
   * motivo y autor, y **no toca la matriz**: se lee encima de ella.
   *
   * Orden de precedencia, de más específico a más general:
   *   revocación de la persona → concesión de la persona → ajuste del rol → matriz.
   * Lo de la persona gana siempre: es lo que se decidió mirándola a ella.
   */
  roleAdjustments?: Readonly<Partial<Record<Action, Permission>>>;
}>;

/** De dónde sale el permiso efectivo de una persona para una acción. */
export type PermissionSource = "ROL" | "AJUSTE_DE_ROL" | "CONCESION" | "REVOCACION";

export type PermissionExplanation = Readonly<{
  /**
   * Lo que da su rol HOY: la matriz con el ajuste de la sucursal aplicado.
   *
   * Es lo que la pantalla enseña tachado al lado de una excepción, y por eso
   * incluye el ajuste: comparar contra una matriz que el local ya cambió sería
   * comparar contra algo que nadie ve.
   */
  base: Permission;
  /** La celda original de la matriz, sin ajustar. */
  matriz: Permission;
  /** Lo que la persona tiene de verdad, con todo aplicado. */
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
  if (!fila) return Object.freeze({ base: D, matriz: D, effective: D, source: "ROL" });

  const matriz = fila[actor.role] ?? D;
  // El ajuste de la sucursal solo se aplica donde se permite ajustar: un ajuste
  // guardado sobre una celda intocable —por un dato viejo o manipulado— se
  // ignora en vez de obedecerse (fail-closed).
  const ajustado = esAjustable(actor.role, action) ? actor.roleAdjustments?.[action] : undefined;
  const base = ajustado ?? matriz;

  // Revocación antes que concesión: si la misma acción aparece en las dos,
  // gana la que niega. Ante la duda, fail-closed (regla 4 del repositorio).
  if (actor.revokes?.includes(action)) {
    return Object.freeze({ base, matriz, effective: D, source: "REVOCACION" });
  }

  const concedido = actor.grants?.[action];
  if (concedido !== undefined) {
    return Object.freeze({ base, matriz, effective: concedido, source: "CONCESION" });
  }

  return Object.freeze({
    base,
    matriz,
    effective: base,
    source: ajustado === undefined ? "ROL" : "AJUSTE_DE_ROL",
  });
}

/**
 * Acciones que ninguna sucursal puede ajustar, y por qué — el suelo del sistema.
 *
 * Son las dos llaves de la casa: quien gestiona personas puede concederse el
 * resto, y quien modifica el catálogo abre **esta misma pantalla** de ajustes.
 * Si se pudieran regalar por rol, cualquier ajuste sería el último que alguien
 * necesita hacer.
 */
export const ACCIONES_INTOCABLES: readonly Action[] = ["usuarios.gestionar", "catalogo.modificar", "sistema.actualizar"];

/**
 * ¿Se puede ajustar esta celda de la matriz?
 *
 * La fila de administración tampoco: un local que se quita a sí mismo la
 * administración se queda sin nadie que pueda devolvérsela, y eso no se arregla
 * desde dentro del producto.
 */
export function esAjustable(role: Role, action: Action): boolean {
  if (role === "ADMIN") return false;
  if (ACCIONES_INTOCABLES.includes(action)) return false;
  return Object.hasOwn(MATRIZ, action);
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

/** Lo que nadie se autoriza a sí mismo (D-AUT): la tasa y los ajustes de inventario. */
export const SIN_AUTORIZARSE_A_SI_MISMO: readonly Action[] = ["tasa.confirmar", "inventario.ajustar"];

/**
 * ¿Puede `authorizer` autorizar que `requester` haga `action`?
 *
 * Solo un supervisor o el administrador, y solo si ellos mismos pueden
 * alcanzar la acción en esa sucursal: una concesión que le quita la acción a
 * un supervisor le quita también autorizarla. Si quien la pide ya la tiene
 * permitida sin más, no hay nada que autorizar; si la tiene denegada, nadie
 * se la abre.
 *
 * Un supervisor puede autorizarse a sí mismo en la caja: con dos personas en
 * el turno no siempre hay un segundo (DEC-24). Queda igual el motivo y su PIN
 * en auditoría. Donde no hay prisa y mueve lo que cobra todo el local —la
 * tasa, el inventario—, no (D-AUT, B3-4): lo autoriza otra persona.
 */
export function canAuthorize(
  authorizer: Actor,
  requester: Actor,
  action: Action,
  context?: { branchId?: string },
): boolean {
  if (!AUTORIZADORES.includes(authorizer.role)) return false;
  if (authorizer.id === requester.id && SIN_AUTORIZARSE_A_SI_MISMO.includes(action)) return false;
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
  | "papel"
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
  // La carga de lo anotado en papel (B3-7): la cajera carga y supervisión revisa; ambas cobran.
  papel: "documento.emitir",
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
