/**
 * La cuenta que cobra la caja — DEC-21, §9.10.9, B3-3.
 *
 * Tres clases de cuenta, y cada una dice de quién es: la de una **familia** (sus niños), la de una
 * **mesa** del salón y la de una venta de **mostrador** (ni niños ni mesa: consumo del catálogo).
 *
 * Aquí viven las reglas que comparten la pantalla y el servidor:
 *
 *  · qué se cobra ahora (`chargeableLines`, `documentLinesOf`) y cómo queda la cuenta al cobrar una
 *    parte o al anular el cobro (`markPartPaid`, `revertPaid`, `linesPaidBetween`);
 *  · **qué cambio acepta el servidor** de una pantalla (`accountChangeProblem`). La pantalla arma
 *    la cuenta nueva con sus transiciones; el servidor la compara con la que tiene y rechaza lo que
 *    solo él puede hacer. La regla que lo ordena: **una línea pagada no se toca, y marcar pagado
 *    es del cobro**, nunca de un «guardar»; regalar es de la cortesía (`courtesyProblem`,
 *    `withCourtesy`), con su autorización.
 *
 * Los tipos son estructurales: la forma del contrato (`FamilyAccountSchema`) encaja sin que el
 * dominio lo importe. Validarla contra el contrato es de quien llama.
 */
import { money, type CurrencyCode } from "@l2/domain-money";
import type { DocumentLine, TaxCode } from "@l2/domain-tax";

export type AccountKind = "FAMILIA" | "MESA" | "MOSTRADOR";
export type AccountStatus = "ABIERTA" | "POR_COBRAR" | "COBRADA" | "INCOBRABLE" | "SIN_CONSUMO";

export type AccountLineDoc = Readonly<{
  id: string;
  concept: string;
  kind: "PAQUETE" | "EXCEDENTE" | "RESTAURANTE";
  amount: Readonly<{ minor: string; currency: string }>;
  paid: boolean;
  sessionId?: string | undefined;
  movedTo?: string | undefined;
  cortesia?: unknown;
  productId?: string | undefined;
  taxCode?: TaxCode | undefined;
  /** El pedido que la trajo (B6-2), si es un plato: de ahí sale qué anular junto (F6-14). */
  orderId?: string | undefined;
  /** Anulada en producción (F6-14): no se borra, se queda con su importe y deja de cobrarse. */
  anulacion?: unknown;
}>;

export type AccountDoc = Readonly<{
  kind: AccountKind;
  status: AccountStatus;
  sessionIds: readonly string[];
  closedSessionIds: readonly string[];
  tableId?: string | undefined;
  split?: Readonly<{ parts: number; paid: number }> | undefined;
  lines: readonly AccountLineDoc[];
  /** El descuento que lleva (B3-6): lo pone y lo quita su mando, con su autorización; lo consume el cobro. */
  descuento?: unknown;
}>;

/* ─────────────────────────────────────────────────────────── qué se cobra */

/** Lo que se cobra ahora: ni lo pagado, ni lo movido, ni lo regalado, ni lo anulado. */
export function chargeableLines<L extends AccountLineDoc>(c: Readonly<{ lines: readonly L[] }>): L[] {
  return c.lines.filter((l) => !l.paid && !l.movedTo && !l.cortesia && !l.anulacion);
}

/**
 * Las líneas por cobrar en la forma del motor de impuestos. Cada una con el trato del IVA que copió
 * al venderse (B9-1); lo que no lo trae (el parque) paga el general.
 */
export function documentLinesOf(c: Readonly<{ lines: readonly AccountLineDoc[] }>): DocumentLine[] {
  return chargeableLines(c).map((l) => ({
    id: l.id,
    description: l.concept,
    unitPrice: money(BigInt(l.amount.minor), l.amount.currency as CurrencyCode),
    quantity: 1n,
    taxCode: l.taxCode ?? "GENERAL",
  }));
}

/** ¿Quedan niños dentro? Una cuenta de familia no se cierra mientras quede alguno. */
const todosFuera = (c: AccountDoc) => c.closedSessionIds.length === c.sessionIds.length;

