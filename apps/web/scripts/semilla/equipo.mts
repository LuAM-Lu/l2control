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
 * La administración de desarrollo confirma identidad (F2-04) con esta contraseña y este secreto
 * TOTP, fijos para no depender de un autenticador: `pnpm totp` imprime el código vigente. SOLO en
 * desarrollo; en un local de verdad se dan con `pnpm credenciales "<nombre>"`.
 */
export const ADMIN_DESARROLLO = {
  nombre: "Abigail Karam",
  contrasena: "abby-kingdom-desarrollo",
  secretoBase32: "L2DESARROLLOABBYKINGDOMZZZZZZZZZ",
} as const;
