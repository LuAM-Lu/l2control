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
  type AccountLineDto,
  type FamilyAccountDto,
  type MoneyDto,
  type PaymentMode,
} from "@l2/contracts";
import { sum, type Money } from "@l2/domain-money";
import type { DocumentLine } from "@l2/domain-tax";
import { toMoney } from "../park/mappers.ts";

/** Lo que falta por cobrar de una cuenta. Lo movido a otra cuenta ya no cuenta aquí. */
export function pendiente(c: FamilyAccountDto): Money {
  return sum(
    c.lines.filter((l) => !l.paid && !l.movedTo).map((l) => toMoney(l.amount)),
    "USD",
  );
}

/** Una cuenta abierta en el salón: se cobra cuando la mesa pide la cuenta (F6-05). */
export function esDeMesa(c: FamilyAccountDto): boolean {
  return c.tableId !== undefined;
}

/**
 * Una línea añadida en el mostrador (snack, bebida, golosina) que todavía no
 * se cobró. Es la única que la caja puede cambiar de cantidad o quitar.
 * Lo consumido —el paquete, el tiempo de más y, cuando exista, el plato que la
 * cocina ya sirvió— no se toca desde aquí: corregirlo es una cortesía o una
 * anulación, con motivo y autorización (F6-14).
 */
export function esLineaDeMostrador(l: FamilyAccountDto["lines"][number]): boolean {
  return l.kind === "RESTAURANTE" && l.id.includes("-snk-") && !l.paid;
}

/** «#1042»: como se dice y se busca un número de orden. */
export function numeroDeOrden(c: FamilyAccountDto): string {
  return c.orderNumber ? `#${String(c.orderNumber).padStart(4, "0")}` : "Sin número";
}

/** Venta de mostrador: una cuenta sin familia, abierta en la caja. */
export function esVentaDirecta(c: FamilyAccountDto): boolean {
  return c.id.startsWith("c-dir-");
}

/**
 * Una venta directa que no se cobró es un borrador: si se vacía, se descarta
 * entera. Una cuenta de familia, nunca (regla 5): tiene estancias detrás.
 */
export function puedeDescartarse(c: FamilyAccountDto): boolean {
  return esVentaDirecta(c) && c.lines.every((l) => !l.paid);
}

