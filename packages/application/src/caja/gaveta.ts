/**
 * La gaveta de un turno según su libro — F4-07, B3-5.
 *
 * Lo que debería haber en el cajón, por moneda: el fondo con que se abrió más lo que entró en efectivo
 * menos lo que salió (vueltos y devoluciones). Lo usan el arqueo y el corte (`cortes.ts`) y la
 * anulación, que no devuelve en efectivo lo que la gaveta no tiene (`cuentas.ts`).
 */
import type { MoneyDto } from "@l2/contracts";
import { ledgerMovements, movimientosDeEfectivo, openingMovements, tallyShift, type LedgerKind, type ShiftLedgerEntry, type TipoDeMovimiento } from "@l2/domain-cash";
import { add, money, zero, type CurrencyCode, type Money } from "@l2/domain-money";
import type { Transaccion } from "@l2/database";
import type { ConFondos } from "./turnos.ts";

const FUNCIONAL: CurrencyCode = "USD";
/** Las monedas que viven en la gaveta. */
export const GAVETA: readonly ("USD" | "VES")[] = ["USD", "VES"];
export const dinero = (m: Money): MoneyDto => ({ minor: String(m.amount), currency: m.currency });

/** El libro del turno como lo ve el dominio: cada asiento con su medio y si vive en la gaveta. */
export async function libroDelTurno(tx: Transaccion, shiftId: string) {
  const pagos = await tx.payment.findMany({ where: { shiftId }, orderBy: [{ recordedAt: "asc" }, { line: "asc" }] });
  const medios = await tx.paymentMethod.findMany({ select: { code: true, label: true, givesChange: true } });
  const medio = new Map(medios.map((m) => [m.code, m]));
  const entradas: ShiftLedgerEntry[] = pagos.map((p) => ({
    kind: p.kind as LedgerKind,
    methodCode: p.method,
    amount: money(p.amountMinor, p.currency as CurrencyCode),
    inDrawer: medio.get(p.method)?.givesChange ?? false,
  }));
  const igtf = pagos
    .filter((p) => p.kind === "COBRO" && (p.currency === "USD" || p.currency === "USDT"))
    .reduce<Money>((acc, p) => add(acc, money(p.igtfMinor, FUNCIONAL)), zero(FUNCIONAL));
  // Lo movido sin ser venta (B3-21): suma o resta en la gaveta; no es de ningún medio de pago.
  const movimientos = (await tx.cashMovement.findMany({ where: { shiftId }, select: { kind: true, currency: true, amountMinor: true } })).map((m) => ({
    tipo: m.kind as TipoDeMovimiento,
    monto: money(m.amountMinor, m.currency as CurrencyCode),
  }));
  return { entradas, medio, igtf, movimientos };
}

export type Libro = Awaited<ReturnType<typeof libroDelTurno>>;

/** Lo que debería haber en la gaveta, por moneda: el fondo más lo que entró menos lo que salió, con lo movido (B3-21). */
export function gavetaDe(t: ConFondos, libro: Libro) {
  const fondos = t.floats.map((f) => money(f.amountMinor, f.currency as CurrencyCode));
  // Las entradas y salidas son las del cobro (ventas, vueltos, devoluciones); lo movido va aparte, y el esperado lo cuenta.
  const drawer = tallyShift([...openingMovements(fondos), ...ledgerMovements(libro.entradas)]).drawer;
  const conMovido = tallyShift([...openingMovements(fondos), ...ledgerMovements(libro.entradas), ...movimientosDeEfectivo(libro.movimientos)]).drawer;
  return GAVETA.map((currency) => {
    const d = drawer.find((x) => x.currency === currency);
    const todo = conMovido.find((x) => x.currency === currency);
    const z = zero(currency);
    return {
      currency,
      fondo: dinero(d?.openingFloat ?? z),
      entradas: dinero(d?.cashIn ?? z),
      salidas: dinero(d?.cashOut ?? z),
      movido: dinero(money((todo?.expected.amount ?? 0n) - (d?.expected.amount ?? 0n), currency)),
      esperado: dinero(todo?.expected ?? z),
    };
  });
}

/** Lo que debería haber ahora en la gaveta de un turno, por moneda. */
export async function esperadoEnGaveta(tx: Transaccion, shiftId: string): Promise<Map<"USD" | "VES", Money>> {
  const t = await tx.cashShift.findUniqueOrThrow({ where: { id: shiftId }, include: { floats: true } });
  const gaveta = gavetaDe(t, await libroDelTurno(tx, shiftId));
  return new Map(gaveta.map((g) => [g.currency, money(BigInt(g.esperado.minor), g.currency)]));
}
