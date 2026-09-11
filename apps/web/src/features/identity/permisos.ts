/**
 * Permisos para las personas — F2-11.
 *
 * Dos cosas viven aquí, las dos en la capa de funcionalidad porque conocen a
 * la vez el contrato y el dominio:
 *
 *  1. **El nombre de cada acción en castellano**, agrupado por área. Es un
 *     `Record<Action, …>`: si el dominio añade una acción y aquí no se le da
 *     nombre, no compila. Una pantalla de permisos con un «kds.cambiarEstado»
 *     crudo no la entiende quien tiene que decidir.
 *  2. **El traductor contrato → dominio** de una persona, que es donde se
 *     comprueba que cada excepción nombra una acción que existe.
 */
import type { UserSummaryDto } from "@l2/contracts";
import { MATRIZ, type Action, type Actor, type Permission, type Role } from "@l2/domain-identity";

export type Area =
  | "Turno"
  | "Cobro y cuenta"
  | "Pedidos y mesas"
  | "Cocina"
  | "Parque"
  | "Administración";

export const AREAS: readonly Area[] = [
  "Turno",
  "Cobro y cuenta",
  "Pedidos y mesas",
  "Cocina",
  "Parque",
  "Administración",
];

export const ETIQUETAS: Readonly<Record<Action, { etiqueta: string; area: Area }>> = {
  "turno.abrir": { etiqueta: "Abrir turno", area: "Turno" },
  "turno.corteX": { etiqueta: "Corte X", area: "Turno" },
  "turno.corteZ": { etiqueta: "Corte Z · cerrar el turno", area: "Turno" },

  "documento.emitir": { etiqueta: "Cobrar", area: "Cobro y cuenta" },
  "cuenta.descuento": { etiqueta: "Aplicar descuento", area: "Cobro y cuenta" },
  "cuenta.cortesia": { etiqueta: "Dar cortesía", area: "Cobro y cuenta" },
  "documento.reimprimir": { etiqueta: "Reimprimir documento", area: "Cobro y cuenta" },
  "documento.notaCredito": { etiqueta: "Emitir nota de crédito", area: "Cobro y cuenta" },

  "pedido.tomar": { etiqueta: "Tomar pedidos", area: "Pedidos y mesas" },
  "pedido.enviarCocina": { etiqueta: "Enviar a cocina", area: "Pedidos y mesas" },
  "pedido.anularNoEnviado": { etiqueta: "Anular lo no enviado", area: "Pedidos y mesas" },
  "pedido.anularEnProduccion": {
    etiqueta: "Anular lo que ya está en cocina",
    area: "Pedidos y mesas",
  },
  "mesa.reabrir": { etiqueta: "Reabrir una mesa cerrada", area: "Pedidos y mesas" },

  "kds.cambiarEstado": { etiqueta: "Cambiar estado de comandas", area: "Cocina" },

  "parque.checkIn": { etiqueta: "Entrada al parque", area: "Parque" },
  "parque.checkOut": { etiqueta: "Salida del parque", area: "Parque" },
  "parque.extenderSinCobro": { etiqueta: "Extender tiempo sin cobrar", area: "Parque" },
  "parque.vincularMesa": { etiqueta: "Vincular pulsera a una mesa", area: "Parque" },
  "parque.verContacto": { etiqueta: "Ver contacto del representante", area: "Parque" },

  "tasa.confirmar": { etiqueta: "Confirmar la tasa del día", area: "Administración" },
  "catalogo.modificar": { etiqueta: "Modificar carta y tarifas", area: "Administración" },
  "inventario.ajustar": { etiqueta: "Ajustar inventario", area: "Administración" },
  "reportes.verSucursal": { etiqueta: "Reportes de la sucursal", area: "Administración" },
  "reportes.verTodas": { etiqueta: "Reportes de todas las sucursales", area: "Administración" },
  "usuarios.gestionar": { etiqueta: "Gestionar usuarios y permisos", area: "Administración" },
  "camaras.ver": { etiqueta: "Ver cámaras", area: "Administración" },
};

export const ACCIONES = Object.keys(ETIQUETAS) as Action[];

/**
 * Nombre de cada rol. Se nombra la FUNCIÓN, no a la persona: «Caja», no
 * «Cajera». El rol no tiene género; quien lo ocupa, sí, y eso ya lo dice su
 * nombre.
 */
export const NOMBRE_ROL: Readonly<Record<Role, string>> = {
  ADMIN: "Administración",
  SUPERVISOR: "Supervisión",
  CAJERO: "Caja",
  MESERO: "Servicio de mesas",
  MONITOR_PARQUE: "Monitor de parque",
  COCINA: "Cocina",
};

export function esAccion(nombre: string): nombre is Action {
  return Object.hasOwn(MATRIZ, nombre);
}

export function etiquetaDe(nombre: string): string {
  return esAccion(nombre) ? ETIQUETAS[nombre].etiqueta : nombre;
}

/**
 * Persona del contrato → actor del dominio.
 *
 * Falla ruidosamente ante una excepción sobre una acción que no existe: es un
 * dato corrupto —una acción renombrada, una migración a medias—, y tratarlo
 * como «sin excepción» haría que una revocación se perdiera en silencio.
 */
export function toActor(u: UserSummaryDto): Actor {
  // Si el contrato y el dominio dejan de coincidir en los roles, esta línea
  // deja de compilar. Es la única comprobación que necesitan las dos listas.
  const role: Role = u.role;

  const grants: Partial<Record<Action, Permission>> = {};
  const revokes: Action[] = [];

  for (const e of u.exceptions) {
    const accion = e.action;
    if (!esAccion(accion)) {
      throw new TypeError(`Excepción sobre una acción desconocida: "${accion}" (${u.id})`);
    }
    if (e.effect === "GRANT") grants[accion] = e.permission;
    else revokes.push(accion);
  }

  return { id: u.id, role, branchIds: u.branchIds, grants, revokes };
}
