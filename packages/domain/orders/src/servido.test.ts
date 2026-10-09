/** Servido por plato (B6-11): la última marca de cada plato manda, y lo marcado por pedido antes cuenta como todo. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DESHACER_SERVIDO_MS, problemaParaDeshacer, servidoDelPedido, servidoPorPlato, type MarcaDePlato } from "./index.ts";
import { resumenDeEspera, atencionDeCuentas } from "./index.ts";

const MIN = 60_000;
const marca = (linea: number, tipo: MarcaDePlato["tipo"], en: number): MarcaDePlato => ({ linea, tipo, en, por: "Pedro" });

describe("servido por plato", () => {
  test("cada plato con su última marca; el pedido, cuando lo está el último", () => {
    const platos = servidoPorPlato(3, [marca(0, "SERVIDO", 10 * MIN), marca(2, "SERVIDO", 12 * MIN)], null);
    assert.deepEqual(
      platos.map((p) => p?.en ?? null),
      [10 * MIN, null, 12 * MIN],
    );
    assert.equal(servidoDelPedido(platos), null);
    const todos = servidoPorPlato(3, [marca(0, "SERVIDO", 10 * MIN), marca(2, "SERVIDO", 12 * MIN), marca(1, "SERVIDO", 11 * MIN)], null);
    assert.equal(servidoDelPedido(todos)?.en, 12 * MIN, "a la hora del último");
  });

  test("deshacer deja el plato sin servir, y el pedido también", () => {
    const platos = servidoPorPlato(2, [marca(0, "SERVIDO", 10 * MIN), marca(1, "SERVIDO", 11 * MIN), marca(1, "DESHECHO", 12 * MIN)], null);
    assert.equal(platos[1], null);
    assert.equal(servidoDelPedido(platos), null);
  });

  test("lo marcado por pedido antes de B6-11 cuenta como todo servido, y una marca nueva va encima", () => {
    const antes = { en: 20 * MIN, por: "Ana" };
    assert.deepEqual(servidoPorPlato(2, [], antes), [antes, antes]);
    const deshecho = servidoPorPlato(2, [marca(0, "DESHECHO", 21 * MIN)], antes);
    assert.deepEqual(deshecho, [null, antes]);
  });

  test("se deshace en el momento, no después", () => {
    const plato = { en: 10 * MIN, por: "Pedro" };
    assert.equal(problemaParaDeshacer(plato, 10 * MIN + DESHACER_SERVIDO_MS), null);
    assert.equal(problemaParaDeshacer(plato, 10 * MIN + DESHACER_SERVIDO_MS + 1), "YA_NO");
    assert.equal(problemaParaDeshacer(null, 0), "NO_SERVIDO");
  });

  test("la atención mide la espera por plato: espera mientras falte uno, y el resumen cuenta cada plato", () => {
    const pedido = {
      cuentaId: "c1",
      enviadoEn: 0,
      servidoEn: null,
      anulado: false,
      platos: [
        { servidoEn: 10 * MIN, anulado: false },
        { servidoEn: null, anulado: false },
        { servidoEn: null, anulado: true },
      ],
    };
    const [a] = atencionDeCuentas([{ id: "c1", abiertaEn: 0 }], [pedido], 30 * MIN, { sinPedirMin: 10, esperaMin: 20 });
    assert.equal(a!.esperandoMin, 30);
    assert.equal(a!.alerta, "ESPERANDO");
    assert.deepEqual(resumenDeEspera([pedido]), { servidos: 1, mediaMin: 10, maximaMin: 10, sinServir: 1 });
    // Sin platos (un pedido leído sin ellos), cuenta como uno.
    assert.deepEqual(resumenDeEspera([{ ...pedido, platos: undefined, servidoEn: 5 * MIN }]), { servidos: 1, mediaMin: 5, maximaMin: 5, sinServir: 0 });
  });
});
