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
import { add, toMajor, zero, type Money } from "@l2/domain-money";
import { computeOverdueBreakdown, computeSessionView } from "@l2/domain-park";
import { toEpochMs, toMoney, toParkPolicy, toParkSession } from "./mappers.ts";

function toMoneyDto(m: Money) {
  return { minor: m.amount.toString(), currency: m.currency };
}

/**
 * Liquidación de las estancias indicadas, en el instante del servidor.
 *
 * Cuando exista el backend, este cálculo lo hará el servidor con **este mismo
 * código de dominio**, y esta función se sustituye por la llamada. La forma
 * del resultado ya es la definitiva (§11.4).
 */
export function buildCheckoutPreview(
  snapshot: MonitorSnapshotDto,
  sessionIds: readonly string[],
): CheckoutPreviewDto {
  const now = toEpochMs(snapshot.serverNow);
  const policy = toParkPolicy(snapshot.policy);
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
      const view = computeSessionView(session, policy, now);
      const desglose = computeOverdueBreakdown(view, policy);
      const packagePrice = toMoney(dto.packagePrice);

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
        overdue: toMoneyDto(desglose.charge),
        total: toMoneyDto(add(packagePrice, desglose.charge)),
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
