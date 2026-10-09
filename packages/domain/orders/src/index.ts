/**
 * L2 Control — el restaurante: el plano del local y el pedido del mesero.
 *
 * La máquina de estados de la comanda («en fuego», «listo», «entregado», F6-08) se retiró con B6-2:
 * la cocina trabaja con la comanda impresa y el sistema no sabe cuándo un plato está listo (ADR-022).
 *
 * Puro: sin reloj, sin E/S. El instante, el catálogo y la cola entran como argumento.
 */
export { cambioDePlanoProblem, mesasRetiradas, type MesaDelPlano, type ProblemaDePlano } from "./plano.ts";
export {
  AREAS_DE_COMANDA,
  MAX_UNIDADES_POR_PEDIDO,
  areaDe,
  comandaPideAtencion,
  estadoDelPedido,
  partesDelPedido,
  type AreaDeComanda,
  type AreaDeProducto,
  estadoDeComanda,
  lineasDelPedido,
  type EstadoDeComanda,
  type EstadoDeTrabajo,
  type LineaPedida,
  type PlatoAhora,
  type ProblemaDePedido,
  type UnidadPedida,
} from "./pedido.ts";
export {
  atencionDeCuentas,
  resumenDeEspera,
  type AtencionDeCuenta,
  type CuentaParaAtencion,
  type PedidoParaAtencion,
  type ResumenDeEspera,
  type UmbralesDeAtencion,
} from "./atencion.ts";
