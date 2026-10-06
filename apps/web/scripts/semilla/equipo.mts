/**
 * El equipo de DESARROLLO que siembra `pnpm db:semilla` (B1-4). Inventado. Todos entran con el
 * PIN 1970, SOLO en desarrollo (la semilla se niega fuera de él). Los reales llegan con F0-04.
 */
import type { PersonaASembrar } from "@l2/application";

const PIN_DE_DESARROLLO = "1970";

export const EQUIPO_DESARROLLO: readonly PersonaASembrar[] = [
  { nombre: "Abigail Karam", role: "ADMIN", pin: PIN_DE_DESARROLLO },
  { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: PIN_DE_DESARROLLO },
  { nombre: "Marisol Prieto", role: "CAJERO", pin: PIN_DE_DESARROLLO },
  { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: PIN_DE_DESARROLLO },
  { nombre: "Jesús Mendoza", role: "MESERO", pin: PIN_DE_DESARROLLO },
  { nombre: "Diego Salas", role: "COCINA", pin: PIN_DE_DESARROLLO },
  // De baja: el acceso no la ofrece, pero sus asientos la siguen nombrando (regla 5).
  { nombre: "Carla Benítez", role: "CAJERO", pin: PIN_DE_DESARROLLO, activa: false },
];

/**
 * Quién es la administración de desarrollo: a ella le imprime la semilla su enlace de alta para
 * poner contraseña y llave de acceso (ADR-020). No hay contraseña ni secreto fijos.
 */
export const ADMIN_DESARROLLO = "Abigail Karam";