/**
 * Se cobró todo lo pendiente: las líneas quedan pagadas. Si la familia ya se fue (o es una mesa o
 * el mostrador), la cuenta queda cobrada; si quedan niños dentro, vuelve a «abierta». El descuento,
 * si lo llevaba, se queda en la venta: lo que se deba después no lo arrastra (B3-6).
 */
export function markPaid<A extends AccountDoc>(c: A): A {
  const { descuento: _, ...sinDescuento } = c;
  return {
    ...(sinDescuento as A),
    lines: c.lines.map((l) => (l.paid || l.movedTo || l.cortesia ? l : { ...l, paid: true })),
    status: c.kind !== "FAMILIA" || todosFuera(c) ? "COBRADA" : "ABIERTA",
  };
}

/**
 * Se cobró una parte (F6-12). Mientras queden partes, la cuenta sigue en la cola; con la última se
 * marca pagada entera: las líneas se pagan una sola vez, aunque el dinero entrara en varios cobros.
 */
export function markPartPaid<A extends AccountDoc>(c: A): A {
  if (!c.split) return markPaid(c);
  const pagadas = c.split.paid + 1;
  if (pagadas >= c.split.parts) return markPaid({ ...c, split: { parts: c.split.parts, paid: c.split.parts } });
  return { ...c, split: { parts: c.split.parts, paid: pagadas }, status: "POR_COBRAR" };
}

/**
 * Se anuló un cobro (DEC-24): las líneas que pagó (`lineIds`) vuelven a estar pendientes y la cuenta
 * vuelve a la cola. Lo consumido se sigue debiendo; si no hay que cobrarlo es una cortesía, no una
 * anulación.
 *
 * Si el cobro era una **parte** de una cuenta dividida (`wasPart`), se resta esa parte y la división
 * sigue: las demás partes cobradas siguen cobradas. Si con ella se había completado la cuenta,
 * `lineIds` son las líneas que marcó pagadas la última parte, y vuelven a deberse.
 */
export function revertPaid<A extends AccountDoc>(c: A, lineIds: readonly string[], wasPart = false): A {
  const ids = new Set(lineIds);
  const lines = c.lines.map((l) => (ids.has(l.id) ? { ...l, paid: false } : l));
  if (wasPart && c.split) {
    return { ...c, lines, split: { parts: c.split.parts, paid: Math.max(0, c.split.paid - 1) }, status: "POR_COBRAR" };
  }
  return { ...c, lines, status: "POR_COBRAR" };
}

/**
 * Las líneas que un cambio marcó pagadas: las que en `before` no lo estaban y en `after` sí. De la
 * versión anterior a un cobro y la del cobro sale qué pagó ese cobro, sin guardarlo aparte.
 */
export function linesPaidBetween(before: Readonly<{ lines: readonly AccountLineDoc[] }> | null, after: Readonly<{ lines: readonly AccountLineDoc[] }>): string[] {
  const antes = new Map((before?.lines ?? []).map((l) => [l.id, l.paid]));
  return after.lines.filter((l) => l.paid && antes.get(l.id) !== true).map((l) => l.id);
}

/**
 * Una venta de mostrador que se vació antes de cobrarse: la caja la descarta. No se borra (regla 5:
 * sus versiones dicen qué se quitó y quién), pero no es una cuenta pendiente ni sale en la cola.
 */
export function isDiscardedDraft(c: Pick<AccountDoc, "kind" | "lines">): boolean {
  return c.kind === "MOSTRADOR" && c.lines.length === 0;
}

/* ───────────────────────────────────────── qué cambio acepta el servidor */

/** Lo que el catálogo dice de un producto en este instante (B9-1), o `null` si no se vende. */
export type ProductAtNow = Readonly<{ name: string; amountMinor: bigint; taxCode: TaxCode }>;

