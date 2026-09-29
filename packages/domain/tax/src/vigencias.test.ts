/**
 * Pruebas de las vigencias programadas — B2-2, F3-06.
 *
 * Lo que se guarda es «desde tal instante, tal alícuota»; el fin sale de la siguiente. Estas
 * pruebas fijan las reglas que hacen de eso un calendario sin ambigüedad, y la que importa más:
 * programar un cambio no altera lo que ya se calculó.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { fromMajor, toMajor } from "@l2/domain-money";
import {
  NoIgtfRuleError,
  basisPointsFromPercent,
  computeDocument,
  igtfAt,
  ivaRulesOf,
  missingTaxesAt,
  percentFromBasisPoints,
  scheduleProblem,
  taxTimeline,
  type ScheduledTaxRate,
} from "./index.ts";

const DIA = 86_400_000;
const INICIO = Date.parse("2026-09-01T04:00:00.000Z"); // 1 sept, 00:00 en Caracas
const HOY = Date.parse("2026-09-27T14:00:00.000Z");
const MES_QUE_VIENE = Date.parse("2026-10-01T04:00:00.000Z");

let n = 0;
const prog = (p: Partial<ScheduledTaxRate> & Pick<ScheduledTaxRate, "kind" | "basisPoints" | "effectiveFrom">): ScheduledTaxRate => ({
  id: `p${++n}`,
  code: p.kind === "IVA" ? "GENERAL" : null,
  scheduledAt: p.effectiveFrom,
  ...p,
});

const BASE: ScheduledTaxRate[] = [
  prog({ kind: "IVA", code: "GENERAL", basisPoints: 1600, effectiveFrom: INICIO }),
  prog({ kind: "IVA", code: "REDUCIDA", basisPoints: 800, effectiveFrom: INICIO }),
  prog({ kind: "IGTF", basisPoints: 300, effectiveFrom: INICIO }),
];

const linea = (precio: string) => ({
  id: "l1",
  description: "Entrada",
  unitPrice: fromMajor(precio, "USD"),
  quantity: 1n,
  taxCode: "GENERAL" as const,
});

describe("calendario de cada impuesto", () => {
  test("la vigencia abierta se cierra el día que empieza la siguiente", () => {
    const t = taxTimeline([...BASE, prog({ kind: "IVA", code: "GENERAL", basisPoints: 1500, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY })]);
    const general = t.filter((p) => p.kind === "IVA" && p.code === "GENERAL");
    assert.deepEqual(
      general.map((p) => [p.basisPoints, p.effectiveFrom, p.effectiveTo]),
      [
        [1600, INICIO, MES_QUE_VIENE],
        [1500, MES_QUE_VIENE, null],
      ],
    );
    // El reducido y el IGTF no se enteran: cada impuesto tiene su calendario.
    assert.equal(t.find((p) => p.code === "REDUCIDA")!.effectiveTo, null);
    assert.equal(t.find((p) => p.kind === "IGTF")!.effectiveTo, null);
  });

  test("dos programaciones con el mismo comienzo: manda la última (así se corrige una futura)", () => {
    const t = taxTimeline([
      ...BASE,
      prog({ kind: "IVA", basisPoints: 1500, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY }),
      prog({ kind: "IVA", basisPoints: 1400, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY + 60_000 }),
    ]);
    const futura = t.filter((p) => p.kind === "IVA" && p.code === "GENERAL" && p.effectiveFrom === MES_QUE_VIENE);
    assert.equal(futura.length, 1);
    assert.equal(futura[0]!.basisPoints, 1400);
  });

  test("una programación que no cambia la alícuota no abre tramo: programar la vigente cancela un cambio", () => {
    const t = taxTimeline([
      ...BASE,
      prog({ kind: "IVA", basisPoints: 1500, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY }),
      prog({ kind: "IVA", basisPoints: 1600, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY + 60_000 }),
    ]);
    assert.deepEqual(
      t.filter((p) => p.kind === "IVA" && p.code === "GENERAL").map((p) => [p.basisPoints, p.effectiveFrom, p.effectiveTo]),
      [[1600, INICIO, null]],
    );
  });

  test("el orden en que llegan las filas no cambia el calendario", () => {
    const filas = [...BASE, prog({ kind: "IGTF", basisPoints: 200, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY })];
    assert.deepEqual(taxTimeline(filas), taxTimeline([...filas].reverse()));
  });
});

describe("lo que se cobra (F3-06)", () => {
  test("programar un cambio para el mes que viene no altera el ticket de hoy; ese día, sí", () => {
    const t = taxTimeline([...BASE, prog({ kind: "IVA", basisPoints: 1500, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY })]);
    const iva = (at: number) =>
      toMajor(computeDocument({ lines: [linea("10.00")], rules: ivaRulesOf(t), at, currency: "USD" }).taxTotal);
    assert.equal(iva(HOY), "1.60");
    assert.equal(iva(MES_QUE_VIENE - 1), "1.60");
    assert.equal(iva(MES_QUE_VIENE), "1.50");
  });

  test("lo exento vale cero siempre, sin programarlo", () => {
    const reglas = ivaRulesOf(taxTimeline(BASE));
    const exenta = reglas.find((r) => r.code === "EXENTA")!;
    assert.deepEqual([exenta.basisPoints, exenta.effectiveFrom, exenta.effectiveTo], [0, 0, null]);
  });

  test("el IGTF del instante; sin IGTF vigente se lanza (fail-closed)", () => {
    const t = taxTimeline([...BASE, prog({ kind: "IGTF", basisPoints: 200, effectiveFrom: MES_QUE_VIENE, scheduledAt: HOY })]);
    assert.equal(igtfAt(t, HOY), 300);
    assert.equal(igtfAt(t, MES_QUE_VIENE + DIA), 200);
    assert.throws(() => igtfAt(t, INICIO - 1), NoIgtfRuleError);
  });

  test("dice qué falta para poder cobrar", () => {
    assert.deepEqual(missingTaxesAt(taxTimeline(BASE), HOY), []);
    assert.deepEqual(missingTaxesAt(taxTimeline(BASE), INICIO - 1), ["IVA general", "IGTF"]);
    assert.deepEqual(missingTaxesAt(taxTimeline(BASE.slice(0, 2)), HOY), ["IGTF"]);
  });

  test("sin IVA reducido se cobra: el local no lo usa (v0.30.1)", () => {
    const sinReducido = BASE.filter((p) => p.code !== "REDUCIDA");
    assert.deepEqual(missingTaxesAt(taxTimeline(sinReducido), HOY), []);
  });
});

describe("qué se puede programar", () => {
  test("nunca hacia atrás; desde este mismo instante, sí", () => {
    assert.equal(scheduleProblem({ kind: "IVA", code: "GENERAL", basisPoints: 1500, effectiveFrom: HOY - 1 }, HOY), "EN_EL_PASADO");
    assert.equal(scheduleProblem({ kind: "IVA", code: "GENERAL", basisPoints: 1500, effectiveFrom: HOY }, HOY), null);
  });

  test("el IVA lleva trato y el IGTF no", () => {
    assert.equal(scheduleProblem({ kind: "IVA", code: null, basisPoints: 1500, effectiveFrom: HOY }, HOY), "SIN_CODIGO");
    assert.equal(scheduleProblem({ kind: "IGTF", code: "GENERAL", basisPoints: 300, effectiveFrom: HOY }, HOY), "CODIGO_EN_IGTF");
  });

  test("alícuotas fuera de rango: negativas, decimales, sobre el 100 %, o un IGTF del 100 %", () => {
    for (const basisPoints of [-1, 1.5, 10_001]) {
      assert.equal(scheduleProblem({ kind: "IVA", code: "GENERAL", basisPoints, effectiveFrom: HOY }, HOY), "FUERA_DE_RANGO");
    }
    assert.equal(scheduleProblem({ kind: "IGTF", code: null, basisPoints: 10_000, effectiveFrom: HOY }, HOY), "FUERA_DE_RANGO");
  });
});

describe("porcentajes como los teclea una persona", () => {
  test("de texto a puntos básicos sin coma flotante", () => {
    assert.equal(basisPointsFromPercent("16"), 1600);
    assert.equal(basisPointsFromPercent("16,5"), 1650);
    assert.equal(basisPointsFromPercent("8.25"), 825);
    assert.equal(basisPointsFromPercent(" 3 % "), 300);
    assert.equal(basisPointsFromPercent("0"), 0);
    assert.equal(basisPointsFromPercent("100"), 10_000);
  });

  test("lo que no es un porcentaje se rechaza", () => {
    for (const t of ["", "abc", "16,555", "-3", "101", "1.600", "16,"]) assert.equal(basisPointsFromPercent(t), null, t);
  });

  test("de puntos básicos a texto", () => {
    assert.deepEqual([1600, 1650, 825, 300, 0, 5].map(percentFromBasisPoints), ["16", "16,5", "8,25", "3", "0", "0,05"]);
  });
});
