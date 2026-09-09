import { AccesoScreen, type Operador } from "../../src/features/identity/AccesoScreen";
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

const OPERADORES: Operador[] = [
  { id: "u1", nombre: "Marisol Prieto", rol: "Cajera" },
  { id: "u2", nombre: "Luis Guerrero", rol: "Supervisor" },
  { id: "u3", nombre: "Ana Rojas", rol: "Monitora de parque" },
  { id: "u4", nombre: "Diego Salas", rol: "Cocina" },
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