/** Las líneas pendientes, en la forma que cobra la caja. */
export function lineasParaCobrar(c: FamilyAccountDto): DocumentLine[] {
  return c.lines
    .filter((l) => !l.paid && !l.movedTo)
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
 * Se anuló el cobro que pagó estas líneas (DEC-24): vuelven a estar pendientes
 * y la cuenta vuelve a la cola de la caja. No se borra nada: lo consumido se
 * sigue debiendo, y si no hay que cobrarlo es una cortesía con motivo (F6-14),
 * no una anulación.
 */
export function revertirCobro(c: FamilyAccountDto, lineIds: readonly string[]): FamilyAccountDto {
  const ids = new Set(lineIds);
  return FamilyAccountSchema.parse({
    ...c,
    lines: c.lines.map((l) => (ids.has(l.id) ? { ...l, paid: false } : l)),
    status: "POR_COBRAR",
  });
}

/* ═════════════════════════════════ dividir la cuenta — F6-12 ══ */

/** Divide la cuenta en partes iguales. Vuelve a empezar si ya estaba dividida y nadie pagó. */
export function dividirEn(c: FamilyAccountDto, partes: number): FamilyAccountDto {
  return FamilyAccountSchema.parse({ ...c, split: { parts: partes, paid: c.split?.paid ?? 0 } });
}

/** Deja de dividir: vuelve a cobrarse de una vez. Solo si no se cobró ninguna parte. */
export function unirCuenta(c: FamilyAccountDto): FamilyAccountDto {
  if (c.split && c.split.paid > 0) return c;
  const { split: _, ...sinDividir } = c;
  return FamilyAccountSchema.parse(sinDividir);
}

/**
 * Se cobró una parte.
 *
 * Mientras queden partes, la cuenta sigue en la cola con lo que falta. Con la
 * última se marca cobrada entera: las líneas se pagan una sola vez, aunque el
 * dinero haya entrado en varios cobros.
 */
export function marcarParteCobrada(c: FamilyAccountDto): FamilyAccountDto {
  const partes = c.split?.parts ?? 1;
  const pagadas = (c.split?.paid ?? 0) + 1;
  if (pagadas >= partes) return marcarCobrada(FamilyAccountSchema.parse({ ...c, split: { parts: partes, paid: partes } }));
  return FamilyAccountSchema.parse({ ...c, split: { parts: partes, paid: pagadas }, status: "POR_COBRAR" });
}

/** Cuántas partes faltan por cobrar. 1 si la cuenta no está dividida. */
export function partesQueFaltan(c: FamilyAccountDto): number {
  return c.split ? c.split.parts - c.split.paid : 1;
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

/* ══════════════════════════════ la cuenta de la mesa — F6-05, D2, D3 ══ */

/** Abre la cuenta de una mesa. Nace vacía y se llena con cada pedido. */
export function abrirCuentaDeMesa({
  tableId,
  tableLabel,
  abiertaEn,
  ahora,
}: {
  tableId: string;
  tableLabel: string;
  /** Cuándo se abrió la mesa: separa esta familia de la anterior en la misma mesa. */
  abiertaEn: string;
  ahora: string;
}): FamilyAccountDto {
  return FamilyAccountSchema.parse({
    id: `c-mesa-${tableId}-${Date.parse(abiertaEn)}`,
    family: `Mesa ${tableLabel}`,
    mode: "CUENTA_ABIERTA",
    status: "ABIERTA",
    openedAt: ahora,
    sessionIds: [],
    closedSessionIds: [],
    tableId,
    tableLabel,
    lines: [],
  });
}

/** Añade a la cuenta de la mesa lo que se acaba de enviar a cocina. */
export function anadirPedido(
  c: FamilyAccountDto,
  orderId: string,
  platos: readonly { concepto: string; cantidad: number; precio: MoneyDto }[],
): FamilyAccountDto {
  const lineas: AccountLineDto[] = platos.flatMap((p) =>
    // Una línea por unidad: así se puede cobrar o cortesía una sola, y la caja
    // ya sabe agrupar las iguales en una fila con su cantidad.
    Array.from({ length: p.cantidad }, (_, i) => ({
      id: `${c.id}-${orderId}-${i}-${p.concepto}`.slice(0, 64),
      concept: p.concepto.slice(0, 80),
      kind: "RESTAURANTE" as const,
      amount: p.precio,
      paid: false,
    })),
  );
  return FamilyAccountSchema.parse({ ...c, lines: [...c.lines, ...lineas] });
}

/**
 * Vincular niños a una mesa mueve lo suyo del parque a la cuenta de la mesa — D2.
 *
 * Así la familia paga UNA vez. Nada se borra (regla 5): la línea se queda en la
 * cuenta de la familia diciendo adónde fue, y deja de contar como pendiente.
 * Devuelve las dos cuentas ya validadas, o `null` si no había nada que mover.
 */
export function moverParqueALaMesa(
  familia: FamilyAccountDto,
  mesa: FamilyAccountDto,
  sessionIds: readonly string[],
): { familia: FamilyAccountDto; mesa: FamilyAccountDto } | null {
  const ids = new Set(sessionIds);
  const mueven = familia.lines.filter((l) => !l.paid && !l.movedTo && l.sessionId && ids.has(l.sessionId));
  if (mueven.length === 0) return null;

  const enLaMesa = mueven.map((l) => ({ ...l, id: `${mesa.id}-${l.id}`.slice(0, 64) }));
  return {
    familia: FamilyAccountSchema.parse({
      ...familia,
      lines: familia.lines.map((l) => (mueven.includes(l) ? { ...l, movedTo: mesa.id } : l)),
      // Si ya no le queda nada propio, deja de estar en la cola de la caja.
      status: familia.lines.some((l) => !l.paid && !mueven.includes(l)) ? familia.status : "ABIERTA",
    }),
    mesa: FamilyAccountSchema.parse({
      ...mesa,
      sessionIds: [...new Set([...mesa.sessionIds, ...sessionIds])],
      lines: [...mesa.lines, ...enLaMesa],
    }),
  };
}

/** La mesa pidió la cuenta: pasa a la cola de la caja si hay algo que cobrar. */
export function pasarACaja(c: FamilyAccountDto): FamilyAccountDto {
  const hayPendiente = c.lines.some((l) => !l.paid && !l.movedTo);
  return FamilyAccountSchema.parse({ ...c, status: hayPendiente ? "POR_COBRAR" : c.status });
}
