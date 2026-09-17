import { AccesoScreen, type Operador } from "../../../src/features/identity/AccesoScreen";
import type { Device } from "@l2/domain-identity";
import { DEMO_USUARIOS } from "../../../src/demo/usuarios";
import { NOMBRE_ROL } from "../../../src/features/identity/permisos";

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
 * Las personas que pueden entrar en este equipo — N-07 y N-08.
 *
 * **Salen del directorio de personas**, no de una lista propia: eran dos
 * verdades con identificadores distintos, y quien daba de baja a alguien en
 * «Usuarios y permisos» lo seguía viendo aquí. Ahora no aparecer es una regla
 * (`active`), no una casualidad.
 *
 * A qué puesto entra cada rol tampoco se declara aquí: lo resuelve `puestoDe()`,
 * la misma función que usan las guardias (N-02).
 *
 * TODO(F2-03/backend): el directorio y la sesión vendrán del servidor; la forma
 * ya es la definitiva, así que ese cambio no toca esta pantalla (§11.4).
 */
const OPERADORES: Operador[] = DEMO_USUARIOS.filter((u) => u.active).map((u) => ({
  id: u.id,
  nombre: u.fullName,
  rol: NOMBRE_ROL[u.role],
  role: u.role,
}));

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
