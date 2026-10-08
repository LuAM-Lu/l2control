import type { Route } from "next";
import { SURFACE_ACTION, can, type Action, type Actor, type Role, type SurfaceId } from "@l2/domain-identity";
import { INICIO, MODULOS, buscarModulo, buscarSeccion, type Modulo, type Seccion } from "../shell/navigation.ts";

/**
 * Qué ve cada rol — V2 de UX-MEJORAS §3, sobre la matriz de §7.3.
 *
 * Cuatro reglas, escritas una vez aquí para que la barra, el menú y la guardia
 * de cada pantalla no las repitan a su manera:
 *
 *  1. Lo que un rol no puede alcanzar NO aparece.
 *  2. Lo que puede con autorización SÍ aparece (`REQUIERE_AUTORIZACION` cuenta
 *     como alcanzable: el candado se pide en la acción, no en la puerta).
 *  3. Lo sensible se enmascara, no se esconde la pantalla.
 *  4. La dirección no es una puerta: escribir la URL no salta nada.
 *
 * ⚠ Esto es experiencia de usuario, no seguridad: quien controle el navegador
 * se lo salta. La puerta de verdad la pondrá el servidor con la misma matriz
 * (F2-05); por eso la regla vive en el dominio y aquí solo se consulta.
 */

const alcanza = (actor: Actor, accion: Action) => can(actor, accion) !== "DENEGADO";

/* ── estaciones ── */

export const SUPERFICIE_DE_RUTA: Readonly<Record<string, SurfaceId>> = {
  "/monitor": "monitor",
  "/entrada": "entrada",
  "/salida": "salida",
  "/caja": "caja",
  "/turno": "turno",
  "/papel": "papel",
  "/deudas": "deudas",
  "/mesas": "mesas",
};

const NOMBRE_SUPERFICIE: Readonly<Partial<Record<SurfaceId, string>>> = {
  monitor: "la sala del parque",
  entrada: "la entrada del parque",
  salida: "la salida del parque",
  caja: "la caja",
  turno: "el turno de caja",
  papel: "la carga desde papel",
  deudas: "las deudas de clientes",
  mesas: "las mesas",
};

export function puedeAbrirRuta(actor: Actor, ruta: string): boolean {
  const s = SUPERFICIE_DE_RUTA[ruta];
  return s === undefined || alcanza(actor, SURFACE_ACTION[s]);
}

export function nombreDeRuta(ruta: string): string {
  const s = SUPERFICIE_DE_RUTA[ruta];
  return (s && NOMBRE_SUPERFICIE[s]) ?? "esta pantalla";
}

/* ── back-office ── */

export function puedeVerSeccion(actor: Actor, m: Modulo, s: Seccion): boolean {
  // Con varias acciones, basta una (T-13). Sin acción propia, la sección hereda la del módulo.
  if (s.acciones) return s.acciones.some((a) => alcanza(actor, a));
  return alcanza(actor, s.accion ?? m.accion);
}

/** Un módulo se ve si su acción alcanza o si alguna de sus secciones alcanza. */
export function puedeVerModulo(actor: Actor, m: Modulo): boolean {
  return alcanza(actor, m.accion) || m.secciones.some((s) => puedeVerSeccion(actor, m, s));
}

export function modulosVisibles(actor: Actor): readonly Modulo[] {
  return MODULOS.filter((m) => puedeVerModulo(actor, m));
}

export function puedeVerInicio(actor: Actor): boolean {
  return alcanza(actor, INICIO.accion);
}

/**
 * ¿Puede abrir esta dirección del panel? `/panel`, `/panel/x` o `/panel/x/y`.
 *
 * **Una sola puerta al back-office** — N-05 de la auditoría. Antes eran dos
 * reglas escritas por separado: `/panel` pedía ver reportes y `/panel/caja`
 * solo la acción del módulo, así que la caja se quedaba dentro de la cáscara,
 * sin fila de Inicio y sin poder subir un nivel, porque las migas la llevaban a
 * una pantalla que le negaba el paso.
 *
 * Los dos mundos de DEC-13 son dos mundos: la operación trabaja en estaciones a
 * pantalla completa y el back-office es de administración y supervisión. Quién
 * cuenta como tal **ya no está clavado aquí**: es la acción `reportes.verSucursal`,
 * que la sucursal ajusta por rol en Configuración y la administración concede
 * por persona en Usuarios (DEC-15).
 */
