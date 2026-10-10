/**
 * La aplicación: los casos de uso, agrupados por dominio (§9.1), sobre una sola conexión.
 *
 *   const app = await conectar(entorno.L2_DB_APP_URL);
 *   await app.tarifario.publicar(ctx, datos);
 *
 * Las apps solo llegan a la base por aquí (`pnpm arch` lo impone).
 */
import { abrirBase } from "@l2/database";
import { casosTarifario, type CasosTarifario } from "./park/tarifario.ts";
import { casosParque, type CasosParque } from "./park/parque.ts";
import { casosRepresentantes, type CasosRepresentantes } from "./park/representantes.ts";
import { casosSucursal, type CasosSucursal } from "./sucursal/sucursal.ts";
import { casosAjustes, type CasosAjustes } from "./sucursal/ajustes.ts";
import { casosAuditoria, type CasosAuditoria } from "./auditoria/consultas.ts";
import { casosDispositivos, type CasosDispositivos } from "./identidad/dispositivos.ts";
import { casosSesiones, type CasosSesiones } from "./identidad/sesiones.ts";
import { casosEquipo, type CasosEquipo } from "./identidad/equipo.ts";
import { casosElevacion, type CasosElevacion } from "./identidad/elevacion.ts";
import { casosEnlaces, type CasosEnlaces } from "./identidad/enlaces.ts";
import { casosInstalacion, type CasosInstalacion } from "./identidad/instalacion.ts";
import { leerOrigenWeb } from "./identidad/llaves.ts";
import { casosPuestaAPunto, type CasosPuestaAPunto } from "./sucursal/puesta-a-punto.ts";
import { casosSalud, type CasosSalud } from "./sistema/salud.ts";
import { casosRecorridos, type CasosRecorridos } from "./sistema/recorridos.ts";
import { casosSoporte, type CasosSoporte } from "./sistema/soporte.ts";
import { casosFactores, type CasosFactores } from "./identidad/factores.ts";
import { crearCifrador } from "./identidad/cifrado.ts";
import { casosAccesos, type CasosAccesos } from "./identidad/accesos.ts";
import { casosTasas, type CasosTasas } from "./dinero/tasas.ts";
import { casosImpuestos, type CasosImpuestos } from "./dinero/impuestos.ts";
import { casosPagos, type CasosPagos } from "./dinero/pagos.ts";
import { casosTurnos, type CasosTurnos } from "./caja/turnos.ts";
import { casosMedios, type CasosMedios } from "./caja/medios.ts";
import { casosCuentas, type CasosCuentas } from "./caja/cuentas.ts";
import { casosJuntar, type CasosJuntar } from "./caja/juntar.ts";
import { casosDividir, type CasosDividir } from "./caja/dividir.ts";
import { casosVuelto, type CasosVuelto } from "./caja/vuelto.ts";
import { casosPapel, type CasosPapel } from "./caja/papel.ts";
import { casosDescuentos, type CasosDescuentos } from "./caja/descuentos.ts";
import { casosImpresion, type CasosImpresion } from "./impresion/impresion.ts";
import { casosVentas, type CasosVentas } from "./caja/ventas.ts";
import { casosPersonal, type CasosPersonal } from "./caja/personal.ts";
import { casosPuestos, type CasosPuestos } from "./sucursal/puestos.ts";
import { casosCortes, type CasosCortes } from "./caja/cortes.ts";
import { casosFeriados, type CasosFeriados } from "./dinero/feriados.ts";
import { casosProductos, type CasosProductos } from "./inventario/productos.ts";
import { casosRetiro, type CasosRetiro } from "./inventario/retiro.ts";
import { casosDevoluciones, type CasosDevoluciones } from "./caja/devoluciones.ts";
import { casosCategorias, type CasosCategorias } from "./inventario/categorias.ts";
import { casosSemilla, type CasosSemilla } from "./sucursal/semilla.ts";
import { casosActualizaciones, type CasosActualizaciones } from "./sistema/actualizaciones.ts";
import { casosRespaldos, type CasosRespaldos } from "./sistema/respaldos.ts";
import { casosReportes, type CasosReportes } from "./reportes/ventas.ts";
import { casosMovimientos, type CasosMovimientos } from "./reportes/movimientos.ts";
import { casosInformeDeDeudas, type CasosInformeDeDeudas } from "./reportes/deudas.ts";
import { casosInventarioAlMomento, type CasosInventarioAlMomento } from "./reportes/inventario.ts";
import { casosEntradas, type CasosEntradas } from "./inventario/entradas.ts";
import { casosSalidas, type CasosSalidas } from "./inventario/salidas.ts";
import { casosTiempoReal, type CasosTiempoReal } from "./tiempo-real/tiempo-real.ts";
import { casosPlano, type CasosPlano } from "./restaurante/plano.ts";
import { casosEventos, type CasosEventos } from "./park/eventos.ts";
import { casosPedidos, type CasosPedidos } from "./restaurante/pedidos.ts";
import { casosMesas, type CasosMesas } from "./restaurante/mesas.ts";
import { casosClientes, type CasosClientes } from "./clientes/clientes.ts";
import { casosDeudas, type CasosDeudas } from "./deudas/deudas.ts";
import { casosBorrador, type CasosBorrador } from "./caja/borrador.ts";
import { crearFirmante } from "./tiempo-real/ticket.ts";

