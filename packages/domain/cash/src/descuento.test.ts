/**
 * Pruebas de los descuentos — V-9, D-DESC (B3-6).
 *
 * Lo que fijan: qué líneas toca cada alcance; cuánto descuenta, igual que el motor de impuestos;
 * qué se ofrece y en qué orden (el mayor primero; el VIP solo a su familia); cuándo se puede poner
 * y cobrar con él (toda la cuenta por su medio, la regla vigente, el tope de supervisión); que el
 * cobro lo consume y que un «guardar» no lo pone ni lo quita.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toMajor } from "@l2/domain-money";
import { computeDocument, type TaxRule } from "@l2/domain-tax";
import {
  applyDiscountProblem,
  discountAmount,
  discountAtChargeProblem,
  discountCandidates,
  documentDiscountsOf,
  exceedsSupervisionCap,
  needsAdministration,
  ruleInForce,
  scopeLineIds,
  withDiscount,
  chargeableSubtotal,
  type AppliedDiscount,
  type DiscountRule,
} from "./descuento.ts";
import { accountChangeProblem, documentLinesOf, markPaid, type AccountDoc, type AccountLineDoc } from "./cuenta.ts";

const usd = (minor: string) => ({ minor, currency: "USD" });
const linea = (id: string, extra: Partial<AccountLineDoc> = {}): AccountLineDoc => ({
  id,
  concept: "Paquete 1 hora",
  kind: "PAQUETE",
  amount: usd("1000"),
  paid: false,
  ...extra,
});
const producto = (id: string, productId: string, minor: string) =>
  linea(id, { concept: productId, kind: "RESTAURANTE", amount: usd(minor), productId, taxCode: "GENERAL" });

const CATEGORIAS: Record<string, string> = { "p-agua": "Bebidas", "p-galleta": "Snacks" };
const categoria = (id: string) => CATEGORIAS[id] ?? null;

/** Paquete $10 + excedente $2 + agua $1,20 + galleta $0,80 = $14,00. */
const cuenta = (extra: Partial<AccountDoc> = {}): AccountDoc => ({
  kind: "FAMILIA",
  status: "POR_COBRAR",
  sessionIds: ["s1"],
  closedSessionIds: ["s1"],
  lines: [
    linea("paq", { sessionId: "s1" }),
    linea("exc", { kind: "EXCEDENTE", amount: usd("200"), sessionId: "s1" }),
    producto("agua", "p-agua", "120"),
    producto("galleta", "p-galleta", "80"),
  ],
  ...extra,
});

const regla = (id: string, extra: Partial<DiscountRule> = {}): DiscountRule => ({
  id,
  nombre: id,
  tipo: "MANUAL",
  valor: { tipo: "PORCENTAJE", basisPoints: 1000 },
  alcance: { tipo: "CUENTA" },
  medio: null,
  desde: "2026-10-01",
  hasta: null,
  retirada: null,
  ...extra,
});

const aplicado = (extra: Partial<AppliedDiscount> = {}): AppliedDiscount => ({
  origen: "MANUAL",
  reglaId: "r1",
  valor: { tipo: "PORCENTAJE", basisPoints: 1000 },
  alcance: { tipo: "CUENTA" },
  medio: null,
  autorizadoPor: { role: "SUPERVISOR" },
  ...extra,
});

const REGLAS: TaxRule[] = [
  { code: "GENERAL", basisPoints: 1600, effectiveFrom: 0, effectiveTo: null },
  { code: "EXENTA", basisPoints: 0, effectiveFrom: 0, effectiveTo: null },
];

describe("el alcance", () => {
  test("la cuenta entera, el parque, el restaurante o unas categorías (sin distinguir mayúsculas)", () => {
    const c = cuenta();
    assert.deepEqual(scopeLineIds({ tipo: "CUENTA" }, c, categoria), ["paq", "exc", "agua", "galleta"]);
    assert.deepEqual(scopeLineIds({ tipo: "PARQUE" }, c, categoria), ["paq", "exc"]);
    assert.deepEqual(scopeLineIds({ tipo: "RESTAURANTE" }, c, categoria), ["agua", "galleta"]);
    assert.deepEqual(scopeLineIds({ tipo: "CATEGORIAS", categorias: [" bebidas "] }, c, categoria), ["agua"]);
  });

  test("solo lo que se cobra ahora: ni lo pagado, ni lo movido, ni lo regalado", () => {
    const c = cuenta({
      lines: [linea("paq", { paid: true }), linea("exc", { kind: "EXCEDENTE", movedTo: "otra" }), producto("agua", "p-agua", "120")],
    });
    assert.deepEqual(scopeLineIds({ tipo: "CUENTA" }, c, categoria), ["agua"]);
  });
});