export type AccountChangeProblem =
  | "NUEVA_CON_PAGOS"
  | "TIPO_CAMBIADO"
  | "MESA_CAMBIADA"
  | "ESTANCIA_QUITADA"
  | "LINEA_QUITADA"
  | "LINEA_ALTERADA"
  | "PAGO_DESDE_LA_PANTALLA"
  | "MOVIDA_OTRA_VEZ"
  | "CORTESIA_DESDE_LA_PANTALLA"
  | "DIVISION_ALTERADA"
  | "MOSTRADOR_SIN_PRODUCTO"
  | "MESA_SIN_PRODUCTO"
  | "CUENTA_INCOBRABLE"
  | "CUENTA_SIN_CONSUMO"
  | "PRODUCTO_QUE_NO_SE_VENDE"
  | "PRECIO_DISTINTO"
  | "FAMILIA_DESDE_LA_PANTALLA"
  | "ESTANCIAS_DESDE_LA_PANTALLA"
  | "PARQUE_DESDE_LA_PANTALLA"
  | "DESCUENTO_DESDE_LA_PANTALLA"
  | "DIVISION_CON_DESCUENTO"
  | "ANULACION_DESDE_LA_PANTALLA";

export type AccountChange = Readonly<{ problem: AccountChangeProblem; lineId?: string }>;

/**
 * Una línea que la pantalla puede quitar: sin pagar y de mostrador (un producto del catálogo). Lo
 * consumido en el parque o servido en la mesa no se quita: se regala (cortesía) o se anula.
 */
const quitable = (l: AccountLineDoc, kind: AccountKind) => !l.paid && !l.movedTo && l.productId !== undefined && kind !== "MESA";

const mismoContenido = (a: AccountLineDoc, b: AccountLineDoc) =>
  a.concept === b.concept &&
  a.kind === b.kind &&
  a.amount.minor === b.amount.minor &&
  a.amount.currency === b.amount.currency &&
  a.sessionId === b.sessionId &&
  a.productId === b.productId &&
  a.taxCode === b.taxCode &&
  a.orderId === b.orderId;

/**
 * ¿Acepta el servidor que la cuenta pase de `before` (`null` si es nueva) a `after`? `productAt`
 * dice qué vende hoy el catálogo; toda línea nueva de un producto tiene que llevar su nombre, su
 * precio y su IVA de este instante (un precio viejo en una pantalla abierta no se cuela). `null` si
 * se acepta; si no, el primer problema, con la línea que lo causa.
 */