export type { Contexto } from "./contexto.ts";
export type { CasosTarifario } from "./park/tarifario.ts";
export type { CasosParque } from "./park/parque.ts";
export type { CasosRepresentantes } from "./park/representantes.ts";
export type { CasosSucursal } from "./sucursal/sucursal.ts";
export { ajustesDeFabrica, type CasosAjustes } from "./sucursal/ajustes.ts";
export type { CasosAuditoria, FiltroAuditoria } from "./auditoria/consultas.ts";
export type { AccionAuditada } from "./auditoria/auditar.ts";
export type { CasosDispositivos, EstadoDispositivo, Lugar } from "./identidad/dispositivos.ts";
export type { CambioHecho, CasosEquipo, PersonaASembrar } from "./identidad/equipo.ts";
export type { CasosAccesos } from "./identidad/accesos.ts";
export { DIAS_POR_ADELANTADO, UMBRAL_VARIACION_BPS, type CasosTasas } from "./dinero/tasas.ts";
export { DIAS_POR_ADELANTADO_IMPUESTOS, type CasosImpuestos } from "./dinero/impuestos.ts";
export type { CasosPagos } from "./dinero/pagos.ts";
export type { CasosTurnos } from "./caja/turnos.ts";
export type { CasosMedios } from "./caja/medios.ts";
export type { CasosCuentas } from "./caja/cuentas.ts";
export type { CasosPapel } from "./caja/papel.ts";
export type { CasosDescuentos } from "./caja/descuentos.ts";
export { AGENTE_CONECTADO_MS, VIGENCIA_CODIGO_MS, type AgenteAbierto, type CasosImpresion } from "./impresion/impresion.ts";
export type { CasosVentas } from "./caja/ventas.ts";
export type { CasosCortes } from "./caja/cortes.ts";
export type { CasosFeriados } from "./dinero/feriados.ts";
export type { CasosPlano } from "./restaurante/plano.ts";
export type { CasosEventos } from "./park/eventos.ts";
export type { CasosPedidos } from "./restaurante/pedidos.ts";
export { DIAS_POR_ADELANTADO_PRECIOS, type CasosProductos } from "./inventario/productos.ts";
export type { CasosCategorias } from "./inventario/categorias.ts";
export type { CasosSemilla } from "./sucursal/semilla.ts";
export { compararVersiones, type CasosActualizaciones, type Servidor } from "./sistema/actualizaciones.ts";
export { clasificar as clasificarRespaldos, type CasosRespaldos, type PcDeRespaldos } from "./sistema/respaldos.ts";
export { type CasosEntradas } from "./inventario/entradas.ts";
export { AJUSTES_RECIENTES, type CasosSalidas } from "./inventario/salidas.ts";
export type { Aviso, CasosTiempoReal } from "./tiempo-real/tiempo-real.ts";
export { TICKET_MS, type DatosDelTicket } from "./tiempo-real/ticket.ts";
export { TEMAS_DE_ACCION, temasDe } from "./tiempo-real/temas.ts";
export { AutorizacionSchema, exigirPermisoOAutorizacion, type Autorizacion } from "./identidad/autorizacion.ts";
export { ELEVACION_MS, type CasosElevacion } from "./identidad/elevacion.ts";
export { ENLACE_MS, type AltaCompletada, type CasosEnlaces } from "./identidad/enlaces.ts";
export type { CasosInstalacion, InstalacionHecha } from "./identidad/instalacion.ts";
export {
  CODIGOS_DE_RECUPERACION,
  DESAFIO_MS,
  type Desafio,
  type OpcionesDeFirma,
  type OpcionesDeRegistro,
} from "./identidad/llaves.ts";
export type { CasosPuestaAPunto } from "./sucursal/puesta-a-punto.ts";
export type { CasosSalud } from "./sistema/salud.ts";
export { huellaDelError, INTENTOS_DE_AVISO, type CasosSoporte, type ReporteParaAvisar } from "./sistema/soporte.ts";
export type { CasosFactores } from "./identidad/factores.ts";
export type { OpcionesDeConfirmacion } from "./identidad/elevacion.ts";
export {
  contextoDeSesion,
  SESION_INACTIVA_MS,
  type Bloqueo,
  type CasosSesiones,
  type PersonaParaAcceso,
  type ResultadoEntrada,
  type SesionActiva,
} from "./identidad/sesiones.ts";

