/**
 * El tiempo de atención en el salón — B6-8 (M-27, P-19, D-SERV).
 *
 * Administración quiere saber, por cuenta del salón, cuánto lleva sentada, cuánto lleva sin pedir y cuánto lleva
 * esperando lo que pidió; y que avise de las que pasan del umbral, para llamar a quien atiende. Esperar un pedido
 * termina cuando el mesero lo marca «Servido» (D-SERV): un pedido sin marcar sigue esperando, y el resumen lo dice.
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
}>;

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
    const sinServir = suyos.filter((p) => p.servidoEn === null);
    const masViejo = sinServir.reduce<number | null>((m, p) => (m === null || p.enviadoEn < m ? p.enviadoEn : m), null);
    const sentadaMin = minutos(c.abiertaEn, ahora);
    const sinPedirMin = suyos.length === 0 ? sentadaMin : null;
    const esperandoMin = masViejo === null ? null : minutos(masViejo, ahora);
    const alerta =
      esperandoMin !== null && esperandoMin >= umbrales.esperaMin ? "ESPERANDO" : sinPedirMin !== null && sinPedirMin >= umbrales.sinPedirMin ? "SIN_PEDIR" : null;
    return { cuentaId: c.id, sentadaMin, sinPedirMin, esperandoMin, pedidosSinServir: sinServir.length, alerta };
  });
  const peso = (a: AtencionDeCuenta) => (a.alerta === "ESPERANDO" ? 2 : a.alerta === "SIN_PEDIR" ? 1 : 0);
  return filas.sort((a, b) => peso(b) - peso(a) || (b.esperandoMin ?? b.sinPedirMin ?? 0) - (a.esperandoMin ?? a.sinPedirMin ?? 0) || b.sentadaMin - a.sentadaMin);
}

export type ResumenDeEspera = Readonly<{
  /** Pedidos servidos (con su espera medida). */
  servidos: number;
  /** Espera media y máxima de lo servido, en minutos. Sin servidos, `null`. */
  mediaMin: number | null;
  maximaMin: number | null;
  /** Pedidos que siguen sin servir (o que nadie marcó). */
  sinServir: number;
}>;

/** El resumen del día: cuánto se esperó lo servido, de media y como mucho, y cuántos siguen sin servir. */
export function resumenDeEspera(pedidos: readonly PedidoParaAtencion[]): ResumenDeEspera {
  const validos = pedidos.filter((p) => !p.anulado);
  const esperas = validos.filter((p) => p.servidoEn !== null).map((p) => Math.max(0, p.servidoEn! - p.enviadoEn));
  return {
    servidos: esperas.length,
    mediaMin: esperas.length === 0 ? null : Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length / 60_000),
    // Las dos redondeadas igual: la media nunca puede pasar de la máxima.
    maximaMin: esperas.length === 0 ? null : Math.round(Math.max(...esperas) / 60_000),
    sinServir: validos.length - esperas.length,
  };
}
