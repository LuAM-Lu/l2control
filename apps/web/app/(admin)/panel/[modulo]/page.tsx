import { notFound } from "next/navigation";
import type { Actor } from "@l2/domain-identity";
import { ModuloScreen } from "../../../../src/features/shell/ModuloScreen";
import { MODULOS, buscarModulo } from "../../../../src/features/shell/navigation";

/**
 * Página de un módulo del back-office.
 *
 * Una sola ruta dinámica sirve los seis módulos, leyendo el mapa de
 * `navigation.ts`. Un archivo por módulo sería seis copias del mismo código
 * esperando a desincronizarse.
 */
export function generateStaticParams() {
  return MODULOS.map((m) => ({ modulo: m.id }));
}

export default async function ModuloPage({
  params,
}: {
  params: Promise<{ modulo: string }>;
}) {
  const { modulo: id } = await params;
  const modulo = buscarModulo(id);
  if (!modulo) notFound();

  // TODO(F2-12/backend): el actor vendrá de la sesión (§11.4).
  const actor: Actor = { id: "u-admin", role: "ADMIN", branchIds: ["b1"] };

  return <ModuloScreen modulo={modulo} actor={actor} />;
}
