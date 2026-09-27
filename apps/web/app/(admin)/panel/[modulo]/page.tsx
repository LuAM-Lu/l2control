import { notFound, redirect } from "next/navigation";
import { ModuloScreen } from "../../../../src/features/shell/ModuloScreen";
import { MODULOS, RUTAS_MOVIDAS, buscarModulo } from "../../../../src/features/shell/navigation";

/**
 * Página de un módulo del back-office.
 *
 * Una sola ruta dinámica sirve todos los módulos, leyendo el mapa de
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
  if (!modulo) {
    // Personas y Configuración se mudaron a Ajustes (M-13): un enlace viejo no se rompe.
    const movida = RUTAS_MOVIDAS[id];
    if (movida) redirect(movida);
    notFound();
  }

  return <ModuloScreen moduloId={modulo.id} />;
}
