import { notFound } from "next/navigation";
import { SeccionPendienteScreen } from "../../../../../src/features/shell/SeccionPendienteScreen";
import { buscarModulo, buscarSeccion } from "../../../../../src/features/shell/navigation";
import { UsuariosPage } from "../../../../../src/features/identity/UsuariosPage";
import { EditorPlano } from "../../../../../src/features/mesas/EditorPlano";
import { EditorCarta } from "../../../../../src/features/mesas/EditorCarta";
import { EditorTarifario } from "../../../../../src/features/park/EditorTarifario";
import { AccesosPage } from "../../../../../src/features/identity/AccesosPage";
import { DispositivosPage } from "../../../../../src/features/identity/DispositivosPage";
import { dispositivosDelLocal } from "../../../../../src/features/identity/dispositivos.servidor";
import { accesosDelLocal, directorioDelLocal } from "../../../../../src/features/identity/identidad.servidor";
import { EditorSucursal } from "../../../../../src/features/sucursal/EditorSucursal";
import { RepresentantesPage } from "../../../../../src/features/park/RepresentantesPage";
import { TasasPage } from "../../../../../src/features/cash/TasasPage";
import { autorizadoresDeTasa } from "../../../../../src/features/cash/tasas.servidor";
import { MediosPage } from "../../../../../src/features/cash/MediosPage";

/**
 * Secciones del back-office que ya tienen pantalla propia bajo esta ruta.
 *
 * Viven aquí, bajo la ruta dinámica, y no en carpetas estáticas hermanas: una
 * carpeta `personas/` junto a `[modulo]/` haría que `/panel/personas` dejara
 * de encontrar la página del módulo. Añadir una pantalla es una línea.
 */
const PANTALLAS: Readonly<Record<string, () => React.ReactNode | Promise<React.ReactNode>>> = {
  "personas/usuarios": async () => <UsuariosPage directorio={await directorioDelLocal()} />,
  "restaurante/plano": () => <EditorPlano />,
  "restaurante/carta": () => <EditorCarta />,
  "parque/tarifas": () => <EditorTarifario />,
  "personas/dispositivos": async () => <DispositivosPage directorio={await dispositivosDelLocal()} />,
  "personas/representantes": () => <RepresentantesPage />,
  "caja/tasas": async () => <TasasPage autorizadores={await autorizadoresDeTasa()} />,
  "caja/medios": () => <MediosPage />,
  "configuracion/sucursal": () => <EditorSucursal />,
  "configuracion/accesos": async () => <AccesosPage accesos={await accesosDelLocal()} />,
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
  if (Pantalla) return await Pantalla();

  const seccion = buscarSeccion(modulo, seccionId);
  if (!seccion || seccion.href !== null) notFound();

  return <SeccionPendienteScreen modulo={modulo} seccion={seccion} />;
}
