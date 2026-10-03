/**
 * Construcción de la liquidación — F5-14.
 *
 * Nivel 3 (§9.4): traduce una estancia del contrato a la línea de liquidación
 * que la pantalla de salida muestra. **Todo el cálculo viene del dominio**;
 * aquí solo se formatea y se ensambla.
 */
import {
  CheckoutPreviewSchema,
  type CheckoutPreviewDto,
  type MonitorSnapshotDto,
  type SettlementLineDto,
} from "@l2/contracts";
import { add, money, toMajor, zero, type Money } from "@l2/domain-money";
import { computeOverdueBreakdown, computeSessionView, fixed, openEnded, paquetePorUso } from "@l2/domain-park";
import { toEpochMs, toMoney, toParkSession, toParkTerms } from "./mappers.ts";

function toMoneyDto(m: Money) {
  return { minor: m.amount.toString(), currency: m.currency };
}

/**
 * Liquidación de las estancias indicadas, en el instante del servidor.
 *
 * Es un ANTICIPO para quien atiende: el servidor liquida con este mismo dominio y
 * su propio reloj al confirmar (B4-3), y lo que cobra es lo suyo.
 */
export function buildCheckoutPreview(
  snapshot: MonitorSnapshotDto,
  sessionIds: readonly string[],
  /** ¿Paga al salir (cuenta abierta)? Entonces, si sale antes de tiempo, se cobra por uso (B4-6). */
  cuentaAbierta: (accountId: string) => boolean = () => false,
): CheckoutPreviewDto {
  const now = toEpochMs(snapshot.serverNow);
  const endedAt = snapshot.serverNow;

  // Se respeta el ORDEN DE ESCANEO, no el del snapshot: el operador acaba de
  // pasar esas pulseras y espera verlas en ese orden. Recolocarlas por un
  // criterio interno obliga a releer la lista para comprobar que están todas.
  const porId = new Map(snapshot.sessions.map((s) => [s.id, s]));

  const lines: SettlementLineDto[] = sessionIds
    .map((id) => porId.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((dto) => {
      const session = toParkSession(dto);
      // Las condiciones con que entró (B4-2): las mismas con que liquida el servidor.
      const terms = toParkTerms(dto.terms);
      const view = computeSessionView(session, terms, now);
      const desglose = computeOverdueBreakdown(view, terms);
      // Lo contratado: el paquete y sus recargas (F5-11), como lo liquida el servidor.
      const packagePrice = dto.recargas.reduce((acc, r) => add(acc, toMoney(r.price)), toMoney(dto.packagePrice));
      // Salió antes de tiempo en cuenta abierta (B4-6): el paquete más barato que cubre lo que estuvo.
      const porUso =
        desglose.charge.amount === 0n && cuentaAbierta(dto.accountId)
          ? paquetePorUso(
              dto.porUso.map((p) => ({
                name: p.name,
                duration: p.duration.kind === "fixed" ? fixed(p.duration.minutes) : openEnded,
                price: money(BigInt(p.price.minor), "USD"),
              })),
              view.elapsedMs,
              terms.graceMinutes,
              packagePrice,
            )
          : null;
      const paquete = porUso ? porUso.price : packagePrice;

      return {
        sessionId: dto.id,
        wristbandCode: dto.wristbandCode,
        kid: dto.kid,
        startedAt: dto.startedAt,
        endedAt,
        // Se redondea hacia arriba igual que el cobro: mostrar «59 min»
        // cuando se cobró una hora sería explicar mal el recibo.
        consumedMinutes: Math.ceil(view.elapsedMs / 60_000),
        billableOverdueMinutes: desglose.billableMinutes,
        penaltyBlocks: desglose.blocks,
        packagePrice: toMoneyDto(packagePrice),
        porUso: porUso ? { paquete: porUso.name, precio: toMoneyDto(porUso.price) } : null,
        overdue: toMoneyDto(desglose.charge),
        total: toMoneyDto(add(paquete, desglose.charge)),
      };
    });

  const total = lines.reduce<Money>(
    (acc, l) => add(acc, toMoney(l.total)),
    zero("USD"),
  );

  // Se valida contra el contrato igual que los datos de ejemplo: si el ensamblado
  // produce algo que el servidor no podría devolver, revienta aquí.
  return CheckoutPreviewSchema.parse({
    serverNow: snapshot.serverNow,
    lines,
    total: toMoneyDto(total),
  });
}

/** Formatea un `MoneyDto` para mostrarlo, sin pasar por `number`. */
export function moneyDtoToMajor(dto: { minor: string; currency: string }): string {
  return toMajor(toMoney(dto as { minor: string; currency: "USD" | "VES" | "USDT" }));
}
