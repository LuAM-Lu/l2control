import { AccesoScreen, type Operador } from "../../../src/features/identity/AccesoScreen";
import type { Device } from "@l2/domain-identity";

/**
 * Acceso por PIN atado a dispositivo (F2-03, ADR-013).
 *
 * El dispositivo se resuelve EN EL SERVIDOR a partir de su credencial: el
 * cliente no puede declararse a sí mismo autorizado. Aquí se simula con un
 * parámetro `?device=` para poder ver los cuatro caminos sin backend.
 */
export const dynamic = "force-dynamic";

/**
 * `null` aquí significa «dispositivo desconocido», que es un caso legítimo y
 * NO «falta el dato». La diferencia importa: resolver con `??` haría que un
 * desconocido cayera al dispositivo aprobado — justo la ambigüedad del nulo
 * que ADR-011 prohíbe. Se resuelve comprobando la pertenencia a la clave.
 */
const DISPOSITIVOS: Record<string, Device | null> = {
  aprobado: { id: "d1", label: "Tablet taquilla", branchId: "b1", status: "APROBADO" },
  pendiente: { id: "d2", label: "Tablet mesero 3", branchId: "b1", status: "PENDIENTE" },
  revocado: { id: "d3", label: "Tablet extraviada", branchId: "b1", status: "REVOCADO" },
  desconocido: null,
};

/**
 * Las personas que pueden entrar en este equipo.
 *
 * Cada rol entra directamente a su puesto (§7.3) —identificarse y tener que
 * buscar después dónde se trabaja son dos pasos donde debería haber uno—, pero
 * **cuál es ese puesto ya no se declara aquí**: lo resuelve `puestoDe()`, la
 * misma función que usan las guardias. Eran dos verdades sobre lo mismo y
 * discrepaban (N-02 de la auditoría).
 *
 * TODO(F2-11/backend): esta lista sale del directorio de personas, filtrando
 * las que están de baja. Hoy son dos listas distintas, con identificadores
 * distintos, y Carla no aparece aquí por casualidad y no por regla (N-07).
 */
const OPERADORES: Operador[] = [
  {
    id: "u0",
    nombre: "Abigail Karam",
    rol: "Administradora",
    role: "ADMIN",
  },
  {
    id: "u1",
    nombre: "Marisol Prieto",
    rol: "Cajera",
    role: "CAJERO",
  },
  {
    id: "u2",
    nombre: "Luis Guerrero",
    rol: "Supervisor",
    role: "SUPERVISOR",
  },
  {
    id: "u3",
    nombre: "Ana Rojas",
    rol: "Monitora de parque",
    role: "MONITOR_PARQUE",
  },
  {
    id: "u5",
    nombre: "Jesús Mendoza",
    rol: "Mesero",
    role: "MESERO",
  },
  {
    id: "u4",
    nombre: "Diego Salas",
    rol: "Cocina",
    role: "COCINA",
  },
];

export default async function AccesoPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const { device } = await searchParams;
  const clave = device ?? "aprobado";
  const seleccionado = clave in DISPOSITIVOS ? DISPOSITIVOS[clave]! : DISPOSITIVOS["aprobado"]!;

  return <AccesoScreen device={seleccionado} operadores={OPERADORES} />;
}
