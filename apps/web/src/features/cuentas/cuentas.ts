/**
 * Lo que las pantallas hacen con una cuenta — DEC-21, §9.10.9.
 *
 * Abrir en la entrada o en el salón, registrar una salida, llenar una mesa,
 * dividir. Cada transición devuelve la cuenta ya validada contra el contrato:
 * si produjera una cuenta imposible —cobrada con algo pendiente, por cobrar
 * sin nada que cobrar—, revienta aquí y no en la caja delante del cliente.
 *
 * Lo que solo hace el servidor (B3-3) no está aquí: marcar pagado lo hace el
 * cobro y devolver a la cola lo hace la anulación. El servidor compara cada
 * cuenta que se guarda con la que tiene y rechaza lo que no le toca a una
 * pantalla (`accountChangeProblem` del dominio).
 */
import {
  FamilyAccountSchema,
  type AccountLineDto,
  type FamilyAccountDto,
  type MoneyDto,
} from "@l2/contracts";
import { sum, type Money } from "@l2/domain-money";
import { chargeByUsage, chargeableLines, registerExit } from "@l2/domain-cash";
import type { DocumentLine, TaxCode } from "@l2/domain-tax";
import { toMoney } from "../park/mappers.ts";

/** Lo que falta por cobrar de una cuenta. Lo movido a otra cuenta, lo regalado y lo anulado ya no cuenta aquí. */
export function pendiente(c: FamilyAccountDto): Money {
  return sum(
    chargeableLines(c).map((l) => toMoney(l.amount)),
    "USD",
  );
}

/**
 * Cuánto dinero en total se ha regalado en esta cuenta.
 * El negocio necesita saber esto al final del turno (F6-14).
 */
export function cortesias(c: FamilyAccountDto): Money {
  return sum(
    c.lines.filter((l) => l.cortesia).map((l) => toMoney(l.amount)),
    "USD",
  );
}

/**
 * Las líneas de la cuenta que se marcaron como cortesía.
 * Tienen su importe intacto, pero no se cobran.
 */
export function lineasDeCortesia(
  c: FamilyAccountDto,
): FamilyAccountDto["lines"] {
  return c.lines.filter((l) => l.cortesia);
}

/** Una cuenta del salón (una mesa, o de pie desde B6-7): se cobra cuando la piden (F6-05). */
export function esDeMesa(c: FamilyAccountDto): boolean {
  return c.kind === "MESA" || c.dePie === true;
}

/**
 * Una línea añadida en el mostrador (snack, bebida, golosina) que todavía no
 * se cobró. Es la única que la caja puede cambiar de cantidad o quitar.
 * Lo consumido —el paquete, el tiempo de más y, cuando exista, el plato que la
 * cocina ya sirvió— no se toca desde aquí: corregirlo es una cortesía o una
 * anulación, con motivo y autorización (F6-14).
 */
export function esLineaDeMostrador(
  l: FamilyAccountDto["lines"][number],
): boolean {
  // La vendió el mostrador si es un producto del catálogo (B9-1); el servidor tampoco deja quitar otra.
  return l.productId !== undefined && !l.paid && !l.movedTo;
}

/** «#1042»: como se dice y se busca un número de orden. */
export function numeroDeOrden(c: FamilyAccountDto): string {
  return c.orderNumber
    ? `#${String(c.orderNumber).padStart(4, "0")}`
    : "Sin número";
}

/**
 * Venta de mostrador: una cuenta sin familia ni mesa, abierta en la caja (su tipo lo dice, B3-3). Una cuenta de
 * pie (B6-7) también es de mostrador, pero la abre el mesero con su nombre y sus pedidos van a cocina: en la
 * caja se trata como la de una mesa, no como un borrador que se vacía.
 */
export function esVentaDirecta(c: FamilyAccountDto): boolean {
  return c.kind === "MOSTRADOR" && !c.dePie;
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
  // Las mismas que cobra el servidor (`chargeableLines`): si no coinciden, el cobro choca.
  return chargeableLines(c)
    .map((l) => ({
      id: l.id,
      description: l.concept,
      unitPrice: toMoney(l.amount),
      quantity: 1n,
      // El trato que copió la línea al venderse (B9-1); lo del parque, IVA general.
      taxCode: l.taxCode ?? "GENERAL",
    }));
}

/**
 * Cómo quedará la cuenta si salen `salen` con sus excedentes (DEC-21). Es un ANTICIPO para enseñar
 * antes de confirmar qué pasa con cada cuenta; la salida la registra el servidor (B4-3) con la misma
 * regla del dominio (`registerExit`) y su propio reloj.
 */
export function previsualizarSalida(
  c: FamilyAccountDto,
  salen: readonly string[],
  excedentes: readonly {
    sessionId: string;
    concept: string;
    amount: MoneyDto;
  }[],
  /** Lo que sale antes de tiempo en cuenta abierta (B4-6): su paquete por uso, como lo asienta el servidor. */
  porUso: readonly { sessionId: string; concept: string; amount: MoneyDto; minutos: number }[] = [],
): FamilyAccountDto {
  const conUso = porUso.reduce(
    (cuenta, p) => chargeByUsage(cuenta, p.sessionId, { id: `uso-${p.sessionId}`, concept: p.concept, amountMinor: BigInt(p.amount.minor), minutos: p.minutos }) ?? cuenta,
    c,
  );
  return FamilyAccountSchema.parse(
    registerExit(
      conUso,
      salen,
      excedentes.map((e) => ({ sessionId: e.sessionId, concept: e.concept, amountMinor: BigInt(e.amount.minor) })),
    ),
  );
}

/* ═════════════════════════════════ dividir la cuenta — F6-12 ══ */