describe("cuánto descuenta", () => {
  test("el porcentaje sobre su alcance; un monto, sin pasar de lo que suma", () => {
    const c = cuenta();
    assert.equal(toMajor(discountAmount(aplicado(), c, categoria)), "1.40");
    assert.equal(toMajor(discountAmount(aplicado({ alcance: { tipo: "PARQUE" }, valor: { tipo: "PORCENTAJE", basisPoints: 2500 } }), c, categoria)), "3.00");
    assert.equal(toMajor(discountAmount(aplicado({ alcance: { tipo: "RESTAURANTE" }, valor: { tipo: "MONTO", monto: usd("500") } }), c, categoria)), "2.00");
    assert.equal(toMajor(discountAmount(aplicado({ alcance: { tipo: "CATEGORIAS", categorias: ["Juguetes"] } }), c, categoria)), "0.00");
  });

  test("coincide con lo que descuenta el motor de impuestos, antes del IVA", () => {
    for (const d of [
      aplicado(),
      aplicado({ alcance: { tipo: "PARQUE" }, valor: { tipo: "PORCENTAJE", basisPoints: 1250 } }),
      aplicado({ alcance: { tipo: "CATEGORIAS", categorias: ["Bebidas", "Snacks"] }, valor: { tipo: "MONTO", monto: usd("150") } }),
    ]) {
      const c = { ...cuenta(), descuento: d };
      const doc = computeDocument({ lines: documentLinesOf(c), discounts: documentDiscountsOf(c, categoria), rules: REGLAS, at: 0, currency: "USD" });
      assert.equal(doc.discountTotal.amount, discountAmount(d, c, categoria).amount);
    }
    // 10 % de $14,00 = $1,40; base 12,60, IVA 2,02 → 14,62.
    const c = { ...cuenta(), descuento: aplicado() };
    const doc = computeDocument({ lines: documentLinesOf(c), discounts: documentDiscountsOf(c, categoria), rules: REGLAS, at: 0, currency: "USD" });
    assert.equal(toMajor(doc.total), "14.62");
  });

  test("sin descuento, o con un alcance vacío, el motor no recibe ninguno", () => {
    assert.deepEqual(documentDiscountsOf({ lines: cuenta().lines }, categoria), []);
    assert.deepEqual(documentDiscountsOf({ ...cuenta(), descuento: aplicado({ alcance: { tipo: "CATEGORIAS", categorias: ["Juguetes"] } }) }, categoria), []);
  });
});

describe("qué ofrece la caja (D-DESC)", () => {
  test("los que rigen hoy, el mayor primero; el VIP solo a la familia marcada con él", () => {
    const reglas = [
      regla("manual-10"),
      regla("zelle-15", { tipo: "MEDIO", medio: "ZELLE", valor: { tipo: "PORCENTAJE", basisPoints: 1500 } }),
      regla("vip-20", { tipo: "VIP", valor: { tipo: "PORCENTAJE", basisPoints: 2000 } }),
      regla("vieja", { hasta: "2026-09-30" }),
      regla("futura", { desde: "2026-10-02" }),
      regla("retirada", { retirada: { at: "x" } }),
      regla("juguetes", { alcance: { tipo: "CATEGORIAS", categorias: ["Juguetes"] } }),
    ];
    const sinVip = discountCandidates({ rules: reglas, day: "2026-10-01", vipRuleId: null, account: cuenta(), categoryOf: categoria });
    assert.deepEqual(sinVip.map((c) => c.regla.id), ["zelle-15", "manual-10"]);
    const conVip = discountCandidates({ rules: reglas, day: "2026-10-01", vipRuleId: "vip-20", account: cuenta(), categoryOf: categoria });
    assert.deepEqual(conVip.map((c) => [c.regla.id, toMajor(c.importe)]), [["vip-20", "2.80"], ["zelle-15", "2.10"], ["manual-10", "1.40"]]);
  });

  test("la vigencia va por días del local, los dos incluidos", () => {
    const r = regla("octubre", { desde: "2026-10-01", hasta: "2026-10-31" });
    assert.equal(ruleInForce(r, "2026-09-30"), false);
    assert.equal(ruleInForce(r, "2026-10-01"), true);
    assert.equal(ruleInForce(r, "2026-10-31"), true);
    assert.equal(ruleInForce(r, "2026-11-01"), false);
  });
});

