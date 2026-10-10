/**
 * Pruebas del catálogo de medios de pago — F4-02, F4-04, §9.9 (B3-2).
 *
 * Lo que fijan: un local nace con los siete medios de §5.5 (más el consumo del personal) y solo cobra de entrada con los que no
 * piden datos del local; solo el efectivo de la gaveta da vuelto y no pide referencia; y la caja
 * no ofrece un medio mientras falten los datos que el cliente necesita para pagar.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LEDGER_METHODS, methodDefinitionProblem, offerProblem, offeredMethods, type CollectionReadiness } from "./medios.ts";

const SIN_DATOS: CollectionReadiness = { pagoMovil: false, zelle: false, terminals: 0 };
const COMPLETO: CollectionReadiness = { pagoMovil: true, zelle: true, terminals: 2 };

describe("el catálogo con el que nace un local (§5.5)", () => {
  test("los siete medios y el consumo del personal, sin códigos repetidos, y todos con sentido", () => {
    assert.deepEqual(
      DEFAULT_LEDGER_METHODS.map((m) => m.code),
      ["EFECTIVO_USD", "EFECTIVO_VES", "PAGO_MOVIL", "PDV_DEBITO", "PDV_CREDITO", "ZELLE", "USDT", "CONSUMO_PERSONAL"],
    );
    for (const m of DEFAULT_LEDGER_METHODS) assert.equal(methodDefinitionProblem(m), null, m.code);
  });

  test("recién creado, cobra en efectivo y en USDT: lo demás espera los datos del local", () => {
    assert.deepEqual(offeredMethods(DEFAULT_LEDGER_METHODS, SIN_DATOS).map((m) => m.code), ["EFECTIVO_USD", "EFECTIVO_VES", "USDT"]);
  });

  test("el IGTF lo llevan las divisas y la cripto, no los bolívares", () => {
    const conIgtf = DEFAULT_LEDGER_METHODS.filter((m) => m.triggersIgtf).map((m) => m.code);
    assert.deepEqual(conIgtf, ["EFECTIVO_USD", "ZELLE", "USDT"]);
  });
});

describe("un medio nuevo (F4-02)", () => {
  test("da vuelto solo lo que está en la gaveta: dólares o bolívares", () => {
    assert.equal(methodDefinitionProblem({ currency: "USDT", givesChange: true, dataKind: null }), "VUELTO_FUERA_DE_LA_GAVETA");
    assert.equal(methodDefinitionProblem({ currency: "VES", givesChange: true, dataKind: null }), null);
  });

  test("el efectivo no pide referencia: un billete no trae número de aprobación", () => {
    assert.equal(methodDefinitionProblem({ currency: "USD", givesChange: true, dataKind: "ZELLE" }), "EFECTIVO_SIN_REFERENCIA");
  });

  test("un medio que no es efectivo puede pedir datos o no pedirlos", () => {
    assert.equal(methodDefinitionProblem({ currency: "VES", givesChange: false, dataKind: "PUNTO" }), null);
    assert.equal(methodDefinitionProblem({ currency: "VES", givesChange: false, dataKind: null }), null);
  });
});

describe("qué ofrece la caja (F4-04)", () => {
  const movil = DEFAULT_LEDGER_METHODS.find((m) => m.code === "PAGO_MOVIL")!;

  test("un medio apagado no se ofrece, aunque tenga todo", () => {
    assert.equal(offerProblem(movil, COMPLETO), "APAGADO");
  });

  test("encendido pero sin los datos del local, tampoco: el cliente pagaría a ninguna parte", () => {
    const encendido = { ...movil, active: true };
    assert.equal(offerProblem(encendido, SIN_DATOS), "FALTAN_DATOS_DEL_LOCAL");
    assert.equal(offerProblem(encendido, { ...SIN_DATOS, pagoMovil: true }), null);
    const punto = { active: true, dataKind: "PUNTO" } as const;
    assert.equal(offerProblem(punto, { ...COMPLETO, terminals: 0 }), "FALTAN_DATOS_DEL_LOCAL");
  });

  test("el USDT no pide datos del local: el TxID lo trae quien paga", () => {
    assert.equal(offerProblem({ active: true, dataKind: "USDT" }, SIN_DATOS), null);
  });

  test("con todo configurado y encendido, se ofrecen los siete en el orden del catálogo", () => {
    const todos = DEFAULT_LEDGER_METHODS.map((m) => ({ ...m, active: true }));
    assert.equal(offeredMethods(todos, COMPLETO).length, 7);
  });

  test("el consumo del personal no se ofrece entre los medios: no es dinero y tiene su camino (B3-17)", () => {
    const consumo = DEFAULT_LEDGER_METHODS.find((m) => m.code === "CONSUMO_PERSONAL")!;
    assert.equal(consumo.active, true);
    assert.equal(consumo.givesChange || consumo.triggersIgtf, false);
    assert.equal(offeredMethods([consumo], COMPLETO).length, 0);
  });
});
