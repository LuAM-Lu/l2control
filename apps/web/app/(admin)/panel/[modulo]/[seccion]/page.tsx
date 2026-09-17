import { notFound } from "next/navigation";
import { SeccionPendienteScreen } from "../../../../../src/features/shell/SeccionPendienteScreen";
import { buscarModulo, buscarSeccion } from "../../../../../src/features/shell/navigation";
import { UsuariosPage } from "../../../../../src/features/identity/UsuariosPage";
import { DEMO_USUARIOS } from "../../../../../src/demo/usuarios";
import { EditorPlano } from "../../../../../src/features/mesas/EditorPlano";
import { EditorCarta } from "../../../../../src/features/mesas/EditorCarta";
import { EditorTarifario } from "../../../../../src/features/park/EditorTarifario";
import { AccesosScreen } from "../../../../../src/features/identity/AccesosScreen";

/**
 * Secciones del back-office que ya tienen pantalla propia bajo esta ruta.
 *
 * Viven aquí, bajo la ruta dinámica, y no en carpetas estáticas hermanas: una
 * carpeta `personas/` junto a `[modulo]/` haría que `/panel/personas` dejara
 * de encontrar la página del módulo. Añadir una pantalla es una línea.
 */
const PANTALLAS: Readonly<Record<string, () => React.ReactNode>> = {
  // TODO(F2-11/backend): el directorio sale del servidor.
  "personas/usuarios": () => <UsuariosPage usuarios={DEMO_USUARIOS} />,
  "restaurante/plano": () => <EditorPlano />,
  "restaurante/carta": () => <EditorCarta />,
  "parque/tarifas": () => <EditorTarifario />,
  // TODO(F2-05/backend): el autor sale de la sesión y la sucursal, del dispositivo.
  "configuracion/accesos": () => (
    <AccesosScreen autor={{ id: "u-abigail", nombre: "Abigail Karam" }} branchId="b1" />
  ),
};

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

  const Pantalla = PANTALLAS[`${moduloId}/${seccionId}`];
  if (Pantalla) return <Pantalla />;

  const seccion = buscarSeccion(modulo, seccionId);
  if (!seccion || seccion.href !== null) notFound();

  return <SeccionPendienteScreen modulo={modulo} seccion={seccion} />;
}
