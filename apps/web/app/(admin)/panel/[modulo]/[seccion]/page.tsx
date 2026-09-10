import { notFound } from "next/navigation";
import { SeccionPendienteScreen } from "../../../../../src/features/shell/SeccionPendienteScreen";
import { buscarModulo, buscarSeccion } from "../../../../../src/features/shell/navigation";

/**
 * Sección de un módulo que todavía no tiene pantalla propia.
 *
 * Solo llega aquí lo que el mapa declara sin `href`: si una sección ya tiene
 * su ruta —`/monitor`, `/caja`—, el menú enlaza directamente allí y esta
 * página no interviene. Una sección desconocida es un 404 de verdad, no una
 * pantalla vacía genérica.
 */
export default async function SeccionPage({
  params,
}: {
  params: Promise<{ modulo: string; seccion: string }>;
}) {
  const { modulo: moduloId, seccion: seccionId } = await params;
  const modulo = buscarModulo(moduloId);
  if (!modulo) notFound();

  const seccion = buscarSeccion(modulo, seccionId);
  if (!seccion || seccion.href !== null) notFound();

  return <SeccionPendienteScreen modulo={modulo} seccion={seccion} />;
}
