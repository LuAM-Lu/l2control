"use client";

import { useSyncExternalStore } from "react";
import type { Role } from "@l2/domain-identity";

/**
 * Quién tiene la sesión en este equipo — F2-12, hallazgo A2 de UX-MEJORAS.
 *
 * Antes la barra de estación decía «Marisol Prieto · Cajera» en todas las
 * pantallas, también en la del mesero. Lo que se hace en una pantalla que
 * muestra a otra persona queda mal atribuido, así que la identidad sale de
 * quien entró por el acceso.
 *
 * TODO(F2-12/backend): la sesión real vendrá de Better Auth. Esto la simula en
 * `sessionStorage`: dura lo que la pestaña y no sobrevive a cerrarla, que es lo
 * que se espera de un equipo compartido.
 */

export type OperadorEnSesion = Readonly<{ id: string; nombre: string; rol: string; role: Role }>;

/**
 * En qué puesto se sienta cada rol — F9-08, D7.
 *
 * El panel en vivo enseña quién está en cada puesto y marca el que se queda
 * sin nadie en hora de servicio. Mientras el aparato no esté registrado
 * (F2-02), el puesto se deduce del rol: es lo que hay en un local con cuatro
 * equipos, uno por sitio.
 * TODO(F2-02/backend): el puesto sale del registro del dispositivo, no del rol.
 */
export const PUESTO_DE_ROL: Readonly<Record<Role, string>> = {
  CAJERO: "caja",
  MONITOR_PARQUE: "taquilla",
  MESERO: "salon",
  COCINA: "cocina",
  ADMIN: "administracion",
  SUPERVISOR: "administracion",
};

const CLAVE = "l2-operador";
const EVENTO = "l2-operador-cambio";

export function iniciarSesion(o: OperadorEnSesion): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(o));
  } catch {
    // Sin almacenamiento (modo privado estricto): la barra dirá «Sin identificar».
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function cerrarSesion(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
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

function leerCrudo(): string | null {
  try {
    return sessionStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

let cache: { crudo: string | null; valor: OperadorEnSesion | null } = { crudo: null, valor: null };

function leer(): OperadorEnSesion | null {
  const crudo = leerCrudo();
  if (crudo !== cache.crudo) {
    let valor: OperadorEnSesion | null = null;
    try {
      const o = crudo ? (JSON.parse(crudo) as Partial<OperadorEnSesion>) : null;
      // Lo guardado es una entrada no confiable: sin los campos, no hay sesión.
      if (o && typeof o.nombre === "string" && typeof o.rol === "string" && typeof o.role === "string" && typeof o.id === "string") {
        valor = o as OperadorEnSesion;
      }
    } catch {
      valor = null;
    }
    cache = { crudo, valor };
  }
  return cache.valor;
}

/** La persona con sesión, o `null` si nadie entró por el acceso (y siempre en el servidor). */
export function useOperador(): OperadorEnSesion | null {
  return useSyncExternalStore(suscribir, leer, () => null);
}
