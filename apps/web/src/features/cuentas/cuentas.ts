/**
 * Reglas de la cuenta de la familia — DEC-21, §9.10.9.
 *
 * Tres transiciones y nada más: abrir en la entrada, registrar una salida y
 * marcar como cobrada. Cada una devuelve la cuenta ya validada contra el
 * contrato: si una transición produjera una cuenta imposible —cobrada con
 * algo pendiente, por cobrar sin nada que cobrar—, revienta aquí y no en la
 * caja delante del cliente.
 *
 * Son funciones puras sobre datos del contrato. Cuando exista el backend, el
 * servidor aplicará estas mismas reglas y la pantalla recibirá el resultado;
 * la forma ya es la definitiva (§11.4).
 */
import {
  FamilyAccountSchema,
  type FamilyAccountDto,
  type MoneyDto,
  type PaymentMode,
} from "@l2/contracts";
import { sum, type Money } from "@l2/domain-money";
import type { DocumentLine } from "@l2/domain-tax";
import { toMoney } from "../park/mappers.ts";

/** Lo que falta por cobrar de una cuenta. */
export function pendiente(c: FamilyAccountDto): Money {
  return sum(
    c.lines.filter((l) => !l.paid).map((l) => toMoney(l.amount)),
    "USD",
  );
}

/** Las líneas pendientes, en la forma que cobra la caja. */
export function lineasParaCobrar(c: FamilyAccountDto): DocumentLine[] {
  return c.lines
    .filter((l) => !l.paid)
    .map((l) => ({
      id: l.id,
      description: l.concept,
      unitPrice: toMoney(l.amount),
      quantity: 1n,
      // TODO(F3-06): el tipo de IVA saldrá del catálogo de cada concepto.
      taxCode: "GENERAL" as const,
    }));
}

/**
 * La entrada abre la cuenta.
 *
 * En PREPAGO nace «por cobrar»: el paquete se paga ya. En CUENTA_ABIERTA
 * nace «abierta»: se acumula y se paga al salir.
 */
export function abrirCuenta({
  familia,
  modo,
  ahora,
  ninos,
}: {
  familia: string;
  modo: PaymentMode;
  ahora: string;
  ninos: readonly { sessionId: string; concepto: string; precio: MoneyDto }[];
}): FamilyAccountDto {
  const id = `c-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  return FamilyAccountSchema.parse({
    id,
    family: familia,
    mode: modo,
    status: modo === "PREPAGO" ? "POR_COBRAR" : "ABIERTA",
    openedAt: ahora,
    sessionIds: ninos.map((n) => n.sessionId),
    closedSessionIds: [],
    lines: ninos.map((n) => ({
      id: `${id}-${n.sessionId}`,
      concept: n.concepto.slice(0, 80),
      kind: "PAQUETE",
      amount: n.precio,
      paid: false,
      sessionId: n.sessionId,
    })),
  });
}

/**
 * Registra que unos niños de la cuenta se van.
 *
 * El excedente de cada uno entra como línea pendiente. Y el estado sale del
 * modo de pago:
 *
 *  · PREPAGO — si alguien se pasó, su excedente se cobra YA, aunque sus
 *    hermanos sigan dentro. Si no hay nada pendiente, la salida no cobra.
 *  · CUENTA_ABIERTA — se sigue acumulando mientras quede alguien dentro; la
 *    cuenta entera pasa a caja cuando sale el último.
 */
export function registrarSalida(
  c: FamilyAccountDto,
  salen: readonly string[],
  excedentes: readonly { sessionId: string; concept: string; amount: MoneyDto }[],
): FamilyAccountDto {
  const cerradas = [...new Set([...c.closedSessionIds, ...salen])];
  const lines = [
    ...c.lines,
    ...excedentes
      .filter((e) => BigInt(e.amount.minor) > 0n)
      .map((e) => ({
        id: `${c.id}-exc-${e.sessionId}`.slice(0, 64),
        concept: e.concept.slice(0, 80),
        kind: "EXCEDENTE" as const,
        amount: e.amount,
        paid: false,
        sessionId: e.sessionId,
      })),
  ];
  const todosFuera = cerradas.length === c.sessionIds.length;
  const hayPendiente = lines.some((l) => !l.paid);

  const status =
    c.mode === "PREPAGO"
      ? hayPendiente
        ? "POR_COBRAR"
        : todosFuera
          ? "COBRADA"
          : "ABIERTA"
      : todosFuera
        ? hayPendiente
          ? "POR_COBRAR"
          : "COBRADA"
        : "ABIERTA";

  return FamilyAccountSchema.parse({ ...c, closedSessionIds: cerradas, lines, status });
}

/**
 * La caja cobró todo lo pendiente.
 *
 * Si la familia ya se fue, la cuenta queda cobrada. Si quedan niños dentro
 * —un prepago que pagó el excedente de uno—, vuelve a «abierta».
 */
export function marcarCobrada(c: FamilyAccountDto): FamilyAccountDto {
  const fuera = c.closedSessionIds.length === c.sessionIds.length;
  return FamilyAccountSchema.parse({
    ...c,
    lines: c.lines.map((l) => ({ ...l, paid: true })),
    status: fuera ? "COBRADA" : "ABIERTA",
  });
}
