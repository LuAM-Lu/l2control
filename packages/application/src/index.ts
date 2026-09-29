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
import { casosAuditoria, type CasosAuditoria } from "./auditoria/consultas.ts";
import { casosDispositivos, type CasosDispositivos } from "./identidad/dispositivos.ts";
import { casosSesiones, type CasosSesiones } from "./identidad/sesiones.ts";
import { casosEquipo, type CasosEquipo } from "./identidad/equipo.ts";
import { casosElevacion, type CasosElevacion } from "./identidad/elevacion.ts";
import { crearCifrador } from "./identidad/cifrado.ts";
import { casosAccesos, type CasosAccesos } from "./identidad/accesos.ts";
import { casosTasas, type CasosTasas } from "./dinero/tasas.ts";
import { casosImpuestos, type CasosImpuestos } from "./dinero/impuestos.ts";
import { casosPagos, type CasosPagos } from "./dinero/pagos.ts";
import { casosTurnos, type CasosTurnos } from "./caja/turnos.ts";
import { casosMedios, type CasosMedios } from "./caja/medios.ts";
import { casosCuentas, type CasosCuentas } from "./caja/cuentas.ts";
import { casosVentas, type CasosVentas } from "./caja/ventas.ts";
import { casosCortes, type CasosCortes } from "./caja/cortes.ts";
import { casosFeriados, type CasosFeriados } from "./dinero/feriados.ts";
import { casosProductos, type CasosProductos } from "./inventario/productos.ts";
import { casosTiempoReal, type CasosTiempoReal } from "./tiempo-real/tiempo-real.ts";
import { crearFirmante } from "./tiempo-real/ticket.ts";

export type { Contexto } from "./contexto.ts";
export type { CasosTarifario } from "./park/tarifario.ts";
export type { CasosParque } from "./park/parque.ts";
export type { CasosRepresentantes } from "./park/representantes.ts";
export type { CasosSucursal } from "./sucursal/sucursal.ts";
export type { CasosAuditoria, FiltroAuditoria } from "./auditoria/consultas.ts";
export type { AccionAuditada } from "./auditoria/auditar.ts";
export type { CasosDispositivos, EstadoDispositivo, Lugar } from "./identidad/dispositivos.ts";
export type { CambioHecho, CasosEquipo, PersonaASembrar } from "./identidad/equipo.ts";
export type { CasosAccesos } from "./identidad/accesos.ts";
export { DIAS_POR_ADELANTADO, UMBRAL_VARIACION_BPS, ZONA_DEL_LOCAL, type CasosTasas } from "./dinero/tasas.ts";
export { DIAS_POR_ADELANTADO_IMPUESTOS, type CasosImpuestos } from "./dinero/impuestos.ts";
export type { CasosPagos } from "./dinero/pagos.ts";
export type { CasosTurnos } from "./caja/turnos.ts";
export type { CasosMedios } from "./caja/medios.ts";
export { MAX_RESIDUO, type CasosCuentas } from "./caja/cuentas.ts";
export type { CasosVentas } from "./caja/ventas.ts";
export type { CasosCortes } from "./caja/cortes.ts";
export type { CasosFeriados } from "./dinero/feriados.ts";
export { DIAS_POR_ADELANTADO_PRECIOS, type CasosProductos } from "./inventario/productos.ts";
export type { Aviso, CasosTiempoReal } from "./tiempo-real/tiempo-real.ts";
export { TICKET_MS, type DatosDelTicket } from "./tiempo-real/ticket.ts";
export { TEMAS_DE_ACCION, temasDe } from "./tiempo-real/temas.ts";
export { AutorizacionSchema, exigirPermisoOAutorizacion, type Autorizacion } from "./identidad/autorizacion.ts";
export { ELEVACION_MS, type CasosElevacion, type CredencialesNuevas } from "./identidad/elevacion.ts";
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
  readonly auditoria: CasosAuditoria;
  readonly dispositivos: CasosDispositivos;
  readonly sesiones: CasosSesiones;
  readonly equipo: CasosEquipo;
  readonly elevacion: CasosElevacion;
  readonly accesos: CasosAccesos;
  readonly tasas: CasosTasas;
  readonly impuestos: CasosImpuestos;
  readonly pagos: CasosPagos;
  readonly turnos: CasosTurnos;
  readonly medios: CasosMedios;
  readonly cuentas: CasosCuentas;
  readonly ventas: CasosVentas;
  readonly cortes: CasosCortes;
  readonly feriados: CasosFeriados;
  readonly productos: CasosProductos;
  readonly tiempoReal: CasosTiempoReal;
  cerrar(): Promise<void>;
}

export interface OpcionesDeConexion {
  /**
   * Clave AES-256 en base64 (L2_CLAVE_CIFRADO) para lo que se guarda cifrado: el secreto TOTP, los
   * datos de cada pago y los datos de cobro del local (B3-2). Sin ella, esas funciones responden
   * NO_DISPONIBLE, y el canal en vivo no firma ni abre tickets (B5-1).
   */
  claveCifrado?: string | undefined;
}

/** Abre la base (y se niega si el usuario se salta la RLS) y devuelve los casos de uso. */
export async function conectar(urlBase: string | undefined, opciones: OpcionesDeConexion = {}): Promise<Aplicacion> {
  const cifrador = opciones.claveCifrado ? crearCifrador(opciones.claveCifrado) : null;
  const base = await abrirBase(urlBase);
  const dispositivos = casosDispositivos(base);
  const sesiones = casosSesiones(base, dispositivos);
  return {
    tarifario: casosTarifario(base),
    parque: casosParque(base),
    representantes: casosRepresentantes(base),
    sucursal: casosSucursal(base),
    auditoria: casosAuditoria(base),
    dispositivos,
    sesiones,
    equipo: casosEquipo(base),
    elevacion: casosElevacion(base, sesiones, cifrador),
    accesos: casosAccesos(base),
    tasas: casosTasas(base),
    impuestos: casosImpuestos(base),
    pagos: casosPagos(base, cifrador),
    turnos: casosTurnos(base),
    medios: casosMedios(base, cifrador),
    cuentas: casosCuentas(base, cifrador),
    ventas: casosVentas(base, cifrador),
    cortes: casosCortes(base),
    feriados: casosFeriados(base),
    productos: casosProductos(base),
    tiempoReal: casosTiempoReal(base, opciones.claveCifrado ? crearFirmante(opciones.claveCifrado) : null),
    cerrar: () => base.cerrar(),
  };
}
