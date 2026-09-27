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

  test("anular devuelve las líneas a la cola y la cuenta se cobra de una vez", () => {
    const cobrada = markPaid({ ...mostrador([agua("x")]), split: { parts: 2, paid: 2 } });
    const c = revertPaid(cobrada, ["x"]);
    assert.equal(c.status, "POR_COBRAR");
    assert.equal(c.lines[0]!.paid, false);
    assert.equal(c.split, undefined);
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

  test("una línea pagada no se regala después; una sin pagar, sí", () => {
    const pagada = markPaid(familia({ closedSessionIds: ["s1", "s2"] }));
    const regalada = { ...pagada, lines: pagada.lines.map((l) => ({ ...l, cortesia: { motivo: "INVITACION" } })) };
    assert.equal(accountChangeProblem(pagada, regalada, productAt)?.problem, "CORTESIA_EN_PAGADA");
    const c = familia();
    assert.equal(accountChangeProblem(c, { ...c, lines: c.lines.map((l) => ({ ...l, cortesia: { motivo: "INVITACION" } })) }, productAt), null);
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
    assert.equal(accountChangeProblem(c, { ...c, sessionIds: ["s1", "s2", "s3"] }, productAt), null);
  });
});
