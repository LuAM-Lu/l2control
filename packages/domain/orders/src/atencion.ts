/**
 * El tiempo de atención en el salón — B6-8 (M-27, P-19, D-SERV).
 *
 * Administración quiere saber, por cuenta del salón, cuánto lleva sentada, cuánto lleva sin pedir y cuánto lleva
 * esperando lo que pidió; y que avise de las que pasan del umbral, para llamar a quien atiende. Esperar un pedido
 * termina cuando el mesero lo marca «Servido» (D-SERV): un pedido sin marcar sigue esperando, y el resumen lo dice.
 * Desde B6-11 se mide por plato: un pedido espera mientras le falte uno, y el resumen cuenta cada plato.
 *
 * Puro: el instante entra como argumento (ADR-010) y los tiempos se cuentan en minutos enteros.
 */

/** Lo que hace falta de un pedido: de qué cuenta, cuándo se envió y cuándo se sirvió. */
export type PedidoParaAtencion = Readonly<{
  cuentaId: string;
  enviadoEn: number;
  servidoEn: number | null;
  /** Anulado entero: no se espera. */
  anulado: boolean;
  /**
   * Sus platos (B6-11): cuándo se sirvió cada uno y si se anuló. Sin ellos, el pedido cuenta como un solo plato servido
   * cuando `servidoEn`.
   */
  platos?: readonly Readonly<{ servidoEn: number | null; anulado: boolean; sinHora?: boolean | undefined }>[] | undefined;
}>;

/** Los platos que se esperan de un pedido: los suyos sin anular, o el pedido como uno solo. */
const platosDe = (p: PedidoParaAtencion) =>
  p.platos && p.platos.length > 0 ? p.platos.filter((x) => !x.anulado) : [{ servidoEn: p.servidoEn, anulado: false }];
/** Le falta algún plato. */
const sinServir = (p: PedidoParaAtencion) => platosDe(p).some((x) => x.servidoEn === null);

export type CuentaParaAtencion = Readonly<{ id: string; abiertaEn: number }>;

/** A partir de cuántos minutos se avisa. */
export type UmbralesDeAtencion = Readonly<{ sinPedirMin: number; esperaMin: number }>;

export type AtencionDeCuenta = Readonly<{
  cuentaId: string;
  /** Minutos desde que se sentó (o se abrió la cuenta de pie). */
  sentadaMin: number;
  /** Sin ningún pedido todavía: minutos desde que se sentó. Con alguno, `null`. */
  sinPedirMin: number | null;
  /** El pedido sin servir más antiguo: cuánto lleva esperando. Sin ninguno, `null`. */
  esperandoMin: number | null;
  pedidosSinServir: number;
  /** Lo que pide atención, lo más urgente primero: esperar lo pedido pesa más que no haber pedido. */
  alerta: "ESPERANDO" | "SIN_PEDIR" | null;
}>;

const minutos = (desde: number, hasta: number) => Math.max(0, Math.floor((hasta - desde) / 60_000));

/** La atención de cada cuenta abierta del salón, la que más pide atención primero. */
export function atencionDeCuentas(
  cuentas: readonly CuentaParaAtencion[],
  pedidos: readonly PedidoParaAtencion[],
  ahora: number,
  umbrales: UmbralesDeAtencion,
): AtencionDeCuenta[] {
  const filas = cuentas.map((c): AtencionDeCuenta => {
    const suyos = pedidos.filter((p) => p.cuentaId === c.id && !p.anulado);
    const esperando = suyos.filter(sinServir);
    const masViejo = esperando.reduce<number | null>((m, p) => (m === null || p.enviadoEn < m ? p.enviadoEn : m), null);
    const sentadaMin = minutos(c.abiertaEn, ahora);
    const sinPedirMin = suyos.length === 0 ? sentadaMin : null;
    const esperandoMin = masViejo === null ? null : minutos(masViejo, ahora);
    const alerta =
      esperandoMin !== null && esperandoMin >= umbrales.esperaMin ? "ESPERANDO" : sinPedirMin !== null && sinPedirMin >= umbrales.sinPedirMin ? "SIN_PEDIR" : null;
    return { cuentaId: c.id, sentadaMin, sinPedirMin, esperandoMin, pedidosSinServir: esperando.length, alerta };
  });
  const peso = (a: AtencionDeCuenta) => (a.alerta === "ESPERANDO" ? 2 : a.alerta === "SIN_PEDIR" ? 1 : 0);
  return filas.sort((a, b) => peso(b) - peso(a) || (b.esperandoMin ?? b.sinPedirMin ?? 0) - (a.esperandoMin ?? a.sinPedirMin ?? 0) || b.sentadaMin - a.sentadaMin);
}

export type ResumenDeEspera = Readonly<{
  /** Platos servidos (con su espera medida, B6-11). */
  servidos: number;
  /** Espera media y máxima de lo servido, en minutos. Sin servidos, `null`. */
  mediaMin: number | null;
  maximaMin: number | null;
  /** Platos que siguen sin servir (o que nadie marcó). */
  sinServir: number;
}>;

/** El resumen del día, por plato: cuánto se esperó lo servido, de media y como mucho, y cuántos siguen sin servir. */
export function resumenDeEspera(pedidos: readonly PedidoParaAtencion[]): ResumenDeEspera {
  // Lo servido sin hora exacta (B6-13, marcado al pedir la cuenta) no espera, pero tampoco se mide.
  const platos = pedidos
    .filter((p) => !p.anulado)
    .flatMap((p) => platosDe(p).filter((x) => !("sinHora" in x && x.sinHora)).map((x) => ({ enviadoEn: p.enviadoEn, servidoEn: x.servidoEn })));
  const esperas = platos.filter((x) => x.servidoEn !== null).map((x) => Math.max(0, x.servidoEn! - x.enviadoEn));
  const validos = platos;
  return {
    servidos: esperas.length,
    mediaMin: esperas.length === 0 ? null : Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length / 60_000),
    // Las dos redondeadas igual: la media nunca puede pasar de la máxima.
    maximaMin: esperas.length === 0 ? null : Math.round(Math.max(...esperas) / 60_000),
    sinServir: validos.length - esperas.length,
  };
}