export interface Aplicacion {
  readonly tarifario: CasosTarifario;
  readonly parque: CasosParque;
  readonly representantes: CasosRepresentantes;
  readonly sucursal: CasosSucursal;
  readonly ajustes: CasosAjustes;
  readonly auditoria: CasosAuditoria;
  readonly dispositivos: CasosDispositivos;
  readonly sesiones: CasosSesiones;
  readonly equipo: CasosEquipo;
  readonly elevacion: CasosElevacion;
  /** La app de autenticación y los equipos de confianza de cada persona (ADR-029). */
  readonly factores: CasosFactores;
  /** Los enlaces de alta de credenciales de administración (ADR-020). */
  readonly enlaces: CasosEnlaces;
  /** La instalación inicial de un local con la base vacía (ADR-020, M-12). */
  readonly instalacion: CasosInstalacion;
  /** La lista de lo que falta para abrir el primer día, que se tacha sola (JORNADA §2). */
  readonly puestaAPunto: CasosPuestaAPunto;
  readonly accesos: CasosAccesos;
  readonly tasas: CasosTasas;
  readonly impuestos: CasosImpuestos;
  readonly pagos: CasosPagos;
  readonly turnos: CasosTurnos;
  readonly medios: CasosMedios;
  readonly cuentas: CasosCuentas;
  /** Cobrar juntas (B3-16): varias cuentas de la cola en una, con un solo recibo. */
  readonly cobrarJuntas: CasosJuntar;
  /** Dividir por ítems (B3-20): partir un ítem, la cuenta de cada persona y unir de nuevo. */
  readonly dividir: CasosDividir;
  /** El vuelto (B3-19): si la gaveta alcanza, sin decir cuánto hay. */
  readonly vuelto: CasosVuelto;
  /** Lo anotado en papel cuando cayeron los dos enlaces: la carga, sus registros y su revisión (B3-7, ADR-027). */
  readonly papel: CasosPapel;
  /** Las reglas de descuento, las familias VIP y el descuento de cada cuenta (B3-6). */
  readonly descuentos: CasosDescuentos;
  /** Las impresoras, sus agentes y la cola de impresión (B5-2, ADR-026). */
  readonly impresion: CasosImpresion;
  readonly ventas: CasosVentas;
  /** El consumo del personal (B3-17): quiénes consumen, sus vales por quincena y reimprimirlos. */
  readonly personal: CasosPersonal;
  /** Los puestos por uso (T-20): la llegada y la última actividad de la caja, el parque y las mesas. */
  readonly puestos: CasosPuestos;
  readonly cortes: CasosCortes;
  readonly feriados: CasosFeriados;
  readonly productos: CasosProductos;
  /** Retirar un producto del catálogo y devolverlo (B9-11). */
  readonly retiro: CasosRetiro;
  /** Un cliente devuelve parte de lo que compró (B3-14). */
  readonly devoluciones: CasosDevoluciones;
  readonly categorias: CasosCategorias;
  readonly semilla: CasosSemilla;
  readonly actualizaciones: CasosActualizaciones;
  /** Los respaldos que hace el servidor y baja la PC del local (B7-4). */
  readonly respaldos: CasosRespaldos;
  /** Los reportes de solo lectura (Etapa 11, M-29). */
  readonly reportes: CasosReportes & CasosMovimientos & CasosInventarioAlMomento & CasosInformeDeDeudas;
  /** Las entradas de mercancía con su costo (B9-3). */
  readonly entradas: CasosEntradas;
  /** Las salidas con motivo y los conteos físicos, con su autorización (B9-4). */
  readonly salidas: CasosSalidas;
  /** El plano del local, versionado, y una sola cuenta abierta por mesa (B6-1). */
  readonly plano: CasosPlano;
  /** Los cumpleaños: los paquetes con su anticipo y las reservas con la cuenta del anticipo (B10-1). */
  readonly eventos: CasosEventos;
  /** Los pedidos del mesero y su comanda impresa (B6-2, ADR-022). */
  readonly pedidos: CasosPedidos;
  /** Vincular pulseras a una mesa: el parque pendiente pasa a la cuenta maestra (F6-05, B6-3). */
  readonly mesas: CasosMesas;
  /** El cliente de una cuenta del salón o del mostrador: buscarlo y ponérselo (B6-9, M-33). */
  readonly clientes: CasosClientes;
  /** Las deudas de clientes: quien se va sin pagar, cobrarlas cuando vuelve o darlas por perdidas (B3-11, M-33). */
  readonly deudas: CasosDeudas;
  /** El cobro en curso de cada cuenta, guardado en el servidor (B3-13, M-34). */
  readonly borradores: CasosBorrador;
  readonly tiempoReal: CasosTiempoReal;
  /** Los recorridos guiados que vio cada persona (T-12). */
  readonly recorridos: CasosRecorridos;
  /** Los reportes de problemas y su aviso al desarrollo (T-11, D-SOP). */
  readonly soporte: CasosSoporte;
  /** Si la base responde: lo pregunta el despliegue antes de dar una versión por buena (T-8a, ADR-028). */
  readonly salud: CasosSalud;
  cerrar(): Promise<void>;
}

