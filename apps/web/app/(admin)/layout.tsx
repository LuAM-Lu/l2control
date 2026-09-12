import { Avisos } from "@l2/ui";
import { BackOfficeShell } from "../../src/features/shell/BackOfficeShell";

/**
 * Cáscara del back-office — §9.10.2.
 *
 * La navegación entera vive en `BackOfficeShell`, que necesita estado de
 * cliente (el cajón, los desplegables). Este layout es de servidor y solo
 * decide QUIÉN entra: el resto se recorta solo por permisos.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // El actor sale de la sesión dentro de la cáscara (V2 de UX-MEJORAS).
  // TODO(F2-12/backend): la sesión real vendrá de Better Auth; la forma ya
  // es la definitiva, así que ese cambio no toca ninguna pantalla (§11.4).
  return (
    <BackOfficeShell>
      {children}
      <Avisos posicion="top-right" />
    </BackOfficeShell>
  );
}
