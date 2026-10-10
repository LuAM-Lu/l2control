import { notFound, redirect } from "next/navigation";
import { SeccionPendienteScreen } from "../../../../../src/features/shell/SeccionPendienteScreen";
import { RUTAS_MOVIDAS, buscarModulo, buscarSeccion, pestanaPedida } from "../../../../../src/features/shell/navigation";
import { MarcoDeSeccion } from "../../../../../src/features/shell/MarcoDeSeccion";
import { UsuariosPage } from "../../../../../src/features/identity/UsuariosPage";
import { EditorPlano } from "../../../../../src/features/mesas/EditorPlano";
import { SoporteScreen } from "../../../../../src/features/soporte/SoporteScreen";
import { AtencionScreen } from "../../../../../src/features/mesas/AtencionScreen";
import { bandejaDeSoporte } from "../../../../../src/features/soporte/soporte.servidor";
import { CartaScreen } from "../../../../../src/features/mesas/CartaScreen";
import { EditorTarifario } from "../../../../../src/features/park/EditorTarifario";
import { versionesDelTarifario } from "../../../../../src/features/park/tarifario.servidor";
import { AccesosPage } from "../../../../../src/features/identity/AccesosPage";
import { DispositivosPage } from "../../../../../src/features/identity/DispositivosPage";
import { dispositivosDelLocal } from "../../../../../src/features/identity/dispositivos.servidor";
import { accesosDelLocal, credencialesDelLocal, directorioDelLocal } from "../../../../../src/features/identity/identidad.servidor";
import { EditorSucursal } from "../../../../../src/features/sucursal/EditorSucursal";
import { SemillaScreen } from "../../../../../src/features/sucursal/SemillaScreen";
import { SistemaScreen } from "../../../../../src/features/sistema/SistemaScreen";
import { estadoDelSistema } from "../../../../../src/features/sistema/sistema.servidor";
import { RespaldosScreen } from "../../../../../src/features/sistema/RespaldosScreen";
import { estadoDeRespaldos } from "../../../../../src/features/sistema/respaldos.servidor";
import { entorno } from "../../../../../src/servidor/entorno";
import { RepresentantesPage } from "../../../../../src/features/park/RepresentantesPage";
import { directorioDeFamilias } from "../../../../../src/features/park/parque.servidor";
import { TasasPage } from "../../../../../src/features/cash/TasasPage";
import { autorizadoresDeTasa, paginaDeTasas } from "../../../../../src/features/cash/tasas.servidor";
import { MediosPage } from "../../../../../src/features/cash/MediosPage";
import { DescuentosScreen } from "../../../../../src/features/cash/DescuentosScreen";
import { descuentosDelLocal } from "../../../../../src/features/cash/descuentos.servidor";
import { ImpresorasScreen } from "../../../../../src/features/impresion/ImpresorasScreen";
import { agenteDescargable, direccionDelWorker, historialDelLocal, impresorasDelLocal } from "../../../../../src/features/impresion/impresion.servidor";
import { ImpuestosScreen } from "../../../../../src/features/cash/ImpuestosScreen";
import { impuestosDelLocal } from "../../../../../src/features/cash/impuestos.servidor";
import { FeriadosScreen } from "../../../../../src/features/cash/FeriadosScreen";
import { feriadosDelLocal } from "../../../../../src/features/cash/feriados.servidor";
import { ProductosScreen } from "../../../../../src/features/inventario/ProductosScreen";
import { catalogoDelLocal } from "../../../../../src/features/inventario/productos.servidor";
import { EntradasScreen } from "../../../../../src/features/inventario/EntradasScreen";
import { entradasDelLocal } from "../../../../../src/features/inventario/entradas.servidor";
import { SalidasScreen } from "../../../../../src/features/inventario/SalidasScreen";
import { ajustesDelLocal } from "../../../../../src/features/inventario/salidas.servidor";
import { EventosScreen } from "../../../../../src/features/eventos/EventosScreen";
import { CumpleanosScreen } from "../../../../../src/features/eventos/CumpleanosScreen";
import { agendaDeEventos, catalogoDeEventos } from "../../../../../src/features/eventos/eventos.servidor";
import { VentasScreen } from "../../../../../src/features/reportes/VentasScreen";
import { MovimientosScreen } from "../../../../../src/features/reportes/MovimientosScreen";
import { InventarioAlMomentoScreen } from "../../../../../src/features/reportes/InventarioAlMomentoScreen";
import { DeudasReporteScreen } from "../../../../../src/features/reportes/DeudasReporteScreen";
import { PersonalReporteScreen } from "../../../../../src/features/reportes/PersonalReporteScreen";
import { ParqueReporteScreen } from "../../../../../src/features/reportes/ParqueReporteScreen";
import { informeDeDeudas, informeDeInventario, informeDeMovimientos, informeDeVentas, informeDelParque, valesDelPeriodo, type ConsultaEnLaDireccion } from "../../../../../src/features/reportes/reportes.servidor";

/**
 * Secciones del back-office que ya tienen pantalla propia bajo esta ruta.
 *
 * Viven aquí, bajo la ruta dinámica, y no en carpetas estáticas hermanas: una
 * carpeta `ajustes/` junto a `[modulo]/` haría que `/panel/ajustes` dejara
 * de encontrar la página del módulo. Añadir una pantalla es una línea.
 */