export function puedeAbrirPanel(actor: Actor, ruta: string): boolean {
  if (!puedeVerInicio(actor)) return false;
  const [, , moduloId, seccionId] = ruta.split("/");
  if (!moduloId) return true;
  const m = buscarModulo(moduloId);
  // Una dirección que no existe la resuelve la página con su 404: no se
  // disfraza de «sin acceso».
  if (!m) return true;
  if (!seccionId) return puedeVerModulo(actor, m);
  const s = buscarSeccion(m, seccionId);
  return s ? puedeVerSeccion(actor, m, s) : true;
}

/* ── a dónde va cada uno ── */

const RUTA_DE_SUPERFICIE: Readonly<Partial<Record<SurfaceId, Route>>> = {
  caja: "/caja",
  monitor: "/monitor",
  mesas: "/mesas",
  entrada: "/entrada",
  salida: "/salida",
  turno: "/turno",
};

/**
 * Dónde se sienta cada rol — N-01 de la auditoría.
 *
 * Es un DATO, no un cálculo. Antes se tomaba la primera superficie que el rol
 * alcanzaba de una lista que empezaba por `caja`, y como la taquilla cobra
 * (DEC-16), a la monitora de parque se la mandaba a la caja: «Monitora de
 * parque no tiene acceso al turno de caja · Ir a la caja». Alcanzar una
 * pantalla y trabajar en ella no son lo mismo, y eso no se deduce de la matriz.
 *
 * Es el mismo reparto que `PUESTO_DE_ROL` en `operador.ts`, que dice en qué
 * puesto aparece cada rol en el tablero en vivo.
 */
const PUESTO_DE_ROL: Readonly<Record<Role, SurfaceId | "panel" | "ninguno">> = {
  ADMIN: "panel",
  SUPERVISOR: "panel",
  CAJERO: "caja",
  MONITOR_PARQUE: "monitor",
  MESERO: "mesas",
  // La cocina trabaja con la comanda impresa, sin pantalla (ADR-022, B6-2): no tiene puesto en el sistema.
  COCINA: "ninguno",
};

/**
 * El puesto de trabajo de una persona.
 *
 * **Dónde se trabaja y qué se alcanza no son lo mismo.** Si la sucursal le abre
 * el back-office a la caja (N-05), la cajera pasa a poder mirar los reportes,
 * pero su sitio sigue siendo la caja: al entrar por la mañana tiene que aparecer
 * cobrando, no en un tablero. Por eso el puesto es un dato del rol y no «la
 * primera pantalla que alcanza».
 *
 * Si su rol no alcanza su propia superficie —la sucursal se la cerró, o se la
 * revocaron a ella— se cae al acceso en vez de mandarla a una pantalla que le va
 * a negar el paso.
 */
export function puestoDe(actor: Actor): { ruta: Route; nombre: string } {
  const suyo = PUESTO_DE_ROL[actor.role];
  if (suyo === "ninguno") return { ruta: "/acceso", nombre: "el acceso" };
  if (suyo === "panel") {
    return puedeVerInicio(actor)
      ? { ruta: "/panel", nombre: "el panel" }
      : { ruta: "/acceso", nombre: "el acceso" };
  }
  const ruta = RUTA_DE_SUPERFICIE[suyo];
  if (ruta && alcanza(actor, SURFACE_ACTION[suyo])) {
    return { ruta, nombre: NOMBRE_SUPERFICIE[suyo] ?? "tu puesto" };
  }
  return { ruta: "/acceso", nombre: "el acceso" };
}

/**
 * ¿Su puesto no usa ninguna pantalla? La cocina trabaja con la comanda impresa (ADR-022, B6-2): quien
 * entra con ese rol no tiene a dónde ir, y el acceso se lo dice en vez de dejarlo en blanco.
 */
export function sinPantalla(actor: Actor): boolean {
  return PUESTO_DE_ROL[actor.role] === "ninguno";
}

