/**
 * Pruebas del pedido del mesero y su comanda — B6-2, ADR-022.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { comandaPideAtencion, estadoDeComanda, lineasDelPedido, type PlatoAhora } from "./index.ts";

const CARTA: Record<string, PlatoAhora> = {
  "p-teq": { name: "Tequeños", amountMinor: 450n, taxCode: "GENERAL" },
  "p-jugo": { name: "Jugo natural", amountMinor: 250n, taxCode: "EXENTA" },
};
const platoEn = (id: string) => CARTA[id] ?? null;

describe("lo que un pedido añade a la cuenta", () => {
  test("una unidad por línea de la cuenta, con el nombre, el precio y el IVA de ahora", () => {
    const r = lineasDelPedido(
      [
        { productId: "p-teq", cantidad: 2, nota: "sin salsa", precioMinor: 450n },
        { productId: "p-jugo", cantidad: 1, precioMinor: 250n },
      ],
      platoEn,
    );
    assert.ok(r.ok);
    assert.deepEqual(
      r.unidades.map((u) => [u.concepto, u.amountMinor, u.taxCode]),
      [
        ["Tequeños", 450n, "GENERAL"],
        ["Tequeños", 450n, "GENERAL"],
        ["Jugo natural", 250n, "EXENTA"],
      ],
    );
  });

  test("sin platos no hay pedido", () => {
    assert.deepEqual(lineasDelPedido([], platoEn), { ok: false, problema: "PEDIDO_VACIO" });
  });

  test("lo que ya no se vende no se pide, y se dice cuál", () => {
    const r = lineasDelPedido([{ productId: "p-teq", cantidad: 1, precioMinor: 450n }, { productId: "p-otro", cantidad: 1, precioMinor: 100n }], platoEn);
    assert.deepEqual(r, { ok: false, problema: "NO_SE_VENDE", indice: 1 });
  });

  test("si el precio cambió desde que la tablet lo enseñó, no se pide: se le vuelve a leer a la mesa", () => {
    const r = lineasDelPedido([{ productId: "p-teq", cantidad: 1, precioMinor: 400n }], platoEn);
    assert.deepEqual(r, { ok: false, problema: "PRECIO_DISTINTO", indice: 0, nombre: "Tequeños", ahoraMinor: 450n });
  });
});

describe("en qué quedó la comanda", () => {
  test("impresa si alguno de sus trabajos salió, aunque otro fallara", () => {
    assert.equal(estadoDeComanda([{ estado: "FALLIDO", creadoEn: 1 }, { estado: "CONFIRMADO", creadoEn: 2 }]), "IMPRESA");
    assert.equal(estadoDeComanda([{ estado: "CONFIRMADO", creadoEn: 1 }, { estado: "FALLIDO", creadoEn: 2 }]), "IMPRESA");
  });

  test("si no salió ninguno, manda el último: en cola, no salió o descartada", () => {
    assert.equal(estadoDeComanda([{ estado: "PENDIENTE", creadoEn: 1 }]), "EN_COLA");
    assert.equal(estadoDeComanda([{ estado: "ENVIADO", creadoEn: 1 }]), "EN_COLA");
    assert.equal(estadoDeComanda([{ estado: "FALLIDO", creadoEn: 1 }]), "NO_SALIO");
    assert.equal(estadoDeComanda([{ estado: "FALLIDO", creadoEn: 1 }, { estado: "PENDIENTE", creadoEn: 2 }]), "EN_COLA");
    assert.equal(estadoDeComanda([{ estado: "DESCARTADO", creadoEn: 1 }]), "DESCARTADA");
  });

  test("una comanda sin trabajo no salió, y lo que no salió pide atención", () => {
    assert.equal(estadoDeComanda([]), "NO_SALIO");
    assert.equal(comandaPideAtencion("NO_SALIO"), true);
    assert.equal(comandaPideAtencion("EN_COLA"), false);
    assert.equal(comandaPideAtencion("DESCARTADA"), false);
  });
});
