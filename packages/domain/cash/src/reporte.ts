/**
 * El informe de ventas — B11-1, F9-01 (M-29). Puro: lo que el libro de pagos, las ventas y los cortes Z dicen de un
 * periodo de días de negocio. Sin base ni reloj: el día de hoy y las tasas entran como argumentos.
 *
 *  · El origen de una venta es la cuenta en que se cobró: una familia es del parque, una mesa (o una cuenta de pie) del
 *    restaurante, el mostrador es la venta directa y un evento es un cumpleaños. Salvo el tiempo del parque (M-37, U-6):
 *    el paquete y el tiempo de más son del parque aunque se cobren en la cuenta de una mesa (`repartoPorOrigen`).
 *  · Cada asiento en bolívares se lleva a dólares con la tasa con que se cobró (ADR-005), nunca con la de hoy: así el
 *    informe de ayer no cambia mañana. El USDT, a la par con el dólar (como en el cobro).
 *  · Un turno con su Z cerrado debe dar lo mismo que su Z: `cuadreConZ` dice qué no cuadra.
 */
import { allocateByRatios, convert, money, type FrozenRate, type Money } from "@l2/domain-money";

export type OrigenDeVenta = "PARQUE" | "RESTAURANTE" | "MOSTRADOR" | "CUMPLEANOS";
export const ORIGENES_DE_VENTA: readonly OrigenDeVenta[] = ["PARQUE", "RESTAURANTE", "MOSTRADOR", "CUMPLEANOS"];

/** De qué es una venta, por la cuenta en que se cobró. Una cuenta de pie es de mostrador, pero la abre el mesero. */
export function origenDeCuenta(kind: "FAMILIA" | "MESA" | "MOSTRADOR" | "EVENTO", dePie = false): OrigenDeVenta {
  if (dePie) return "RESTAURANTE";
  switch (kind) {
    case "FAMILIA":
      return "PARQUE";
    case "MESA":
      return "RESTAURANTE";
    case "MOSTRADOR":
      return "MOSTRADOR";
    case "EVENTO":
      return "CUMPLEANOS";
  }
}

/** Las líneas que son tiempo del parque, se cobren donde se cobren. */
const DEL_PARQUE: ReadonlySet<string> = new Set(["PAQUETE", "EXCEDENTE"]);

/**
 * Lo que una venta deja en cada origen (M-37, U-6): el paquete y el tiempo de más son del parque aunque se cobren en la
 * cuenta de una mesa; lo demás, del origen de la cuenta (las medias de una familia siguen siendo del parque). El total
 * de la venta, con su IVA y su descuento, se reparte en proporción al importe de cada línea, con el mayor resto: la suma
 * es el total, al céntimo. Una línea sin tipo conocido (una venta de antes) va con su cuenta; una juntada de otra cuenta
 * al cobrar juntas (B3-16), con la cuenta de la que vino (`deCuenta`).
 */
export function repartoPorOrigen(
  cuenta: Readonly<{ kind: "FAMILIA" | "MESA" | "MOSTRADOR" | "EVENTO"; dePie?: boolean }>,
  lineas: readonly Readonly<{
    kind?: string | undefined;
    amount: Money;
    deCuenta?: Readonly<{ kind: "FAMILIA" | "MESA" | "MOSTRADOR" | "EVENTO"; dePie?: boolean | undefined }> | undefined;
  }>[],
  total: Money,
): Map<OrigenDeVenta, Money> {
  const deLaCuenta = origenDeCuenta(cuenta.kind, cuenta.dePie === true);
  const origenDe = (l: (typeof lineas)[number]): OrigenDeVenta =>
    l.kind !== undefined && DEL_PARQUE.has(l.kind) ? "PARQUE" : l.deCuenta ? origenDeCuenta(l.deCuenta.kind, l.deCuenta.dePie === true) : deLaCuenta;
  const pesos = new Map<OrigenDeVenta, bigint>();
  for (const l of lineas) {
    if (l.amount.amount <= 0n) continue;
    const o = origenDe(l);
    pesos.set(o, (pesos.get(o) ?? 0n) + l.amount.amount);
  }
  const r = new Map<OrigenDeVenta, Money>();
  // Sin líneas con importe (todo regalado), el total va entero a la cuenta.
  if (pesos.size === 0) {
    r.set(deLaCuenta, total);
    return r;
  }
  const origenes = [...pesos.keys()];
  const partes = allocateByRatios(total, origenes.map((o) => pesos.get(o)!));
  origenes.forEach((o, i) => r.set(o, partes[i]!));
  return r;
}