export function accountChangeProblem(
  before: AccountDoc | null,
  after: AccountDoc,
  productAt: (productId: string) => ProductAtNow | null,
): AccountChange | null {
  const previas = new Map((before?.lines ?? []).map((l) => [l.id, l]));

  // Marcar incobrable es de supervisión con su 🔐 (D-JOR), y una incobrable ya no se toca.
  if (after.status === "INCOBRABLE" || before?.status === "INCOBRABLE") return { problem: "CUENTA_INCOBRABLE" };
  // Cerrar sin consumo es el mando de liberar la mesa (B6-5, M-18), y una cuenta cerrada así ya no se toca.
  if (after.status === "SIN_CONSUMO" || before?.status === "SIN_CONSUMO") return { problem: "CUENTA_SIN_CONSUMO" };
  // El descuento es de su mando, con su autorización (B3-6): un «guardar» no lo pone ni lo quita.
  if (JSON.stringify(before?.descuento ?? null) !== JSON.stringify(after.descuento ?? null)) return { problem: "DESCUENTO_DESDE_LA_PANTALLA" };
  // El reparto en partes sale del total: con un descuento puesto, la cuenta no se divide.
  if (after.descuento !== undefined && after.split !== undefined) return { problem: "DIVISION_CON_DESCUENTO" };
  if (!before) {
    // La cuenta de una familia la abre la entrada del parque (B4-2), con sus estancias y el precio
    // del tarifario: una pantalla no la inventa.
    if (after.kind === "FAMILIA") return { problem: "FAMILIA_DESDE_LA_PANTALLA" };
    if (after.status === "COBRADA" || (after.split?.paid ?? 0) > 0) return { problem: "NUEVA_CON_PAGOS" };
  } else {
    if (after.kind !== before.kind) return { problem: "TIPO_CAMBIADO" };
    if (after.tableId !== before.tableId) return { problem: "MESA_CAMBIADA" };
    const sesiones = new Set(after.sessionIds);
    const cerradas = new Set(after.closedSessionIds);
    if (before.sessionIds.some((s) => !sesiones.has(s)) || before.closedSessionIds.some((s) => !cerradas.has(s))) {
      return { problem: "ESTANCIA_QUITADA" };
    }
    // Quién entra y quién sale de una familia lo dicen la entrada y la salida del parque (B4-2, B4-3);
    // a una mesa se le vinculan pulseras con su propio mando, que mueve el dinero a la vez (B6-3).
    if ((after.kind === "FAMILIA" || after.kind === "MESA") && (sesiones.size !== before.sessionIds.length || cerradas.size !== before.closedSessionIds.length)) {
      return { problem: "ESTANCIAS_DESDE_LA_PANTALLA" };
    }
    // Dividir o unir solo mientras no se cobró ninguna parte; las partes cobradas las cuenta el cobro.
    if ((after.split?.paid ?? 0) !== (before.split?.paid ?? 0)) return { problem: "DIVISION_ALTERADA" };
    if ((before.split?.paid ?? 0) > 0 && after.split?.parts !== before.split?.parts) return { problem: "DIVISION_ALTERADA" };
  }

  const ahora = new Set(after.lines.map((l) => l.id));
  for (const antes of previas.values()) {
    if (!ahora.has(antes.id) && !quitable(antes, after.kind)) return { problem: "LINEA_QUITADA", lineId: antes.id };
  }

  for (const l of after.lines) {
    const antes = previas.get(l.id);
    if (antes) {
      if (!mismoContenido(antes, l)) return { problem: "LINEA_ALTERADA", lineId: l.id };
      if (antes.paid !== l.paid) return { problem: "PAGO_DESDE_LA_PANTALLA", lineId: l.id };
      if (antes.movedTo !== undefined && l.movedTo !== antes.movedTo) return { problem: "MOVIDA_OTRA_VEZ", lineId: l.id };
      // Regalar es un mando propio, con su autorización (B3-4): un «guardar» no da ni quita cortesías.
      if (JSON.stringify(antes.cortesia ?? null) !== JSON.stringify(l.cortesia ?? null)) {
        return { problem: "CORTESIA_DESDE_LA_PANTALLA", lineId: l.id };
      }
      // Anular un pedido es otro mando propio, con su autorización (F6-14): tampoco lo da un «guardar».
      if (JSON.stringify(antes.anulacion ?? null) !== JSON.stringify(l.anulacion ?? null)) {
        return { problem: "ANULACION_DESDE_LA_PANTALLA", lineId: l.id };
      }
      if (antes.paid && l.movedTo !== antes.movedTo) return { problem: "MOVIDA_OTRA_VEZ", lineId: l.id };
      continue;
    }
    // Una línea nueva nace sin pagar, sin regalar y sin anular: eso lo marcan el cobro, la cortesía y la anulación.
    if (l.paid) return { problem: "PAGO_DESDE_LA_PANTALLA", lineId: l.id };
    if (l.cortesia !== undefined) return { problem: "CORTESIA_DESDE_LA_PANTALLA", lineId: l.id };
    if (l.anulacion !== undefined) return { problem: "ANULACION_DESDE_LA_PANTALLA", lineId: l.id };
    if (after.kind === "MOSTRADOR" && l.productId === undefined) return { problem: "MOSTRADOR_SIN_PRODUCTO", lineId: l.id };
    // Lo que se pide en la mesa sale de la carta, que es el catálogo (B6-1): su precio lo pone el
    // servidor, no la tablet. Lo del parque que llega a la mesa lo trae la vinculación (B6-3).
    if (after.kind === "MESA" && l.kind === "RESTAURANTE" && l.productId === undefined) return { problem: "MESA_SIN_PRODUCTO", lineId: l.id };
    // El paquete y el tiempo de más de una familia los pone el parque con su tarifario y su reloj.
    if ((after.kind === "FAMILIA" || after.kind === "MESA") && (l.kind === "PAQUETE" || l.kind === "EXCEDENTE")) return { problem: "PARQUE_DESDE_LA_PANTALLA", lineId: l.id };
    if (l.productId !== undefined) {
      const p = productAt(l.productId);
      if (!p) return { problem: "PRODUCTO_QUE_NO_SE_VENDE", lineId: l.id };
      if (
        l.amount.currency !== "USD" ||
        BigInt(l.amount.minor) !== p.amountMinor ||
        l.concept !== p.name ||
        (l.taxCode ?? "GENERAL") !== p.taxCode
      ) {
        return { problem: "PRECIO_DISTINTO", lineId: l.id };
      }
    }
  }
  return null;
}

