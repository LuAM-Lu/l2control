import type { Actor } from "@l2/domain-identity";
import { BackOfficeShell } from "../../src/features/shell/BackOfficeShell";

/**
 * Cáscara del back-office — §9.10.2.
 *
 * La navegación entera vive en `BackOfficeShell`, que necesita estado de
 * cliente (el cajón, los desplegables). Este layout es de servidor y solo
 * decide QUIÉN entra: el resto se recorta solo por permisos.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // TODO(F2-12/backend): el actor vendrá de la sesión. La forma ya es la
  // definitiva, así que ese cambio no toca ninguna pantalla (§11.4).
  const actor: Actor = { id: "u-admin", role: "ADMIN", branchIds: ["b1"] };

  return (
    <BackOfficeShell actor={actor} usuario="Abigail Karam" rol="Administradora">
      {children}
    </BackOfficeShell>
  );
}