describe("aplicarlo y cobrar con él", () => {
  test("solo a una cuenta en la cola, sin dividir y que descuente algo", () => {
    assert.equal(applyDiscountProblem(cuenta(), aplicado(), categoria), null);
    assert.equal(applyDiscountProblem(cuenta({ status: "ABIERTA" }), aplicado(), categoria), "NO_POR_COBRAR");
    assert.equal(applyDiscountProblem(cuenta({ split: { parts: 2, paid: 0 } }), aplicado(), categoria), "CUENTA_DIVIDIDA");
    assert.equal(applyDiscountProblem(cuenta(), aplicado({ alcance: { tipo: "CATEGORIAS", categorias: ["Juguetes"] } }), categoria), "NADA_QUE_DESCONTAR");
  });

  test("el tope de supervisión es exacto, sin decimales; y lo de administración lo autoriza administración", () => {
    const subtotal = chargeableSubtotal(cuenta());
    assert.equal(toMajor(subtotal), "14.00");
    // 20 % de $14,00 = $2,80: hasta ahí, supervisión.
    assert.equal(exceedsSupervisionCap({ amount: 280n, currency: "USD" }, subtotal, 2000), false);
    assert.equal(exceedsSupervisionCap({ amount: 281n, currency: "USD" }, subtotal, 2000), true);
    assert.equal(needsAdministration("MANUAL", { amount: 281n, currency: "USD" }, subtotal, 2000), true);
    assert.equal(needsAdministration("MANUAL", { amount: 280n, currency: "USD" }, subtotal, 2000), false);
    assert.equal(needsAdministration("ADMIN", { amount: 1n, currency: "USD" }, subtotal, 2000), true);
    // El de una regla de medio o VIP no tiene tope: lo fijó administración al crearla.
    assert.equal(needsAdministration("MEDIO", { amount: 1400n, currency: "USD" }, subtotal, 2000), false);
  });

  test("el de medio exige que TODA la cuenta vaya por ese medio", () => {
    const base = { ruleInForce: true, importe: { amount: 210n, currency: "USD" as const }, subtotal: chargeableSubtotal(cuenta()), topeBps: 2000 };
    const zelle = aplicado({ origen: "MEDIO", medio: "ZELLE" });
    assert.equal(discountAtChargeProblem({ ...base, descuento: zelle, methodCodes: ["ZELLE", "ZELLE"] }), null);
    assert.equal(discountAtChargeProblem({ ...base, descuento: zelle, methodCodes: ["ZELLE", "EFECTIVO_USD"] }), "MEDIO_DISTINTO");
    assert.equal(discountAtChargeProblem({ ...base, descuento: zelle, methodCodes: [] }), "MEDIO_DISTINTO");
    assert.equal(discountAtChargeProblem({ ...base, descuento: zelle, methodCodes: ["ZELLE"], ruleInForce: false }), "REGLA_NO_VIGENTE");
  });

  test("el manual de supervisión no pasa del tope al cobrar; el de administración, sí puede", () => {
    const subtotal = { amount: 500n, currency: "USD" as const };
    const importe = { amount: 140n, currency: "USD" as const };
    const base = { methodCodes: ["EFECTIVO_USD"], ruleInForce: true, importe, subtotal, topeBps: 2000 };
    assert.equal(discountAtChargeProblem({ ...base, descuento: aplicado() }), "PASA_DEL_TOPE");
    assert.equal(discountAtChargeProblem({ ...base, descuento: aplicado({ autorizadoPor: { role: "ADMIN" } }) }), null);
    assert.equal(discountAtChargeProblem({ ...base, descuento: aplicado({ origen: "ADMIN", reglaId: null, autorizadoPor: { role: "ADMIN" } }) }), null);
  });

  test("el cobro lo consume: lo que se deba después no lo arrastra", () => {
    const c = { ...cuenta(), descuento: aplicado() };
    const cobrada = markPaid(c);
    assert.equal("descuento" in cobrada, false);
    assert.equal(cobrada.status, "COBRADA");
  });

  test("uno por cuenta: el nuevo sustituye al anterior, y se quita sin dejar rastro en la cuenta", () => {
    const c = withDiscount(cuenta(), aplicado());
    const otro = withDiscount(c, aplicado({ reglaId: "r2" }));
    assert.equal((otro.descuento as AppliedDiscount).reglaId, "r2");
    assert.equal("descuento" in withDiscount(otro, null), false);
  });

  test("un «guardar» de la pantalla no pone, quita ni cambia el descuento; y no divide una cuenta con descuento", () => {
    const sin = cuenta();
    const con = { ...cuenta(), descuento: aplicado() };
    assert.equal(accountChangeProblem(sin, con, () => null)?.problem, "DESCUENTO_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(con, sin, () => null)?.problem, "DESCUENTO_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(con, { ...con, descuento: aplicado({ reglaId: "otra" }) }, () => null)?.problem, "DESCUENTO_DESDE_LA_PANTALLA");
    assert.equal(accountChangeProblem(con, { ...con, split: { parts: 2, paid: 0 } }, () => null)?.problem, "DIVISION_CON_DESCUENTO");
    assert.equal(accountChangeProblem(con, { ...con }, () => null), null);
  });
});
