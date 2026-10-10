/**
 * Pruebas de la cuenta — DEC-21, F6-12, DEC-24 (B3-3).
 *
 * Lo que fijan: qué se cobra y con qué IVA; cómo queda la cuenta al cobrar una parte, al cobrarla
 * entera y al anular; y qué cambio de una pantalla acepta el servidor: marcar pagado es del cobro,
 * una línea pagada no se toca, lo consumido no se quita, y una línea del catálogo lleva el precio
 * del catálogo de ese instante.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  accountChangeProblem,
  chargeableLines,
  documentLinesOf,
  markPaid,
  chargeByUsage,
  packagesOwed,
  markPartPaid,
  revertPaid,
  linesPaidBetween,
  isDiscardedDraft,
  isPendingAtClose,
  markUncollectible,
  uncollectibleProblem,
  courtesyProblem,
  withCourtesy,
  registerExit,
  registerRecharge,
  moveSessionLines,
  unlinkProblem,
  unlinkSession,
  receiveSession,
  anulacionProblem,
  anulacionesProblem,
  withAnulacion,
  sinConsumoProblem,
  closeWithoutConsumption,
  cancelReservationProblem,
  cancelReservation,
  type AccountDoc,
  type AccountLineDoc,
  type ProductAtNow,
  annulEntry,
} from "./cuenta.ts";

const usd = (minor: string) => ({ minor, currency: "USD" });
const linea = (id: string, extra: Partial<AccountLineDoc> = {}): AccountLineDoc => ({
  id,
  concept: "Paquete 1 hora",
  kind: "PAQUETE",
  amount: usd("1000"),
  paid: false,
  ...extra,
});
const agua = (id: string, extra: Partial<AccountLineDoc> = {}) =>
  linea(id, { concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("120"), productId: "p-agua", taxCode: "GENERAL", ...extra });

const familia = (extra: Partial<AccountDoc> = {}): AccountDoc => ({
  kind: "FAMILIA",
  status: "ABIERTA",
  sessionIds: ["s1", "s2"],
  closedSessionIds: [],
  lines: [linea("l1", { sessionId: "s1" }), linea("l2", { sessionId: "s2" })],
  ...extra,
});
const mostrador = (lines: AccountLineDoc[]): AccountDoc => ({ kind: "MOSTRADOR", status: "POR_COBRAR", sessionIds: [], closedSessionIds: [], lines });

const CATALOGO: Record<string, ProductAtNow> = {
  "p-agua": { name: "Agua mineral", amountMinor: 120n, taxCode: "GENERAL" },
  "p-pirulin": { name: "Pirulín", amountMinor: 250n, taxCode: "EXENTA" },
};
const productAt = (id: string) => CATALOGO[id] ?? null;

describe("qué se cobra", () => {
  test("ni lo pagado, ni lo movido, ni lo regalado", () => {
    const c = familia({
      lines: [linea("a"), linea("b", { paid: true }), linea("c", { movedTo: "mesa" }), linea("d", { cortesia: { motivo: "INVITACION" } })],
    });
    assert.deepEqual(chargeableLines(c).map((l) => l.id), ["a"]);
  });

  test("cada línea con el IVA que copió al venderse; el parque, general", () => {
    const docs = documentLinesOf(mostrador([agua("x"), linea("y", { productId: "p-pirulin", taxCode: "EXENTA", amount: usd("250") })]));
    assert.deepEqual(docs.map((d) => d.taxCode), ["GENERAL", "EXENTA"]);
    assert.equal(docs[1]!.unitPrice.amount, 250n);
    assert.equal(documentLinesOf(familia())[0]!.taxCode, "GENERAL");
  });
});

describe("cobrar y anular", () => {
  test("una familia con niños dentro queda abierta; la que se fue, cobrada", () => {
    assert.equal(markPaid(familia()).status, "ABIERTA");
    assert.equal(markPaid(familia({ closedSessionIds: ["s1", "s2"] })).status, "COBRADA");
    assert.ok(markPaid(familia()).lines.every((l) => l.paid));
  });

  test("el mostrador y la mesa se cierran al cobrar", () => {
    assert.equal(markPaid(mostrador([agua("x")])).status, "COBRADA");
  });

  test("lo regalado no se marca pagado: se entregó, no se cobró", () => {
    const c = markPaid(mostrador([agua("x"), agua("y", { cortesia: { motivo: "INVITACION" } })]));
    assert.deepEqual(c.lines.map((l) => l.paid), [true, false]);
  });

  test("dividida en tres: dos cobros la dejan en la cola; el tercero la cierra", () => {
    let c: AccountDoc = { ...mostrador([agua("x")]), split: { parts: 3, paid: 0 } };
    c = markPartPaid(c);
    c = markPartPaid(c);
    assert.equal(c.status, "POR_COBRAR");
    assert.equal(c.lines[0]!.paid, false);
    c = markPartPaid(c);
    assert.equal(c.status, "COBRADA");
    assert.deepEqual(c.split, { parts: 3, paid: 3 });
  });

  test("anular un cobro entero devuelve sus líneas a la cola", () => {
    const cobrada = markPaid(mostrador([agua("x"), agua("y")]));
    const c = revertPaid(cobrada, ["x"]);
    assert.equal(c.status, "POR_COBRAR");
    assert.deepEqual(c.lines.map((l) => l.paid), [false, true]);
    assert.equal(c.split, undefined);
  });

  test("anular una parte resta esa parte y la división sigue", () => {
    const dividida = { ...mostrador([agua("x")]), split: { parts: 3, paid: 0 } };
    const unaParte = markPartPaid(dividida);
    const c = revertPaid(unaParte, [], true);
    assert.deepEqual(c.split, { parts: 3, paid: 0 });
    assert.equal(c.status, "POR_COBRAR");
    assert.equal(c.lines[0]!.paid, false);
  });

  test("anular una parte de una cuenta completa devuelve a la cola lo que pagó la última", () => {
    let c: AccountDoc = { ...mostrador([agua("x")]), split: { parts: 2, paid: 0 } };
    c = markPartPaid(c);
    const antesDeLaUltima = c;
    c = markPartPaid(c);
    assert.equal(c.status, "COBRADA");
    const pagoLaUltima = linesPaidBetween(antesDeLaUltima, c);
    assert.deepEqual(pagoLaUltima, ["x"]);
    const anulada = revertPaid(c, pagoLaUltima, true);
    assert.deepEqual(anulada.split, { parts: 2, paid: 1 });
    assert.equal(anulada.lines[0]!.paid, false);
    assert.equal(anulada.status, "POR_COBRAR");
  });

  test("qué pagó un cobro sale de comparar la versión de antes con la suya", () => {
    const antes = mostrador([agua("x"), agua("y", { paid: true })]);
    assert.deepEqual(linesPaidBetween(antes, markPaid(antes)), ["x"]);
    assert.deepEqual(linesPaidBetween(null, antes), ["y"]);
  });

  test("una venta de mostrador vacía es un borrador descartado", () => {
    assert.equal(isDiscardedDraft(mostrador([])), true);
    assert.equal(isDiscardedDraft(mostrador([agua("x")])), false);
    // Una cuenta de pie recién abierta (B6-7) no es un borrador: alguien espera para pedir.
    assert.equal(isDiscardedDraft({ ...mostrador([]), dePie: true }), false);
    assert.equal(isDiscardedDraft({ ...familia(), lines: [] }), false);
  });
});

describe("qué cambio acepta el servidor", () => {
  test("una cuenta nueva sin pagos, con productos a su precio de hoy", () => {
    assert.equal(accountChangeProblem(null, mostrador([agua("x")]), productAt), null);
  });

  test("marcar pagado es del cobro, nunca de un «guardar»", () => {
    assert.equal(accountChangeProblem(null, mostrador([agua("x", { paid: true })]), productAt)?.problem, "PAGO_DESDE_LA_PANTALLA");
    const antes = familia();
    assert.equal(accountChangeProblem(antes, markPaid(antes), productAt)?.problem, "PAGO_DESDE_LA_PANTALLA");
    const pagada = markPaid(familia({ closedSessionIds: ["s1", "s2"] }));
    assert.equal(accountChangeProblem(pagada, revertPaid(pagada, ["l1"]), productAt)?.problem, "PAGO_DESDE_LA_PANTALLA");
  });

  test("una cuenta nueva no nace cobrada ni con partes cobradas", () => {
    assert.equal(accountChangeProblem(null, { ...mostrador([agua("x")]), status: "COBRADA" }, productAt)?.problem, "NUEVA_CON_PAGOS");
    assert.equal(accountChangeProblem(null, { ...mostrador([agua("x")]), split: { parts: 2, paid: 1 } }, productAt)?.problem, "NUEVA_CON_PAGOS");
  });

  test("un precio viejo de una pantalla abierta no se cuela", () => {
    const vieja = agua("x", { amount: usd("100") });
    assert.equal(accountChangeProblem(null, mostrador([vieja]), productAt)?.problem, "PRECIO_DISTINTO");
    assert.equal(accountChangeProblem(null, mostrador([agua("x", { taxCode: "EXENTA" })]), productAt)?.problem, "PRECIO_DISTINTO");
    assert.equal(accountChangeProblem(null, mostrador([agua("x", { productId: "p-apartado" })]), productAt)?.problem, "PRODUCTO_QUE_NO_SE_VENDE");
  });

  test("lo ya añadido conserva su precio aunque el catálogo cambie después", () => {
    const antes = mostrador([agua("x", { amount: usd("100") })]);
    const despues = mostrador([agua("x", { amount: usd("100") }), agua("y")]);
    assert.equal(accountChangeProblem(antes, despues, productAt), null);
  });

  test("el mostrador vende del catálogo", () => {
    assert.equal(accountChangeProblem(null, mostrador([linea("x", { kind: "RESTAURANTE" })]), productAt)?.problem, "MOSTRADOR_SIN_PRODUCTO");
  });

  test("lo que se pide en la mesa sale de la carta, con su precio de hoy (B6-1)", () => {
    const mesa = (lines: AccountLineDoc[]): AccountDoc => ({ kind: "MESA", status: "ABIERTA", sessionIds: [], closedSessionIds: [], tableId: "m-1", lines });
    assert.equal(accountChangeProblem(null, mesa([linea("x", { kind: "RESTAURANTE" })]), productAt)?.problem, "MESA_SIN_PRODUCTO");
    assert.equal(accountChangeProblem(null, mesa([agua("x", { amount: usd("100") })]), productAt)?.problem, "PRECIO_DISTINTO");
    assert.equal(accountChangeProblem(null, mesa([agua("x")]), productAt), null);
  });

  test("lo de mostrador sin pagar se quita; lo consumido, no", () => {
    const antes = { ...familia(), lines: [...familia().lines, agua("x")] };
    assert.equal(accountChangeProblem(antes, familia(), productAt), null);
    assert.equal(accountChangeProblem(familia(), { ...familia(), lines: [familia().lines[0]!] }, productAt)?.problem, "LINEA_QUITADA");
  });

  test("lo pedido en una mesa tampoco se quita con un «guardar» (B6-3): se anula, con su mando", () => {
    const mesa: AccountDoc = { kind: "MESA", status: "ABIERTA", tableId: "m1", sessionIds: [], closedSessionIds: [], lines: [agua("x")] };
    assert.equal(accountChangeProblem(mesa, { ...mesa, lines: [] }, productAt)?.problem, "LINEA_QUITADA");
  });

  test("una línea no cambia de importe ni de concepto", () => {
    const c = familia();
    const alterada = { ...c, lines: [{ ...c.lines[0]!, amount: usd("1") }, c.lines[1]!] };
    assert.equal(accountChangeProblem(c, alterada, productAt)?.problem, "LINEA_ALTERADA");
  });

  test("un «guardar» no da ni quita cortesías: tienen su propio mando", () => {
    const c = familia();
    const regalada = { ...c, lines: c.lines.map((l) => ({ ...l, cortesia: { motivo: "INVITACION" } })) };
    assert.equal(accountChangeProblem(c, regalada, productAt)?.problem, "CORTESIA_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(regalada, c, productAt)?.problem, "CORTESIA_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(null, mostrador([agua("x", { cortesia: { motivo: "INVITACION" } })]), productAt)?.problem, "CORTESIA_DESDE_LA_PANTALLA");
  });

  test("un «guardar» tampoco anula un pedido: tiene su propio mando (F6-14)", () => {
    const mesa: AccountDoc = { kind: "MESA", status: "ABIERTA", tableId: "m1", sessionIds: [], closedSessionIds: [], lines: [agua("x")] };
    const anulada = { ...mesa, lines: [{ ...mesa.lines[0]!, anulacion: { motivo: "PEDIDO_EQUIVOCADO" } }] };
    assert.equal(accountChangeProblem(mesa, anulada, productAt)?.problem, "ANULACION_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(anulada, mesa, productAt)?.problem, "ANULACION_DESDE_LA_PANTALLA");
  });

  test("se regala lo que se debe todavía, y se quita lo regalado", () => {
    const c = familia({ lines: [linea("a"), linea("b", { paid: true }), linea("c", { movedTo: "mesa" })] });
    assert.equal(courtesyProblem(c, "a", false), null);
    assert.equal(courtesyProblem(c, "b", false), "LINEA_PAGADA");
    assert.equal(courtesyProblem(c, "c", false), "LINEA_MOVIDA");
    assert.equal(courtesyProblem(c, "z", false), "LINEA_DESCONOCIDA");
    assert.equal(courtesyProblem(c, "a", true), "NO_REGALADA");
    const regalada = withCourtesy(c, "a", { motivo: "INVITACION" });
    assert.deepEqual(regalada.lines[0]!.cortesia, { motivo: "INVITACION" });
    assert.equal(courtesyProblem(regalada, "a", false), "YA_REGALADA");
    assert.equal("cortesia" in withCourtesy(regalada, "a", null).lines[0]!, false);
    // Lo regalado deja de cobrarse, pero conserva su importe.
    assert.deepEqual(chargeableLines(regalada).map((l) => l.id), []);
    assert.deepEqual(regalada.lines[0]!.amount, c.lines[0]!.amount);
  });

  test("lo movido a una mesa no se mueve otra vez", () => {
    const c = familia({ lines: [linea("l1", { sessionId: "s1", movedTo: "mesa-1" })] });
    assert.equal(accountChangeProblem(c, familia({ lines: [linea("l1", { sessionId: "s1", movedTo: "mesa-2" })] }), productAt)?.problem, "MOVIDA_OTRA_VEZ");
  });

  test("las partes cobradas las cuenta el cobro; dividir o unir, solo sin partes cobradas", () => {
    const c = { ...mostrador([agua("x")]), split: { parts: 2, paid: 0 } };
    assert.equal(accountChangeProblem(c, { ...c, split: { parts: 3, paid: 0 } }, productAt), null);
    assert.equal(accountChangeProblem(c, { ...c, split: { parts: 2, paid: 1 } }, productAt)?.problem, "DIVISION_ALTERADA");
    const cobrandose = { ...c, split: { parts: 2, paid: 1 } };
    assert.equal(accountChangeProblem(cobrandose, { ...cobrandose, split: { parts: 3, paid: 1 } }, productAt)?.problem, "DIVISION_ALTERADA");
  });

  test("ni el tipo, ni la mesa, ni los niños de una cuenta se cambian", () => {
    const c = familia();
    assert.equal(accountChangeProblem(c, { ...c, kind: "MESA" }, productAt)?.problem, "TIPO_CAMBIADO");
    assert.equal(accountChangeProblem(c, { ...c, sessionIds: ["s1"] }, productAt)?.problem, "ESTANCIA_QUITADA");
    // A una familia los niños los mete la entrada (B4-2); a una mesa, vincular pulseras (B6-3): las dos
    // tienen su propio mando, que mueve el dinero del parque a la vez. Un «guardar» no hace ni lo uno ni lo otro.
    assert.equal(accountChangeProblem(c, { ...c, sessionIds: ["s1", "s2", "s3"] }, productAt)?.problem, "ESTANCIAS_DESDE_LA_PANTALLA");
    const mesa: AccountDoc = { kind: "MESA", status: "ABIERTA", tableId: "m1", sessionIds: [], closedSessionIds: [], lines: [] };
    assert.equal(accountChangeProblem(mesa, { ...mesa, sessionIds: ["s1"] }, productAt)?.problem, "ESTANCIAS_DESDE_LA_PANTALLA");
  });
});

describe("el cierre de la jornada (B3-5, D-JOR)", () => {
  test("lo que se debe o sigue abierto impide cerrar; lo cobrado, lo incobrable y lo vaciado, no", () => {
    assert.equal(isPendingAtClose(familia()), true);
    assert.equal(isPendingAtClose({ ...mostrador([agua("x")]), status: "POR_COBRAR" }), true);
    assert.equal(isPendingAtClose(markPaid(mostrador([agua("x")]))), false);
    assert.equal(isPendingAtClose(markUncollectible(familia())), false);
    assert.equal(isPendingAtClose({ ...mostrador([]), status: "ABIERTA" }), false);
  });

  test("marcar incobrable no borra lo que se debía, y ninguna pantalla lo hace ni lo deshace", () => {
    const c = familia();
    const incobrable = markUncollectible(c);
    assert.equal(incobrable.status, "INCOBRABLE");
    assert.deepEqual(incobrable.lines, c.lines);
    assert.equal(accountChangeProblem(c, incobrable, productAt)?.problem, "CUENTA_INCOBRABLE");
    assert.equal(accountChangeProblem(incobrable, { ...incobrable, status: "ABIERTA" }, productAt)?.problem, "CUENTA_INCOBRABLE");
  });

  test("se da por incobrable lo pendiente, y una familia solo cuando sus niños ya salieron", () => {
    assert.equal(uncollectibleProblem(familia()), "NINOS_EN_SALA");
    assert.equal(uncollectibleProblem(familia({ closedSessionIds: ["s1"] })), "NINOS_EN_SALA");
    assert.equal(uncollectibleProblem(familia({ status: "POR_COBRAR", closedSessionIds: ["s1", "s2"] })), null);
    assert.equal(uncollectibleProblem(mostrador([agua("x")])), null);
    assert.equal(uncollectibleProblem(markPaid(mostrador([agua("x")]))), "NO_PENDIENTE");
    assert.equal(uncollectibleProblem(markUncollectible(mostrador([agua("x")]))), "NO_PENDIENTE");
  });
});

describe("el parque es del parque (B4-2, B4-3)", () => {
  test("una pantalla no abre la cuenta de una familia", () => {
    assert.equal(accountChangeProblem(null, familia(), productAt)?.problem, "FAMILIA_DESDE_LA_PANTALLA");
  });

  test("ni mete ni saca niños de ella", () => {
    const c = familia();
    assert.equal(accountChangeProblem(c, { ...c, closedSessionIds: ["s1"] }, productAt)?.problem, "ESTANCIAS_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(c, { ...c, sessionIds: [...c.sessionIds, "s3"] }, productAt)?.problem, "ESTANCIAS_DESDE_LA_PANTALLA");
  });

  test("ni le pone paquete ni tiempo de más; lo de mostrador, sí", () => {
    const c = familia();
    const conExcedente = { ...c, lines: [...c.lines, linea("exc-s1", { kind: "EXCEDENTE", sessionId: "s1", amount: usd("1") })] };
    assert.equal(accountChangeProblem(c, conExcedente, productAt)?.problem, "PARQUE_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(c, { ...c, lines: [...c.lines, agua("x")] }, productAt), null);
  });
});

describe("la salida de una familia (B4-3)", () => {
  const prepago = (extra: Partial<AccountDoc> = {}) => ({ ...familia(extra), mode: "PREPAGO" as const });
  const abierta = (extra: Partial<AccountDoc> = {}) => ({ ...familia(extra), mode: "CUENTA_ABIERTA" as const });
  const pagadas = [linea("l1", { sessionId: "s1", paid: true }), linea("l2", { sessionId: "s2", paid: true })];
  const exceso = (sessionId: string, amountMinor: bigint) => ({ sessionId, concept: `Tiempo de más · ${sessionId}`, amountMinor });

  test("prepago sin excedente: sale sin cargo y queda cobrada con el último", () => {
    const uno = registerExit(prepago({ lines: pagadas }), ["s1"], []);
    assert.equal(uno.status, "ABIERTA");
    assert.equal(registerExit(uno, ["s2"], [exceso("s2", 0n)]).status, "COBRADA");
  });

  test("prepago con excedente: se cobra ya, aunque el hermano siga dentro", () => {
    const c = registerExit(prepago({ lines: pagadas }), ["s1"], [exceso("s1", 150n)]);
    assert.equal(c.status, "POR_COBRAR");
    assert.deepEqual(c.lines.at(-1), { id: "exc-s1", concept: "Tiempo de más · s1", kind: "EXCEDENTE", amount: usd("150"), paid: false, sessionId: "s1" });
  });

  test("cuenta abierta: se acumula y pasa a la caja con el último", () => {
    const uno = registerExit(abierta(), ["s1"], [exceso("s1", 150n)]);
    assert.equal(uno.status, "ABIERTA");
    const dos = registerExit(uno, ["s2"], []);
    assert.equal(dos.status, "POR_COBRAR");
    assert.equal(chargeableLines(dos).length, 3);
  });

  test("la misma salida dos veces no duplica el excedente", () => {
    const uno = registerExit(abierta(), ["s1"], [exceso("s1", 150n)]);
    assert.equal(registerExit(uno, ["s1"], [exceso("s1", 300n)]).lines.length, 3);
  });
});

describe("la recarga de tiempo (B4-3, F5-11)", () => {
  const linea = { id: "rec-1", concept: "Recarga 30 minutos · AK-1", sessionId: "s1", amountMinor: 300n };
  test("en prepago se cobra ya: la cuenta vuelve a la cola", () => {
    const c = registerRecharge({ ...familia({ lines: [] }), mode: "PREPAGO" as const }, linea);
    assert.equal(c.status, "POR_COBRAR");
    assert.deepEqual(c.lines.at(-1), { id: "rec-1", concept: "Recarga 30 minutos · AK-1", kind: "PAQUETE", amount: usd("300"), paid: false, sessionId: "s1" });
  });
  test("en cuenta abierta se acumula, y la misma recarga no se añade dos veces", () => {
    const c = registerRecharge({ ...familia(), mode: "CUENTA_ABIERTA" as const }, linea);
    assert.equal(c.status, "ABIERTA");
    assert.equal(registerRecharge(c, linea).lines.length, 3);
  });
});

describe("cobrar el parque por uso (B4-6, M-18)", () => {
  const nueva = { id: "uso-s1", concept: "Paquete 30 minutos por uso (25 min) · AK-1", amountMinor: 300n, minutos: 25 };
  const conRecarga = familia({ lines: [linea("l1", { sessionId: "s1" }), linea("r1", { sessionId: "s1" }), linea("l2", { sessionId: "s2" })] });

  test("el paquete y sus recargas se cambian por la línea por uso: se quedan con su importe y no se cobran", () => {
    assert.equal(packagesOwed(conRecarga, "s1"), 2000n);
    const c = chargeByUsage(conRecarga, "s1", nueva)!;
    assert.deepEqual(c.lines.filter((l) => l.porUso).map((l) => l.id), ["l1", "r1"]);
    assert.deepEqual(c.lines.find((l) => l.id === "l1")!.porUso, { cambiadaPor: "uso-s1", minutos: 25 });
    assert.deepEqual(chargeableLines(c).map((l) => l.id), ["l2", "uso-s1"]);
    assert.equal(packagesOwed(c, "s1"), 300n);
  });

  test("nada que cambiar si su paquete ya se pagó, se movió a una mesa o ya se cambió", () => {
    assert.equal(chargeByUsage(familia({ lines: [linea("l1", { sessionId: "s1", paid: true })] }), "s1", nueva), null);
    assert.equal(chargeByUsage(familia({ lines: [linea("l1", { sessionId: "s1", movedTo: "mesa" })] }), "s1", nueva), null);
    assert.equal(chargeByUsage(chargeByUsage(conRecarga, "s1", nueva)!, "s1", nueva), null);
  });

  test("lo cambiado no se cobra, no se regala, no se mueve y no lo toca un «guardar»", () => {
    const c = chargeByUsage(conRecarga, "s1", nueva)!;
    assert.deepEqual(markPaid({ ...c, closedSessionIds: ["s1", "s2"] }).lines.filter((l) => l.paid).map((l) => l.id), ["l2", "uso-s1"]);
    assert.equal(courtesyProblem(c, "l1", false), "CAMBIADA_POR_USO");
    assert.deepEqual(moveSessionLines(c, ["s1"], "mesa", (l) => `m-${l.id}`).lineasNuevas.map((l) => l.id), ["m-uso-s1"]);
    assert.equal(accountChangeProblem(conRecarga, c, productAt)?.problem, "POR_USO_DESDE_LA_PANTALLA");
  });
});

describe("vincular pulseras a una mesa (F6-05, B6-3)", () => {
  const idsNuevos = (prefijo: string) => {
    let n = 0;
    return (l: AccountLineDoc) => `${prefijo}-${l.id}-${++n}`;
  };

  test("mueve lo pendiente del parque de esas estancias, con un id propio en la mesa", () => {
    const f = familia({ lines: [linea("l1", { sessionId: "s1" }), linea("l2", { sessionId: "s2" })] });
    const { familia: fQueda, lineasNuevas } = moveSessionLines(f, ["s1"], "mesa-1", idsNuevos("mov"));
    assert.deepEqual(fQueda.lines[0], { ...f.lines[0]!, movedTo: "mesa-1" });
    assert.equal(fQueda.lines[1], f.lines[1]); // s2 no se toca
    assert.equal(lineasNuevas.length, 1);
    assert.equal(lineasNuevas[0]!.id, "mov-l1-1");
    assert.equal(lineasNuevas[0]!.movedTo, undefined);
    assert.equal(lineasNuevas[0]!.sessionId, "s1");
  });

  test("lo ya pagado, lo ya movido y lo regalado no se mueven otra vez", () => {
    const f = familia({
      lines: [
        linea("pagada", { sessionId: "s1", paid: true }),
        linea("movida", { sessionId: "s1", movedTo: "otra-mesa" }),
        linea("regalada", { sessionId: "s1", cortesia: { motivo: "INVITACION" } }),
      ],
    });
    const { lineasNuevas } = moveSessionLines(f, ["s1"], "mesa-1", idsNuevos("mov"));
    assert.deepEqual(lineasNuevas, []);
  });

  test("sin nada pendiente de esas estancias, no mueve nada", () => {
    const f = familia({ lines: [linea("l1", { sessionId: "s1" })] });
    const { familia: fQueda, lineasNuevas } = moveSessionLines(f, ["s2"], "mesa-1", idsNuevos("mov"));
    assert.deepEqual(fQueda.lines, f.lines);
    assert.deepEqual(lineasNuevas, []);
  });

  test("si lo movido era lo único pendiente, la cuenta sale de la cola de la caja", () => {
    const enCola = familia({ status: "POR_COBRAR", lines: [linea("l1", { sessionId: "s1" })] });
    const { familia: fQueda } = moveSessionLines(enCola, ["s1"], "mesa-1", idsNuevos("mov"));
    assert.equal(fQueda.status, "ABIERTA");
    const todosFuera = familia({ status: "POR_COBRAR", closedSessionIds: ["s1", "s2"], lines: [linea("l1", { sessionId: "s1" })] });
    assert.equal(moveSessionLines(todosFuera, ["s1"], "mesa-1", idsNuevos("mov")).familia.status, "COBRADA");
  });

  test("si queda otra cosa pendiente en la familia, sigue en la cola", () => {
    const enCola = familia({ status: "POR_COBRAR", lines: [linea("l1", { sessionId: "s1" }), agua("x")] });
    assert.equal(moveSessionLines(enCola, ["s1"], "mesa-1", idsNuevos("mov")).familia.status, "POR_COBRAR");
  });
});

describe("desvincular una pulsera (B6-15, M-37)", () => {
  const mesa = (extra: Partial<AccountDoc> = {}): AccountDoc => ({
    kind: "MESA",
    status: "ABIERTA",
    sessionIds: ["s1", "s2"],
    closedSessionIds: [],
    tableId: "t1",
    lines: [linea("m1", { sessionId: "s1" }), linea("m2", { sessionId: "s2" }), agua("a1")],
    ...extra,
  });
  const ids = (l: AccountLineDoc) => `n-${l.id}`;

  test("lo que se debe de esa estancia sale de la mesa marcado y nace igual, con id propio, para el destino", () => {
    const { desde, lineasNuevas } = unlinkSession(mesa(), "s1", "fam-1", ids);
    assert.deepEqual(desde.sessionIds, ["s2"]);
    assert.equal(desde.lines[0]!.movedTo, "fam-1");
    assert.deepEqual(desde.lines[1], mesa().lines[1]); // s2 no se toca
    assert.deepEqual(lineasNuevas.map((l) => [l.id, l.sessionId, l.movedTo]), [["n-m1", "s1", undefined]]);
    assert.deepEqual(chargeableLines(desde).map((l) => l.id), ["m2", "a1"]);
  });

  test("lo regalado se queda donde se dio, y una mesa en la cola sin nada que cobrar vuelve a abierta", () => {
    const enCola = mesa({ status: "POR_COBRAR", sessionIds: ["s1"], lines: [linea("m1", { sessionId: "s1" }), linea("r1", { sessionId: "s1", cortesia: { motivo: "X" } })] });
    const { desde, lineasNuevas } = unlinkSession(enCola, "s1", "fam-1", ids);
    assert.deepEqual(lineasNuevas.map((l) => l.id), ["n-m1"]);
    assert.equal(desde.lines[1]!.movedTo, undefined);
    assert.equal(desde.status, "ABIERTA");
    assert.equal(unlinkSession(mesa({ status: "POR_COBRAR" }), "s1", "f", ids).desde.status, "POR_COBRAR"); // queda lo demás
  });

  test("lo cobrado no se mueve: ni su parque pagado ni una división a medio cobrar", () => {
    assert.equal(unlinkProblem(mesa(), "s1"), null);
    assert.equal(unlinkProblem(mesa(), "s9"), "NO_VINCULADO");
    assert.equal(unlinkProblem(mesa({ lines: [linea("m1", { sessionId: "s1", paid: true })] }), "s1"), "YA_COBRADO");
    assert.equal(unlinkProblem(mesa({ split: { parts: 3, paid: 1 } }), "s1"), "COBRO_EN_CURSO");
    assert.equal(unlinkProblem(mesa({ split: { parts: 3, paid: 0 } }), "s1"), null);
  });

  test("otra mesa recibe la estancia (su salida va ahí) y sus líneas, sin cambiar de estado", () => {
    const otra = mesa({ sessionIds: [], lines: [agua("b1")] });
    const r = receiveSession(otra, "s1", [linea("n-m1", { sessionId: "s1" })]);
    assert.deepEqual(r.sessionIds, ["s1"]);
    assert.deepEqual(r.lines.map((l) => l.id), ["b1", "n-m1"]);
    assert.equal(r.status, "ABIERTA");
    assert.deepEqual(receiveSession(r, "s1", [linea("n-m1", { sessionId: "s1" })]).lines.length, 2); // un reintento no duplica
  });

  test("la familia la recibe: abierta si quedan niños dentro; a la cola en prepago o si ya salieron todos", () => {
    const abierta = { ...familia({ lines: [] }), mode: "CUENTA_ABIERTA" };
    const vuelta = [linea("n-m1", { sessionId: "s1" })];
    assert.equal(receiveSession(abierta, "s1", vuelta).status, "ABIERTA");
    assert.deepEqual(receiveSession(abierta, "s1", vuelta).sessionIds, ["s1", "s2"]); // la familia ya la tenía
    assert.equal(receiveSession({ ...abierta, mode: "PREPAGO" }, "s1", vuelta).status, "POR_COBRAR");
    assert.equal(receiveSession({ ...abierta, closedSessionIds: ["s1", "s2"] }, "s1", vuelta).status, "POR_COBRAR");
    assert.equal(receiveSession({ ...abierta, mode: "PREPAGO" }, "s1", []).status, "ABIERTA"); // sin deuda, nada cambia
  });
});

describe("anular un pedido en producción (F6-14, B6-3)", () => {
  const plato = (id: string, extra: Partial<AccountLineDoc> = {}) => agua(id, { orderId: "ped-1", ...extra });

  test("se anula un plato que se debe todavía; lo pagado, lo movido y lo regalado, no", () => {
    const c = mostrador([plato("a"), plato("b", { paid: true }), plato("c", { movedTo: "otra" }), plato("d", { cortesia: { motivo: "INVITACION" } })]);
    assert.equal(anulacionProblem(c, "a"), null);
    assert.equal(anulacionProblem(c, "b"), "LINEA_PAGADA");
    assert.equal(anulacionProblem(c, "c"), "LINEA_MOVIDA");
    assert.equal(anulacionProblem(c, "d"), "YA_REGALADA");
    assert.equal(anulacionProblem(c, "z"), "LINEA_DESCONOCIDA");
  });

  test("solo se anula un plato: lo del parque no es un pedido", () => {
    const c = familia();
    assert.equal(anulacionProblem(c, "l1"), "NO_ES_PEDIDO");
  });

  test("anulado una vez, no se anula otra; se queda con su importe y deja de cobrarse", () => {
    const c = mostrador([plato("a")]);
    const anulada = withAnulacion(c, "a", { motivo: "PEDIDO_EQUIVOCADO" });
    assert.deepEqual(anulada.lines[0]!.anulacion, { motivo: "PEDIDO_EQUIVOCADO" });
    assert.deepEqual(anulada.lines[0]!.amount, c.lines[0]!.amount);
    assert.equal(anulacionProblem(anulada, "a"), "YA_ANULADA");
    assert.deepEqual(chargeableLines(anulada).map((l) => l.id), []);
  });

  test("varios platos de una vez, solo de una comanda: cada anulación saca un papel (B6-6)", () => {
    const c = mostrador([plato("a"), plato("b"), agua("c", { orderId: "ped-2" }), plato("d", { paid: true })]);
    assert.equal(anulacionesProblem(c, ["a", "b"]), null);
    assert.deepEqual(anulacionesProblem(c, ["a", "c"]), { problem: "PEDIDOS_DISTINTOS", lineId: "a" });
    assert.deepEqual(anulacionesProblem(c, ["a", "d"]), { problem: "LINEA_PAGADA", lineId: "d" });
  });

  test("al cobrar, lo anulado no se marca pagado: no se cobró", () => {
    const c = { ...mostrador([plato("a"), plato("b")]), kind: "MESA" as const, tableId: "mesa-1" };
    const cobrada = markPaid(withAnulacion(c, "a", { motivo: "CLIENTE_DESISTIO" }));
    assert.equal(cobrada.status, "COBRADA");
    assert.deepEqual(cobrada.lines.map((l) => [l.id, l.paid]), [["a", false], ["b", true]]);
  });
});

describe("la mesa sin consumo (B6-5, M-18)", () => {
  const mesa = (lines: AccountLineDoc[], extra: Partial<AccountDoc> = {}): AccountDoc => ({
    kind: "MESA",
    status: "ABIERTA",
    sessionIds: [],
    closedSessionIds: [],
    tableId: "mesa-1",
    lines,
    ...extra,
  });
  const anulacion = { motivo: "CLIENTE_DESISTIO" };

  test("se libera una mesa sin nada que cobrar: vacía, o con todo anulado, regalado o movido", () => {
    assert.equal(sinConsumoProblem(mesa([])), null);
    assert.equal(sinConsumoProblem(mesa([agua("a", { anulacion })])), null);
    assert.equal(sinConsumoProblem(mesa([agua("a", { cortesia: { motivo: "INVITACION" } }), agua("b", { movedTo: "otra" })])), null);
    assert.equal(sinConsumoProblem(mesa([agua("a", { anulacion })], { status: "POR_COBRAR" })), null);
  });

  test("con algo por cobrar no se libera: se pide la cuenta", () => {
    assert.equal(sinConsumoProblem(mesa([agua("a", { anulacion }), agua("b")])), "QUEDA_POR_COBRAR");
  });

  test("solo una mesa abierta: ni la familia ni el mostrador, ni una cuenta ya cerrada", () => {
    assert.equal(sinConsumoProblem({ ...familia(), lines: [] }), "NO_ES_MESA");
    assert.equal(sinConsumoProblem(mostrador([])), "NO_ES_MESA");
    assert.equal(sinConsumoProblem(mesa([], { status: "COBRADA" })), "NO_ABIERTA");
    assert.equal(sinConsumoProblem(mesa([], { status: "SIN_CONSUMO" })), "NO_ABIERTA");
  });

  test("una cuenta de pie del salón también se libera (B6-7); una venta de mostrador de la caja, no", () => {
    assert.equal(sinConsumoProblem({ ...mostrador([]), dePie: true }), null);
    assert.equal(sinConsumoProblem({ ...mostrador([agua("a")]), dePie: true }), "QUEDA_POR_COBRAR");
  });

  test("se cierra «sin consumo», o cobrada si ya se cobró una parte; las líneas no cambian y no queda pendiente", () => {
    const anulada = mesa([agua("a", { anulacion })]);
    const cerrada = closeWithoutConsumption(anulada);
    assert.equal(cerrada.status, "SIN_CONSUMO");
    assert.deepEqual(cerrada.lines, anulada.lines);
    assert.equal(isPendingAtClose(cerrada), false);
    assert.equal(closeWithoutConsumption(mesa([agua("a", { paid: true }), agua("b", { anulacion })], { status: "POR_COBRAR" })).status, "COBRADA");
  });

  test("un «guardar» de la pantalla no cierra sin consumo ni toca una cuenta cerrada así", () => {
    const abierta = mesa([]);
    assert.equal(accountChangeProblem(abierta, { ...abierta, status: "SIN_CONSUMO" }, productAt)?.problem, "CUENTA_SIN_CONSUMO");
    const cerrada = mesa([], { status: "SIN_CONSUMO" });
    assert.equal(accountChangeProblem(cerrada, { ...cerrada, status: "ABIERTA" }, productAt)?.problem, "CUENTA_SIN_CONSUMO");
  });
});

describe("la cuenta de un cumpleaños (B10-1)", () => {
  const anticipo = linea("ant", { concept: "Anticipo 50 % · Cumpleaños de Sofía", kind: "EVENTO", amount: usd("7500") });
  const evento = (extra: Partial<AccountDoc> = {}): AccountDoc => ({
    kind: "EVENTO",
    status: "POR_COBRAR",
    sessionIds: [],
    closedSessionIds: [],
    lines: [anticipo],
    ...extra,
  });

  test("el anticipo se cobra como cualquier línea, y al cobrarlo la cuenta queda cobrada", () => {
    assert.deepEqual(chargeableLines(evento()).map((l) => l.id), ["ant"]);
    const cobrada = markPaid(evento());
    assert.equal(cobrada.status, "COBRADA");
    assert.equal(isPendingAtClose(cobrada), false);
  });

  test("una pantalla no la abre ni la cambia: la abre su reserva", () => {
    assert.equal(accountChangeProblem(null, evento(), productAt)?.problem, "EVENTO_DESDE_LA_PANTALLA");
    const antes = evento();
    assert.equal(accountChangeProblem(antes, { ...antes, lines: [...antes.lines, agua("a")] }, productAt)?.problem, "EVENTO_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(antes, { ...antes, split: { parts: 2, paid: 0 } }, productAt)?.problem, "EVENTO_DESDE_LA_PANTALLA");
  });

  test("el anticipo no se regala ni se da por incobrable: si no se cobra, se cancela la reserva", () => {
    assert.equal(courtesyProblem(evento(), "ant", false), "ANTICIPO_DE_EVENTO");
    assert.equal(uncollectibleProblem(evento()), "ES_DE_UN_EVENTO");
  });

  test("se cancela con el anticipo sin cobrar: queda sin consumo, fuera del cierre, con su línea intacta", () => {
    assert.equal(cancelReservationProblem(evento()), null);
    const cancelada = cancelReservation(evento());
    assert.equal(cancelada.status, "SIN_CONSUMO");
    assert.deepEqual(cancelada.lines, [anticipo]);
    assert.equal(isPendingAtClose(cancelada), false);
  });

  test("con el anticipo cobrado no se cancela (se anula el cobro primero), ni dos veces, ni otra cuenta", () => {
    assert.equal(cancelReservationProblem(markPaid(evento())), "ANTICIPO_COBRADO");
    assert.equal(cancelReservationProblem(evento({ status: "SIN_CONSUMO" })), "YA_CANCELADA");
    assert.equal(cancelReservationProblem(mostrador([agua("a")])), "NO_ES_EVENTO");
    // Tras anular el cobro, el anticipo vuelve a deberse y la reserva se puede cancelar.
    const anulado = revertPaid(markPaid(evento()), ["ant"]);
    assert.equal(anulado.status, "POR_COBRAR");
    assert.equal(cancelReservationProblem(anulado), null);
  });
});

describe("la cuenta del día de un cumpleaños (B10-2)", () => {
  const saldo = linea("saldo", { concept: "Saldo · Cumpleaños de Sofía", kind: "EVENTO", amount: usd("7500") });
  const torta = linea("torta", { concept: "Torta · incluida", kind: "EVENTO", amount: usd("0"), productId: "p-torta" });
  const dia = (extra: Partial<AccountDoc> = {}): AccountDoc => ({
    kind: "EVENTO",
    eventDay: true,
    status: "POR_COBRAR",
    sessionIds: ["g1", "g2"],
    closedSessionIds: [],
    lines: [saldo, torta],
    ...extra,
  });
  const conModo = (c: AccountDoc) => ({ ...c, mode: "PREPAGO" as const });

  test("se cobra como una mesa: cobrado el saldo queda cobrada aunque haya invitados dentro", () => {
    assert.deepEqual(chargeableLines(dia()).map((l) => l.id), ["saldo", "torta"]);
    assert.equal(markPaid(dia()).status, "COBRADA");
  });

  test("que salgan invitados no la reabre ni la cierra: sigue por cobrar mientras deba el saldo", () => {
    assert.equal(registerExit(conModo(dia()), ["g1"], []).status, "POR_COBRAR");
    assert.equal(registerExit(conModo(dia()), ["g1", "g2"], []).status, "POR_COBRAR");
    const cobrada = markPaid(dia());
    assert.equal(registerExit(conModo(cobrada), ["g1"], []).status, "COBRADA");
  });

  test("el saldo no se regala, pero sí se da por incobrable cuando ya salieron todos", () => {
    assert.equal(courtesyProblem(dia(), "saldo", false), "ANTICIPO_DE_EVENTO");
    assert.equal(uncollectibleProblem(dia()), "NINOS_EN_SALA");
    assert.equal(uncollectibleProblem(dia({ closedSessionIds: ["g1", "g2"] })), null);
  });

  test("la reserva no se cancela por la cuenta del día", () => {
    assert.equal(cancelReservationProblem(dia()), "NO_ES_EVENTO");
  });
});

describe("anular una entrada registrada por error (B4-10)", () => {
  const anulacion = { motivo: "ENTRADA_POR_ERROR", detalle: "pulsera equivocada" };
  const prepago = (extra: Partial<AccountDoc> = {}) => ({ ...familia(extra), mode: "PREPAGO" as const, status: "POR_COBRAR" as const });
  const abierta = (extra: Partial<AccountDoc> = {}) => ({ ...familia(extra), mode: "CUENTA_ABIERTA" as const });

  test("su paquete deja de cobrarse, con su importe, y su estancia cuenta como cerrada", () => {
    const c = annulEntry(abierta(), "s1", anulacion)!;
    assert.deepEqual(c.closedSessionIds, ["s1"]);
    assert.deepEqual(c.lines.find((l) => l.id === "l1")?.anulacion, anulacion);
    assert.equal(c.lines.find((l) => l.id === "l1")?.amount.minor, "1000");
    assert.deepEqual(chargeableLines(c).map((l) => l.id), ["l2"]);
    assert.equal(c.status, "ABIERTA", "el hermano sigue dentro");
  });

  test("sin nadie dentro y nada que cobrar, la cuenta queda sin consumo", () => {
    const uno = annulEntry(prepago(), "s1", anulacion)!;
    assert.equal(uno.status, "POR_COBRAR", "en prepago, lo del hermano sigue por cobrar");
    const dos = annulEntry(uno, "s2", anulacion)!;
    assert.equal(dos.status, "SIN_CONSUMO");
  });

  test("si algo de la cuenta se cobró, queda cobrada; si se cobró lo del niño, no se anula", () => {
    const pagado = abierta({ lines: [linea("l1", { sessionId: "s1" }), linea("l2", { sessionId: "s2", paid: true })], closedSessionIds: ["s2"] });
    assert.equal(annulEntry(pagado, "s1", anulacion)!.status, "COBRADA");
    assert.equal(annulEntry(pagado, "s2", anulacion), null);
  });
});
