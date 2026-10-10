/**
 * Construcción de la liquidación — F5-14.
 *
 * Nivel 3 (§9.4): traduce una estancia del contrato a la línea de liquidación
 * que la pantalla de salida muestra. **Todo el cálculo viene del dominio**
 * (`liquidarEstancia`, B4-17: la misma función con que liquida el servidor);
 * aquí solo se formatea y se ensambla.
 */
import {
  CheckoutPreviewSchema,
  TIEMPO_ABIERTO_ID,
  type CheckoutPreviewDto,
  type MonitorSnapshotDto,
  type SettlementLineDto,
} from "@l2/contracts";
import { add, money, toMajor, zero, type Money } from "@l2/domain-money";
import { fixed, liquidarEstancia, openEnded, type PaqueteDeUso } from "@l2/domain-park";
import { toEpochMs, toMoney, toParkSession, toParkTerms } from "./mappers.ts";

function toMoneyDto(m: Money) {
  return { minor: m.amount.toString(), currency: m.currency };
}

/** La tarifa con que entró una estancia (B4-2): los paquetes de esa versión del tarifario. */
export function tarifaDeEstancia(dto: MonitorSnapshotDto["sessions"][number]): PaqueteDeUso[] {
  return dto.porUso.map((p) => ({
    name: p.name,
    duration: p.duration.kind === "fixed" ? fixed(p.duration.minutes) : openEnded,
    price: money(BigInt(p.price.minor), "USD"),
  }));
}

/** Lo contratado de una estancia: el paquete y lo que subió (F5-11, B4-17). */
export function contratadoDeEstancia(dto: MonitorSnapshotDto["sessions"][number]): Money {
  return dto.recargas.reduce((acc, r) => add(acc, toMoney(r.price)), toMoney(dto.packagePrice));
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
      const tiempoAbierto = dto.packageId === TIEMPO_ABIERTO_ID;
      // Las condiciones y la tarifa con que entró (B4-2): las mismas con que liquida el servidor.
      const l = liquidarEstancia(
        {
          session: toParkSession(dto),
          policy: toParkTerms(dto.terms),
          tarifa: tarifaDeEstancia(dto),
          contratado: contratadoDeEstancia(dto),
          cuentaAbierta: cuentaAbierta(dto.accountId),
          tiempoAbierto,
        },
        now,
      );
      return {
        sessionId: dto.id,
        wristbandCode: dto.wristbandCode,
        kid: dto.kid,
        startedAt: dto.startedAt,
        endedAt,
        consumedMinutes: l.consumedMinutes,
        billableOverdueMinutes: l.billableOverdueMinutes,
        penaltyBlocks: l.penaltyBlocks,
        blockMinutes: l.blockMinutes,
        tiempoAbierto,
        packagePrice: toMoneyDto(l.contratado),
        porUso: l.porUso ? { paquete: l.porUso.paquetes.join(" + "), precio: toMoneyDto(l.porUso.precio) } : null,
        overdue: toMoneyDto(l.overdue),
        total: toMoneyDto(l.total),
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