/** Divide la cuenta en partes iguales. Vuelve a empezar si ya estaba dividida y nadie pagó. */
export function dividirEn(
  c: FamilyAccountDto,
  partes: number,
): FamilyAccountDto {
  return FamilyAccountSchema.parse({
    ...c,
    split: { parts: partes, paid: c.split?.paid ?? 0 },
  });
}

/** Deja de dividir: vuelve a cobrarse de una vez. Solo si no se cobró ninguna parte. */
export function unirCuenta(c: FamilyAccountDto): FamilyAccountDto {
  if (c.split && c.split.paid > 0) return c;
  const { split: _, ...sinDividir } = c;
  return FamilyAccountSchema.parse(sinDividir);
}

/** Cuántas partes faltan por cobrar. 1 si la cuenta no está dividida. */
export function partesQueFaltan(c: FamilyAccountDto): number {
  return c.split ? c.split.parts - c.split.paid : 1;
}

/* ══════════════════════════════ la cuenta de la mesa — F6-05, D2, D3 ══ */

/**
 * Cómo se nombra una cuenta en una lista, un título o un aviso (B6-7): «Mesa 3», «Mesa 3 · Familia Pérez» en
 * una mesa compartida, «De pie · Sr. Luis», «Venta de mostrador» o el representante de una familia. La cuenta
 * de la mesa la abre el servidor al sentar a la familia (`abrirCuentaDelSalon`), no la pantalla.
 */
export function nombreDeCuenta(c: Readonly<{ kind: FamilyAccountDto["kind"]; family: string; tableLabel?: string | null | undefined; dePie?: true | undefined }>): string {
  if (c.kind === "MESA") {
    const mesa = `Mesa ${c.tableLabel ?? "?"}`;
    return c.family === mesa ? mesa : `${mesa} · ${c.family}`;
  }
  // Una venta del mostrador que se dejó pendiente a nombre de alguien (B6-9) se llama como él.
  if (c.kind === "MOSTRADOR") return c.dePie ? `De pie · ${c.family}` : c.family !== "Mostrador" ? c.family : "Venta de mostrador";
  return c.family;
}

/** ¿Es una cuenta del salón que sigue abierta (una mesa o de pie)? Lo que el mesero atiende (B6-7). */
export function esDelSalonAbierta(c: FamilyAccountDto): boolean {
  return (c.kind === "MESA" || (c.kind === "MOSTRADOR" && c.dePie === true)) && (c.status === "ABIERTA" || c.status === "POR_COBRAR");
}

/**
 * Añade a la cuenta de la mesa lo que se acaba de pedir (B6-1). Cada línea COPIA el nombre, el precio y
 * el trato del IVA del producto de la carta, con su `productId`: el servidor comprueba que son los de
 * hoy (un precio viejo de una tablet abierta no se cuela), y lo que se cuenta sale del estante.
 */
export function anadirPedido(
  c: FamilyAccountDto,
  platos: readonly { productId: string; concepto: string; precio: MoneyDto; taxCode: TaxCode; cantidad: number }[],
): FamilyAccountDto {
  const lineas: AccountLineDto[] = platos.flatMap((p) =>
    // Una línea por unidad: así se puede cobrar o cortesía una sola, y la caja
    // ya sabe agrupar las iguales en una fila con su cantidad.
    Array.from({ length: p.cantidad }, () => ({
      id: globalThis.crypto.randomUUID(),
      concept: p.concepto.slice(0, 80),
      kind: "RESTAURANTE" as const,
      amount: p.precio,
      paid: false,
      productId: p.productId,
      taxCode: p.taxCode,
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
  const mueven = familia.lines.filter(
    // Lo regalado no se mueve: no se debe, y su cortesía se quedó en esta cuenta.
    (l) => !l.paid && !l.movedTo && !l.cortesia && l.sessionId && ids.has(l.sessionId),
  );
  if (mueven.length === 0) return null;

  // Una línea nueva en la mesa, con su propio id: juntar los dos se cortaba a 64 y chocaba.
  const enLaMesa = mueven.map((l) => ({
    ...l,
    id: globalThis.crypto.randomUUID(),
  }));
  return {
    familia: FamilyAccountSchema.parse({
      ...familia,
      lines: familia.lines.map((l) =>
        mueven.includes(l) ? { ...l, movedTo: mesa.id } : l,
      ),
      // Si ya no le queda nada propio, deja de estar en la cola de la caja.
      status: familia.lines.some((l) => !l.paid && !mueven.includes(l))
        ? familia.status
        : "ABIERTA",
    }),
    mesa: FamilyAccountSchema.parse({
      ...mesa,
      sessionIds: [...new Set([...mesa.sessionIds, ...sessionIds])],
      lines: [...mesa.lines, ...enLaMesa],
    }),
  };
}

/**
 * La mesa pidió la cuenta: pasa a la cola de la caja si hay algo que cobrar. Lo anulado y lo regalado no
 * cuentan: una mesa en $ 0 no va a la caja, se libera (B6-5).
 */
export function pasarACaja(c: FamilyAccountDto): FamilyAccountDto {
  const hayPendiente = chargeableLines(c).length > 0;
  return FamilyAccountSchema.parse({
    ...c,
    status: hayPendiente ? "POR_COBRAR" : c.status,
  });
}

/**
 * Los niños de una cuenta del salón (B4-14, M-34), con si lo suyo está en esta cuenta o ya se pagó aparte: un niño que
 * pagó su parque y después se vinculó se ve «Pagado», sin cobrarse otra vez (vincular solo mueve lo pendiente).
 */
export function ninosDeLaMesa(c: FamilyAccountDto): readonly Readonly<{ sessionId: string; enLaCuenta: boolean }>[] {
  return c.sessionIds.map((sessionId) => ({ sessionId, enLaCuenta: c.lines.some((l) => l.sessionId === sessionId) }));
}
