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
  type AccountDoc,
  type AccountLineDoc,
  type ProductAtNow,
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

  test("lo de mostrador sin pagar se quita; lo consumido, no", () => {
    const antes = { ...familia(), lines: [...familia().lines, agua("x")] };
    assert.equal(accountChangeProblem(antes, familia(), productAt), null);
    assert.equal(accountChangeProblem(familia(), { ...familia(), lines: [familia().lines[0]!] }, productAt)?.problem, "LINEA_QUITADA");
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
    // A una familia los niños los mete la entrada (B4-2); a una mesa se le vinculan desde el salón.
    assert.equal(accountChangeProblem(c, { ...c, sessionIds: ["s1", "s2", "s3"] }, productAt)?.problem, "ESTANCIAS_DESDE_LA_PANTALLA");
    const mesa: AccountDoc = { kind: "MESA", status: "ABIERTA", tableId: "m1", sessionIds: [], closedSessionIds: [], lines: [] };
    assert.equal(accountChangeProblem(mesa, { ...mesa, sessionIds: ["s1"] }, productAt), null);
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