/* ─────────────────────────────────────────── la salida del parque (B4-3) */

/** El tiempo de más de un niño que sale, como lo calculó el parque (en dólares, unidades menores). */
export type ExitOverdue = Readonly<{ sessionId: string; concept: string; amountMinor: bigint }>;

/**
 * La cuenta de la familia después de que salen `leaving` (DEC-21, F5-14). Cada excedente mayor que
 * cero entra como una línea pendiente (una por niño: la misma salida registrada dos veces no la
 * duplica). El estado sale del modo de pago:
 *
 *  · PREPAGO: si hay algo pendiente se cobra ya, aunque sus hermanos sigan dentro; si no, sigue
 *    abierta mientras quede alguien y queda cobrada cuando sale el último.
 *  · CUENTA_ABIERTA: se acumula mientras quede alguien dentro; con el último fuera pasa a la caja
 *    (o queda cobrada si no hay nada que cobrar).
 */
export function registerExit<A extends AccountDoc & { mode: "PREPAGO" | "CUENTA_ABIERTA" }>(
  c: A,
  leaving: readonly string[],
  overdue: readonly ExitOverdue[],
): A {
  const cerradas = [...new Set([...c.closedSessionIds, ...leaving])];
  const previas = new Set(c.lines.map((l) => l.id));
  const nuevas = overdue
    .filter((e) => e.amountMinor > 0n && !previas.has(`exc-${e.sessionId}`))
    .map((e) => ({
      id: `exc-${e.sessionId}`,
      concept: e.concept.slice(0, 80),
      kind: "EXCEDENTE" as const,
      amount: { minor: String(e.amountMinor), currency: "USD" },
      paid: false,
      sessionId: e.sessionId,
    }));
  const lines = [...c.lines, ...nuevas];
  const todos = cerradas.length === c.sessionIds.length;
  const hayPendiente = chargeableLines({ lines }).length > 0;
  const status: AccountStatus =
    c.mode === "PREPAGO"
      ? hayPendiente ? "POR_COBRAR" : todos ? "COBRADA" : "ABIERTA"
      : todos ? (hayPendiente ? "POR_COBRAR" : "COBRADA") : "ABIERTA";
  return { ...c, closedSessionIds: cerradas, lines, status };
}

/**
 * La cuenta después de una recarga de tiempo (F5-11): una línea más de paquete, sin pagar. En prepago
 * se cobra ya (vuelve a la cola); en cuenta abierta se acumula como lo demás.
 */
export function registerRecharge<A extends AccountDoc & { mode: "PREPAGO" | "CUENTA_ABIERTA" }>(
  c: A,
  line: Readonly<{ id: string; concept: string; sessionId: string; amountMinor: bigint }>,
): A {
  if (c.lines.some((l) => l.id === line.id)) return c;
  const nueva = {
    id: line.id,
    concept: line.concept.slice(0, 80),
    kind: "PAQUETE" as const,
    amount: { minor: String(line.amountMinor), currency: "USD" },
    paid: false,
    sessionId: line.sessionId,
  };
  const status: AccountStatus = c.mode === "PREPAGO" || c.status === "POR_COBRAR" ? "POR_COBRAR" : "ABIERTA";
  return { ...c, lines: [...c.lines, nueva], status };
}

/* ──────────────────────────────────── vincular pulseras a una mesa (F6-05) */

/**
 * Mueve a la cuenta de la mesa (`targetAccountId`) lo que todavía se debe del parque de estas
 * estancias en la cuenta de su familia (F6-05, F5-14): el paquete y el excedente pendientes. La
 * línea de la familia no se borra (regla 5): se marca `movedTo` y deja de contar como pendiente
 * ahí; nace su igual en la mesa, con un id propio y sin pagar, para que la familia la pague una
 * sola vez. Lo regalado no se mueve: no se debe, y su cortesía se queda donde se dio.
 */