/**
 * Un asiento en dólares, con la tasa con que se cobró (`tasa`, de bolívares a dólares). El dólar tal cual y el USDT
 * a la par; en bolívares sin tasa, `null`: no se inventa un equivalente.
 */
export function enDolaresConSuTasa(importe: Money, tasa: FrozenRate | null): Money | null {
  if (importe.currency === "USD") return importe;
  if (importe.currency === "USDT") return money(importe.amount, "USD");
  if (!tasa) return null;
  return convert(importe, tasa);
}

/** Lo que dice un turno (o su Z) para compararlo: ventas, anuladas, total y lo neto de cada medio en su moneda. */
export type TotalesDeTurno = Readonly<{
  cantidad: number;
  anuladas: number;
  total: Money;
  /** Por «medio|moneda»: lo neto (cobrado menos vuelto). */
  porMedio: ReadonlyMap<string, Money>;
}>;

/**
 * Lo que no cuadra entre lo que el informe calcula de un turno y lo que su Z dejó escrito, en palabras; vacío si
 * cuadra. Un medio que en uno es cero y en el otro no aparece, cuadra.
 */
export function cuadreConZ(calculado: TotalesDeTurno, z: TotalesDeTurno): string[] {
  const diferencias: string[] = [];
  if (calculado.cantidad !== z.cantidad) diferencias.push(`ventas: ${calculado.cantidad} y el Z dice ${z.cantidad}`);
  if (calculado.anuladas !== z.anuladas) diferencias.push(`anuladas: ${calculado.anuladas} y el Z dice ${z.anuladas}`);
  if (calculado.total.amount !== z.total.amount || calculado.total.currency !== z.total.currency) diferencias.push("el total de las ventas");
  const medios = new Set([...calculado.porMedio.keys(), ...z.porMedio.keys()]);
  for (const m of [...medios].sort()) {
    const a = calculado.porMedio.get(m)?.amount ?? 0n;
    const b = z.porMedio.get(m)?.amount ?? 0n;
    if (a !== b) diferencias.push(`lo neto de ${m.replace("|", " en ")}`);
  }
  return diferencias;
}

/** Los periodos que se eligen con un toque; el rango, a mano. La quincena (B3-17) es la del consumo del personal. */
export type PeriodoPredefinido = "HOY" | "AYER" | "SEMANA" | "MES" | "MES_ANTERIOR" | "QUINCENA" | "QUINCENA_ANTERIOR";

/** El día `dia` («2026-10-08») movido `n` días. */
function mover(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Los días de negocio de un periodo predefinido, contados desde `hoy` (el día del local, que pone quien llama). La
 * semana empieza el lunes; el mes, el día 1; la quincena, el 1 o el 16.
 */
export function periodoPredefinido(p: PeriodoPredefinido, hoy: string): Readonly<{ desde: string; hasta: string }> {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  switch (p) {
    case "HOY":
      return { desde: hoy, hasta: hoy };
    case "AYER":
      return { desde: mover(hoy, -1), hasta: mover(hoy, -1) };
    case "SEMANA": {
      const diaDeLaSemana = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
      return { desde: mover(hoy, -diaDeLaSemana), hasta: hoy };
    }
    case "MES":
      return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case "MES_ANTERIOR": {
      const primero = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
      return { desde: primero, hasta: mover(`${hoy.slice(0, 7)}-01`, -1) };
    }
    case "QUINCENA":
      return { desde: `${hoy.slice(0, 7)}-${Number(hoy.slice(8)) <= 15 ? "01" : "16"}`, hasta: hoy };
    case "QUINCENA_ANTERIOR": {
      // La primera del mes viene de la segunda del anterior (del 16 a su último día); la segunda, de la primera.
      if (Number(hoy.slice(8)) > 15) return { desde: `${hoy.slice(0, 7)}-01`, hasta: `${hoy.slice(0, 7)}-15` };
      const ultimo = mover(`${hoy.slice(0, 7)}-01`, -1);
      return { desde: `${ultimo.slice(0, 7)}-16`, hasta: ultimo };
    }
  }
}

/** Cuántos días tiene un periodo, contando los dos extremos. */
export function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
}
