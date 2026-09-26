"use client";

import { createContext, createElement, useContext, useEffect, useSyncExternalStore } from "react";
import type { Role } from "@l2/domain-identity";
import { salir } from "./acceso.acciones";

/**
 * Quién tiene la sesión en este equipo — F2-12, en el servidor desde B1-4 (ADR-018).
 *
 * La sesión vive en el SERVIDOR: el layout la lee de su cookie `httpOnly` y la pasa aquí. El
 * navegador no la guarda ni la puede inventar; lo que se pinte a partir de ella es experiencia
 * de usuario, y cada acción la vuelve a comprobar en el servidor.
 */

export type OperadorEnSesion = Readonly<{ id: string; nombre: string; rol: string; role: Role }>;

/**
 * En qué puesto se sienta cada rol — F9-08, D7.
 *
 * El panel en vivo enseña quién está en cada puesto y marca el que se queda sin nadie en hora
 * de servicio. TODO(B1-3): el puesto saldrá del registro del dispositivo, no del rol.
 */
export const PUESTO_DE_ROL: Readonly<Record<Role, string>> = {
  CAJERO: "caja",
  MONITOR_PARQUE: "taquilla",
  MESERO: "salon",
  COCINA: "cocina",
  ADMIN: "administracion",
  SUPERVISOR: "administracion",
};

const Contexto = createContext<Readonly<{ operador: OperadorEnSesion | null; sesionId: string | null }>>({
  operador: null,
  sesionId: null,
});

/**
 * Al salir, la persona deja de verse EN EL ACTO, sin esperar a que el servidor responda: una
 * pantalla que sigue diciendo «Marisol» un instante después de salir invita a operar a su nombre.
 * Se anula la sesión que el layout pintó (`vigente`) y se levanta cuando llega otra.
 */
let vigente: string | null = null;
let anulada: string | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((o) => o());
const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => void oyentes.delete(o);
};

export function SesionProvider({
  operador,
  sesionId,
  children,
}: {
  operador: OperadorEnSesion | null;
  sesionId: string | null;
  children: React.ReactNode;
}) {
  useEffect(() => {
    vigente = sesionId;
    if (anulada !== null && anulada !== sesionId) {
      anulada = null;
      avisar();
    }
  }, [sesionId]);
  return createElement(Contexto.Provider, { value: { operador, sesionId } }, children);
}

/** La persona con sesión, o `null` si nadie entró (o acaba de salir). */
export function useOperador(): OperadorEnSesion | null {
  const { operador, sesionId } = useContext(Contexto);
  const cerrada = useSyncExternalStore(suscribir, () => anulada !== null && anulada === sesionId, () => false);
  return cerrada ? null : operador;
}

/**
 * Cierra la sesión en el servidor. Quien llama suele ir después al acceso; no hace falta
 * esperar a la promesa para eso. El corte Z la cierra con su propio motivo (F2-12).
 */
export function cerrarSesion(motivo: "SALIDA" | "CORTE_Z" = "SALIDA"): Promise<void> {
  if (vigente !== null) {
    anulada = vigente;
    avisar();
  }
  return salir(motivo);
}