export function moveSessionLines<A extends AccountDoc>(
  familia: A,
  sessionIds: readonly string[],
  targetAccountId: string,
  idDeLaNueva: (l: AccountLineDoc) => string,
): Readonly<{ familia: A; lineasNuevas: AccountLineDoc[] }> {
  const ids = new Set(sessionIds);
  const lineasNuevas: AccountLineDoc[] = [];
  const lines = familia.lines.map((l) => {
    if (l.paid || l.movedTo || l.cortesia || !l.sessionId || !ids.has(l.sessionId)) return l;
    lineasNuevas.push({ ...l, id: idDeLaNueva(l) });
    return { ...l, movedTo: targetAccountId };
  });
  // Si lo que la ponía en la cola se acaba de mover, la cuenta sale de la cola: a abierta mientras
  // queden niños dentro, o a cobrada si la familia entera ya se fue (como al salir, `registerExit`).
  const status: AccountStatus =
    familia.status === "POR_COBRAR" && chargeableLines({ lines }).length === 0
      ? familia.closedSessionIds.length === familia.sessionIds.length
        ? "COBRADA"
        : "ABIERTA"
      : familia.status;
  return { familia: { ...familia, lines, status }, lineasNuevas };
}

/* ────────────────────────────────────────────── la cortesía (F6-14, B3-4) */

export type CourtesyProblem = "LINEA_DESCONOCIDA" | "LINEA_PAGADA" | "LINEA_MOVIDA" | "YA_REGALADA" | "NO_REGALADA";

/**
 * ¿Se puede regalar (o dejar de regalar, con `quitar`) esta línea? Solo lo que se debe todavía: una
 * línea pagada se corrige anulando el cobro, y una movida a otra cuenta se regala allí.
 */
export function courtesyProblem(c: Pick<AccountDoc, "lines">, lineId: string, quitar: boolean): CourtesyProblem | null {
  const l = c.lines.find((x) => x.id === lineId);
  if (!l) return "LINEA_DESCONOCIDA";
  if (l.paid) return "LINEA_PAGADA";
  if (l.movedTo) return "LINEA_MOVIDA";
  if (!quitar && l.cortesia) return "YA_REGALADA";
  if (quitar && !l.cortesia) return "NO_REGALADA";
  return null;
}

/**
 * La cuenta con esa línea regalada (`cortesia`) o cobrable otra vez (`null`). Lo regalado se queda
 * con su importe (F6-14): deja de sumar, pero se sabe cuánto se dio. El estado no cambia: una cuenta
 * en la cola sigue en ella, aunque ya no se deba nada, para cerrarla en la caja.
 */
export function withCourtesy<A extends AccountDoc>(c: A, lineId: string, cortesia: unknown | null): A {
  return {
    ...c,
    lines: c.lines.map((l) => {
      if (l.id !== lineId) return l;
      if (cortesia !== null) return { ...l, cortesia };
      const { cortesia: _, ...sin } = l;
      return sin;
    }),
  };
}

/* ──────────────────────────────────────── anular un pedido (F6-14, B6-3) */

export type AnulacionProblem = "LINEA_DESCONOCIDA" | "LINEA_PAGADA" | "LINEA_MOVIDA" | "YA_ANULADA" | "YA_REGALADA" | "NO_ES_PEDIDO" | "PEDIDOS_DISTINTOS";

/**
 * ¿Se puede anular este plato pedido? Solo un plato de la mesa (`RESTAURANTE`), que todavía se deba:
 * una línea pagada se corrige anulando el cobro, y una movida o regalada se corrige donde está. A
 * diferencia de la cortesía, anular no tiene vuelta (si se hizo sin querer, se vuelve a pedir).
 */
export function anulacionProblem(c: Pick<AccountDoc, "lines">, lineId: string): AnulacionProblem | null {
  const l = c.lines.find((x) => x.id === lineId);
  if (!l) return "LINEA_DESCONOCIDA";
  if (l.kind !== "RESTAURANTE") return "NO_ES_PEDIDO";
  if (l.paid) return "LINEA_PAGADA";
  if (l.movedTo) return "LINEA_MOVIDA";
  if (l.cortesia) return "YA_REGALADA";
  if (l.anulacion) return "YA_ANULADA";
  return null;
}

/**
 * ¿Se pueden anular estos platos de una vez (B6-6)? Cada uno como `anulacionProblem`, y todos del mismo
 * pedido: una anulación saca un papel «ANULAR» que nombra una comanda. El primer problema, con su línea.
 */
