import type { Route } from "next";
import { SURFACE_ACTION, can, visibleSurfaces, type Action, type Actor, type SurfaceId } from "@l2/domain-identity";
import { INICIO, MODULOS, buscarModulo, buscarSeccion, type Modulo, type Seccion } from "../shell/navigation.ts";
import type { OperadorEnSesion } from "./operador.ts";

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

// TODO(F2-12/backend): la sucursal saldrá de la sesión del dispositivo.
const SUCURSAL = "b1";

export function actorDe(o: OperadorEnSesion): Actor {
  return { id: o.id, role: o.role, branchIds: [SUCURSAL] };
}

const alcanza = (actor: Actor, accion: Action) => can(actor, accion) !== "DENEGADO";

/* ── estaciones ── */

export const SUPERFICIE_DE_RUTA: Readonly<Record<string, SurfaceId>> = {
  "/monitor": "monitor",
  "/entrada": "entrada",
  "/salida": "salida",
  "/caja": "caja",
  // Ventas del turno: quien cobra ve lo que cobró (C12).
  "/ventas": "caja",
  "/turno": "turno",
  "/mesas": "mesas",
  "/cocina": "kds",
};

const NOMBRE_SUPERFICIE: Readonly<Partial<Record<SurfaceId, string>>> = {
  monitor: "la sala del parque",
  entrada: "la entrada del parque",
  salida: "la salida del parque",
  caja: "la caja",
  turno: "el turno de caja",
  mesas: "las mesas",
  kds: "la cocina",
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
  // Sin acción propia, la sección hereda la del módulo.
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

/** ¿Puede abrir esta dirección del panel? `/panel`, `/panel/x` o `/panel/x/y`. */
export function puedeAbrirPanel(actor: Actor, ruta: string): boolean {
  const [, , moduloId, seccionId] = ruta.split("/");
  if (!moduloId) return puedeVerInicio(actor);
  const m = buscarModulo(moduloId);
  // Una dirección que no existe la resuelve la página con su 404: no se
  // disfraza de «sin acceso».
  if (!m) return true;
  if (!seccionId) return puedeVerModulo(actor, m);
  const s = buscarSeccion(m, seccionId);
  return s ? puedeVerSeccion(actor, m, s) : true;
}

/* ── a dónde va cada uno ── */

const ORDEN_PUESTOS: readonly SurfaceId[] = ["caja", "monitor", "mesas", "kds", "entrada", "salida", "turno"];
const RUTA_DE_SUPERFICIE: Readonly<Partial<Record<SurfaceId, Route>>> = {
  caja: "/caja",
  monitor: "/monitor",
  mesas: "/mesas",
  kds: "/cocina",
  entrada: "/entrada",
  salida: "/salida",
  turno: "/turno",
};

/**
 * El puesto de trabajo de un rol: el panel para quien ve informes, si no su
 * primera estación. La cocina entra a la suya, `/cocina` (F6-07).
 */
export function puestoDe(actor: Actor): { ruta: Route; nombre: string } {
  if (puedeVerInicio(actor)) return { ruta: "/panel", nombre: "el panel" };
  const primera = visibleSurfaces(actor, ORDEN_PUESTOS)[0];
  const ruta = primera ? RUTA_DE_SUPERFICIE[primera] : undefined;
  if (primera && ruta) return { ruta, nombre: NOMBRE_SUPERFICIE[primera] ?? "tu puesto" };
  return { ruta: "/acceso", nombre: "el acceso" };
}
