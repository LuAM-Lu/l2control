"use client";

import { useSyncExternalStore } from "react";
import { BranchAccessSchema, type RoleAdjustmentDto } from "@l2/contracts";
import { esAjustable, type Action, type Permission, type Role } from "@l2/domain-identity";

/**
 * Los ajustes de la sucursal sobre la matriz de §7.3 — N-05 de la auditoría.
 *
 * Quién entra al back-office, y en general qué alcanza cada rol, deja de estar
 * clavado en el código: la matriz es la base y la sucursal la ajusta desde
 * Configuración, con motivo y autor.
 *
 * Vive con el mismo patrón que la sesión (`operador.ts`): un almacén de módulo
 * con `useSyncExternalStore`, para que la barra, el menú y las tres guardias lo
 * lean sin envolver medio árbol en un proveedor.
 *
 * TODO(F2-05/backend): esto lo sirve el servidor con la sucursal, y lo impone
 * ÉL. Mientras tanto vive en la pestaña, como el resto del prototipo: es
 * experiencia de usuario, no seguridad.
 *
 * Lo guardado se valida contra el contrato al leerlo. Un dato que ya no lo
 * cumple se descarta entero: unos permisos a medias son peores que la matriz.
 */

const CLAVE = "l2:accesos:v1";
const EVENTO = "l2-accesos-cambio";
const SIN_AJUSTES: readonly RoleAdjustmentDto[] = Object.freeze([]);

export function leerAjustes(): readonly RoleAdjustmentDto[] {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE);
    if (!crudo) return SIN_AJUSTES;
    const r = BranchAccessSchema.safeParse(JSON.parse(crudo));
    if (!r.success) {
      window.sessionStorage.removeItem(CLAVE);
      return SIN_AJUSTES;
    }
    return r.data.adjustments;
  } catch {
    return SIN_AJUSTES;
  }
}

export function guardarAjustes(branchId: string, ajustes: readonly RoleAdjustmentDto[]): void {
  // Se valida al guardar, no solo al leer: si algo no cumple el contrato, no
  // llega a almacenarse y la pantalla se entera en el acto.
  const valido = BranchAccessSchema.parse({ branchId, adjustments: ajustes });
  try {
    window.sessionStorage.setItem(CLAVE, JSON.stringify(valido));
  } catch {
    // Sin almacenamiento, los ajustes duran lo que la vista.
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener("storage", aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener("storage", aviso);
  };
}

/**
 * La cadena cruda, no el objeto.
 *
 * `useSyncExternalStore` compara la instantánea con `Object.is`: devolver un
 * array nuevo en cada lectura sería un bucle infinito de renderizados.
 */
function leerCrudo(): string | null {
  try {
    return window.sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

let cacheCrudo: string | null = null;
let cacheAjustes: readonly RoleAdjustmentDto[] = SIN_AJUSTES;

function instantanea(): readonly RoleAdjustmentDto[] {
  const crudo = leerCrudo();
  if (crudo !== cacheCrudo) {
    cacheCrudo = crudo;
    cacheAjustes = leerAjustes();
  }
  return cacheAjustes;
}

/** En el servidor no hay ajustes: el primer pintado es el de la matriz. */
export function useAjustes(): readonly RoleAdjustmentDto[] {
  return useSyncExternalStore(suscribir, instantanea, () => SIN_AJUSTES);
}

/**
 * Los ajustes que le tocan a un rol, en la forma que entiende el dominio.
 *
 * Filtra por lo ajustable **aquí también**, aunque el dominio lo vuelva a
 * comprobar: un dato viejo o manipulado no debe llegar siquiera a proponerse.
 */
export function ajustesDeRol(
  role: Role,
  ajustes: readonly RoleAdjustmentDto[],
): Readonly<Partial<Record<Action, Permission>>> {
  const salida: Partial<Record<Action, Permission>> = {};
  for (const a of ajustes) {
    if (a.role !== role) continue;
    const accion = a.action as Action;
    if (!esAjustable(role, accion)) continue;
    salida[accion] = a.permission;
  }
  return salida;
}