export function anulacionesProblem(c: Pick<AccountDoc, "lines">, lineIds: readonly string[]): Readonly<{ problem: AnulacionProblem; lineId: string }> | null {
  for (const id of lineIds) {
    const problem = anulacionProblem(c, id);
    if (problem) return { problem, lineId: id };
  }
  const pedidos = new Set(lineIds.map((id) => c.lines.find((l) => l.id === id)?.orderId));
  if (pedidos.size > 1 || pedidos.has(undefined)) return { problem: "PEDIDOS_DISTINTOS", lineId: lineIds[0]! };
  return null;
}

/**
 * La cuenta con ese plato anulado. Se queda con su importe (igual que la cortesía, F6-14): deja de
 * sumar al total a cobrar y entra en las excepciones del turno, pero el negocio ve qué se anuló.
 */
export function withAnulacion<A extends AccountDoc>(c: A, lineId: string, anulacion: unknown): A {
  return { ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, anulacion } : l)) };
}

/* ─────────────────────────────────────── la mesa sin consumo (B6-5) */

/** Por qué una mesa no se libera sin pasar por la caja. */
export type SinConsumoProblem = "NO_ES_MESA" | "NO_ABIERTA" | "QUEDA_POR_COBRAR";

/**
 * ¿Se puede cerrar esta cuenta sin cobrar (B6-5, M-18)? Solo una de mesa, abierta o en la cola de la
 * caja, a la que no le queda nada que cobrar: no pidieron, o todo se anuló, se regaló o se movió.
 */
export function sinConsumoProblem(c: Pick<AccountDoc, "kind" | "status" | "lines">): SinConsumoProblem | null {
  if (c.kind !== "MESA") return "NO_ES_MESA";
  if (c.status !== "ABIERTA" && c.status !== "POR_COBRAR") return "NO_ABIERTA";
  if (chargeableLines(c).length > 0) return "QUEDA_POR_COBRAR";
  return null;
}

/**
 * La cuenta de la mesa cerrada sin cobrar. Si algo se cobró antes (una parte), queda cobrada; si no,
 * «sin consumo». Ninguna de las dos es incobrable: no se debía nada. Las líneas se quedan como están.
 */
export function closeWithoutConsumption<A extends AccountDoc>(c: A): A {
  return { ...c, status: c.lines.some((l) => l.paid) ? "COBRADA" : "SIN_CONSUMO" };
}

/* ─────────────────────────────────────── el cierre de la jornada (B3-5) */

/**
 * ¿Impide cerrar la jornada? Una cuenta que se debe todavía, o que sigue abierta (JORNADA §5, C2): la
 * jornada no se cierra con pendientes. Una venta de mostrador vaciada no cuenta, ni lo cobrado, ni
 * lo que supervisión marcó incobrable.
 */
export function isPendingAtClose(c: Pick<AccountDoc, "kind" | "lines" | "status">): boolean {
  return (c.status === "ABIERTA" || c.status === "POR_COBRAR") && !isDiscardedDraft(c);
}

/**
 * Una cuenta que no se va a cobrar (D-JOR): la familia se fue sin pagar o no puede pagar. Se marca
 * incobrable con motivo y la autorización de supervisión; lo que se debía sigue en sus líneas (nada
 * se borra) y sale en las excepciones del día.
 */
export function markUncollectible<A extends AccountDoc>(c: A): A {
  return { ...c, status: "INCOBRABLE" };
}

/** Por qué una cuenta no se puede dar por incobrable. */
export type UncollectibleProblem = "NO_PENDIENTE" | "NINOS_EN_SALA";

/**
 * ¿Se puede dar por incobrable? Solo lo que impide cerrar, y una familia con niños dentro todavía no:
 * primero se registra su salida (que liquida el tiempo de más), y después se decide si se cobra.
 */
export function uncollectibleProblem(c: Pick<AccountDoc, "kind" | "lines" | "status" | "sessionIds" | "closedSessionIds">): UncollectibleProblem | null {
  if (!isPendingAtClose(c)) return "NO_PENDIENTE";
  if (c.kind === "FAMILIA" && c.closedSessionIds.length < c.sessionIds.length) return "NINOS_EN_SALA";
  return null;
}