export interface OpcionesDeConexion {
  /**
   * Clave AES-256 en base64 (L2_CLAVE_CIFRADO) para lo que se guarda cifrado: los
   * datos de cada pago y los datos de cobro del local (B3-2). Sin ella, esas funciones responden
   * NO_DISPONIBLE, y el canal en vivo no firma ni abre tickets (B5-1).
   */
  claveCifrado?: string | undefined;
  /**
   * La dirección con la que se abre el sistema en el navegador (L2_URL_PUBLICA), como
   * `https://l2.ejemplo.com`. Las llaves de acceso quedan atadas a su dominio y los enlaces de alta
   * se componen con ella. Sin ella, confirmar identidad, los enlaces y la instalación responden
   * NO_DISPONIBLE (fail-closed).
   */
  urlPublica?: string | undefined;
  /**
   * Si la cuenta de soporte (T-17, M-28) abre turnos y cobra: en staging sí, para reproducir un error con una copia de
   * la base; en producción no (M-29). Sin decirlo, no (fail-closed).
   */
  soporteOpera?: boolean | undefined;
}

/** Abre la base (y se niega si el usuario se salta la RLS) y devuelve los casos de uso. */
export async function conectar(urlBase: string | undefined, opciones: OpcionesDeConexion = {}): Promise<Aplicacion> {
  const cifrador = opciones.claveCifrado ? crearCifrador(opciones.claveCifrado) : null;
  const web = leerOrigenWeb(opciones.urlPublica);
  const base = await abrirBase(urlBase);
  const dispositivos = casosDispositivos(base);
  const sesiones = casosSesiones(base, dispositivos);
  const parque = casosParque(base);
  const cuentas = casosCuentas(base, cifrador, opciones.soporteOpera === true);
  const tarifario = casosTarifario(base);
  const ajustes = casosAjustes(base);
  const plano = casosPlano(base);
  const eventos = casosEventos(base);
  const impuestos = casosImpuestos(base);
  const medios = casosMedios(base, cifrador);
  const descuentos = casosDescuentos(base);
  const impresion = casosImpresion(base);
  return {
    tarifario,
    parque,
    representantes: casosRepresentantes(base),
    sucursal: casosSucursal(base),
    ajustes,
    auditoria: casosAuditoria(base),
    dispositivos,
    sesiones,
    equipo: casosEquipo(base),
    elevacion: casosElevacion(base, sesiones, web, cifrador),
    factores: casosFactores(base, cifrador),
    enlaces: casosEnlaces(base, web),
    instalacion: casosInstalacion(base, web),
    puestaAPunto: casosPuestaAPunto(base),
    accesos: casosAccesos(base),
    tasas: casosTasas(base),
    impuestos,
    pagos: casosPagos(base, cifrador),
    turnos: casosTurnos(base, opciones.soporteOpera === true),
    medios,
    cuentas,
    papel: casosPapel(base, parque, cuentas),
    descuentos,
    impresion,
    ventas: casosVentas(base, cifrador),
    personal: casosPersonal(base, cifrador),
    puestos: casosPuestos(base),
    cortes: casosCortes(base),
    feriados: casosFeriados(base),
    productos: casosProductos(base),
    retiro: casosRetiro(base),
    devoluciones: casosDevoluciones(base, cifrador, opciones.soporteOpera === true),
    categorias: casosCategorias(base),
    entradas: casosEntradas(base),
    salidas: casosSalidas(base),
    plano,
    eventos,
    semilla: casosSemilla(base, { ajustes, tarifario, plano, eventos, medios, descuentos, impuestos, impresion }),
    actualizaciones: casosActualizaciones(base),
    respaldos: casosRespaldos(base),
    reportes: { ...casosReportes(base), ...casosMovimientos(base), ...casosInventarioAlMomento(base), ...casosInformeDeDeudas(base) },
    pedidos: casosPedidos(base),
    mesas: casosMesas(base),
    cobrarJuntas: casosJuntar(base),
    dividir: casosDividir(base),
    vuelto: casosVuelto(base),
    clientes: casosClientes(base),
    deudas: casosDeudas(base),
    borradores: casosBorrador(base, cifrador),
    tiempoReal: casosTiempoReal(base, opciones.claveCifrado ? crearFirmante(opciones.claveCifrado) : null),
    salud: casosSalud(base),
    recorridos: casosRecorridos(base),
    soporte: casosSoporte(base),
    cerrar: () => base.cerrar(),
  };
}
