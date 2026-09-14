import { can, type Actor } from "@l2/domain-identity";
import { UsuariosScreen } from "./UsuariosScreen.tsx";
import type { UserSummaryDto } from "@l2/contracts";

/**
 * Página de usuarios y permisos (F2-11), en el servidor.
 *
 * Decide QUIÉN puede cambiar permisos antes de pintar nada: la pantalla recibe
 * `puedeGestionar` ya resuelto por la matriz, con la sucursal como parte del
 * permiso. Sin él, se ve pero no se edita — fail-closed.
 */
export function UsuariosPage({ usuarios }: { usuarios: readonly UserSummaryDto[] }) {
  // TODO(F2-12/backend): el actor vendrá de la sesión. La forma ya es la
  // definitiva, así que ese cambio no toca la pantalla (§11.4).
  const actor: Actor = { id: "u-abigail", role: "ADMIN", branchIds: ["b1"] };
  const puedeGestionar = can(actor, "usuarios.gestionar", { branchId: "b1" }) === "PERMITIDO";

  return (
    <UsuariosScreen
      usuarios={usuarios}
      autor={{ id: actor.id, nombre: "Abigail Karam" }}
      puedeGestionar={puedeGestionar}
    />
  );
}
