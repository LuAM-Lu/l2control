import type { Device } from "@l2/domain-identity";
import { AccesoScreen, type Operador } from "../../../src/features/identity/AccesoScreen";
import { NOMBRE_ROL } from "../../../src/features/identity/permisos";
import { PuertaDeInstalacion } from "../../../src/features/identity/InstalacionScreen";
import { aplicacion, contextoDelLocal } from "../../../src/servidor/aplicacion";
import { credencialEquipo } from "../../../src/servidor/sesion";

/**
 * Acceso por PIN atado a dispositivo (F2-02, F2-03, ADR-013 y ADR-018).
 *
 * El equipo se resuelve EN EL SERVIDOR a partir de su cookie `httpOnly`: el cliente no puede
 * declararse autorizado. Las personas que se ofrecen son las activas, con PIN, de la sucursal
 * de ESE equipo; a un equipo no aprobado no se le enseña ninguna.
 */
export const dynamic = "force-dynamic";

export default async function AccesoPage() {
  const app = await aplicacion();
  // Con la base vacía (M-12) no hay local que ofrecer: el acceso es «Instalar L2 Control» (ADR-020).
  const { tenantId, branchId } = contextoDelLocal();
  if (!(await app.instalacion.estado({ tenantId, branchId })).instalado) return <PuertaDeInstalacion instalado={false}>{null}</PuertaDeInstalacion>;

  const credencial = await credencialEquipo();
  const [equipo, personas] = await Promise.all([
    app.dispositivos.identificar(credencial),
    app.sesiones.personas(credencial),
  ]);

  // `null` es «equipo desconocido», un caso legítimo: la pantalla ofrece pedir su registro.
  const device: Device | null =
    equipo.estado === "DESCONOCIDO"
      ? null
      : { id: equipo.id, label: equipo.label, branchId: equipo.branchId, status: equipo.estado };

  const operadores: Operador[] = personas.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    rol: NOMBRE_ROL[p.role],
    role: p.role,
  }));

  // Un equipo pendiente enseña su código de emparejamiento y si su solicitud caducó (M-7).
  const pendiente =
    equipo.estado === "PENDIENTE" ? { codigo: equipo.codigo, caducada: equipo.caducada } : null;

  return (
    <PuertaDeInstalacion instalado>
      <AccesoScreen device={device} operadores={operadores} pendiente={pendiente} />
    </PuertaDeInstalacion>
  );
}