const PANTALLAS: Readonly<Record<string, (q: ConsultaEnLaDireccion) => React.ReactNode | Promise<React.ReactNode>>> = {
  "parque/representantes": async () => <RepresentantesPage inicial={await directorioDeFamilias()} descuentos={await descuentosDelLocal()} />,
  "parque/eventos": async () => <EventosScreen catalogo={await catalogoDeEventos()} agenda={await agendaDeEventos()} />,
  "ajustes/cumpleanos": async () => <CumpleanosScreen publicado={await catalogoDeEventos()} productos={await catalogoDelLocal()} />,
  "ajustes/tarifas": async () => <EditorTarifario versiones={await versionesDelTarifario()} />,
  "ajustes/plano": () => <EditorPlano />,
  "ajustes/medios": () => <MediosPage />,
  "ajustes/descuentos": async () => <DescuentosScreen descuentos={await descuentosDelLocal()} catalogo={await catalogoDelLocal()} />,
  // T-18 (M-29): las secciones con pestañas leen solo lo de la pestaña abierta.
  "ajustes/tasas": async (q) => {
    const p = pestanaPedida("ajustes", "tasas", q.pestana);
    return (
      <MarcoDeSeccion modulo="ajustes" seccion="tasas" actual={p}>
        {p === "feriados" ? <FeriadosScreen feriados={await feriadosDelLocal()} /> : <TasasPage autorizadores={await autorizadoresDeTasa()} historial={await paginaDeTasas()} />}
      </MarcoDeSeccion>
    );
  },
  "ajustes/impuestos": async () => <ImpuestosScreen impuestos={await impuestosDelLocal()} />,
  "ajustes/personas": async (q) => {
    const p = pestanaPedida("ajustes", "personas", q.pestana);
    return (
      <MarcoDeSeccion modulo="ajustes" seccion="personas" actual={p}>
        {p === "accesos" ? (
          <AccesosPage accesos={await accesosDelLocal()} />
        ) : p === "dispositivos" ? (
          <DispositivosPage directorio={await dispositivosDelLocal()} />
        ) : (
          <UsuariosPage directorio={await directorioDelLocal()} credenciales={await credencialesDelLocal()} />
        )}
      </MarcoDeSeccion>
    );
  },
  "ajustes/sucursal": async () => <EditorSucursal catalogo={await catalogoDelLocal()} />,
  "ajustes/soporte": async () => <SoporteScreen inicial={await bandejaDeSoporte()} />,
  "restaurante/atencion": () => <AtencionScreen />,
  "ajustes/sistema": async (q) => {
    const p = pestanaPedida("ajustes", "sistema", q.pestana);
    return (
      <MarcoDeSeccion modulo="ajustes" seccion="sistema" actual={p}>
        {p === "respaldos" ? (
          <RespaldosScreen estado={await estadoDeRespaldos()} servidor={entorno().L2_URL_PUBLICA.replace(/\/$/, "")} />
        ) : p === "semilla" ? (
          <SemillaScreen />
        ) : (
          <SistemaScreen estado={await estadoDelSistema()} />
        )}
      </MarcoDeSeccion>
    );
  },
  "ajustes/impresoras": async () => (
    <ImpresorasScreen
      local={await impresorasDelLocal()}
      historial={await historialDelLocal()}
      worker={await direccionDelWorker()}
      descargable={await agenteDescargable()}
    />
  ),
  "inventario/productos": async (q) => {
    const p = pestanaPedida("inventario", "productos", q.pestana);
    return (
      <MarcoDeSeccion modulo="inventario" seccion="productos" actual={p}>
        {p === "carta" ? <CartaScreen catalogo={await catalogoDelLocal()} /> : <ProductosScreen catalogo={await catalogoDelLocal({ conRetirados: true })} />}
      </MarcoDeSeccion>
    );
  },
  "inventario/entradas": async (q) => <EntradasScreen catalogo={await catalogoDelLocal()} {...await entradasDelLocal(q)} />,
  "inventario/salidas": async () => <SalidasScreen catalogo={await catalogoDelLocal()} ajustes={await ajustesDelLocal()} />,
  // Los reportes (Etapa 11) leen su periodo de la dirección: se comparte el enlace y se ve lo mismo.
  "reportes/ventas": async (q) => <VentasScreen {...await informeDeVentas(q)} />,
  "reportes/movimientos": async (q) => <MovimientosScreen {...await informeDeMovimientos(q)} />,
  "reportes/inventario": async () => <InventarioAlMomentoScreen informe={await informeDeInventario()} />,
  "reportes/deudas": async (q) => <DeudasReporteScreen {...await informeDeDeudas(q)} />,
  "reportes/personal": async (q) => <PersonalReporteScreen {...await valesDelPeriodo(q)} />,
  "reportes/parque": async (q) => <ParqueReporteScreen {...await informeDelParque(q)} />,
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
  searchParams,
}: {
  params: Promise<{ modulo: string; seccion: string }>;
  searchParams: Promise<ConsultaEnLaDireccion>;
}) {
  const { modulo: moduloId, seccion: seccionId } = await params;
  // Lo que se mudó con M-13 (Ajustes, Turno) lleva a su sitio nuevo.
  const movida = RUTAS_MOVIDAS[`${moduloId}/${seccionId}`];
  if (movida) redirect(movida);
  const modulo = buscarModulo(moduloId);
  if (!modulo) notFound();

  const Pantalla = PANTALLAS[`${moduloId}/${seccionId}`];
  if (Pantalla) return await Pantalla(await searchParams);

  const seccion = buscarSeccion(modulo, seccionId);
  if (!seccion || seccion.href !== null) notFound();

  return <SeccionPendienteScreen modulo={modulo} seccion={seccion} />;
}
