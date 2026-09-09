import type { Actor } from "@l2/domain-identity";
import { AdminSidebar } from "../../src/features/shell/AdminSidebar";
import { PageTransition } from "../../src/features/shell/PageTransition";

/**
 * Cáscara del back-office — §9.10.2.
 *
 * Barra lateral que se recorta por permisos, y área de trabajo. Se usa en
 * escritorio y en teléfono (DEC-16), así que en móvil la barra pasa a panel
 * deslizable en lugar de desaparecer.
 *
 * Cada página pone su propia cabecera con su título y su contexto: la cáscara
 * aporta la navegación y la identidad, no el contenido.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // TODO(F2-12/backend): el actor vendrá de la sesión. La forma ya es la
  // definitiva, así que ese cambio no toca ninguna pantalla (§11.4).
  const actor: Actor = { id: "u-admin", role: "ADMIN", branchIds: ["b1"] };

  return (
    <div className="flex min-h-dvh bg-base">
      <AdminSidebar actor={actor} usuario="Abigail Karam" rol="Administradora" />
      <main className="flex min-w-0 flex-1 flex-col">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
