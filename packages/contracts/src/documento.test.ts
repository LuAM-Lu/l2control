/**
 * Pruebas del cliente de la factura — DEC-23.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ClienteFacturaSchema } from "./documento.ts";

const valido = (d: unknown) => ClienteFacturaSchema.safeParse(d).success;

describe("cliente de la factura (DEC-23)", () => {
  test("consumidor final no pide nada", () => {
    assert.equal(valido({ kind: "CONSUMIDOR_FINAL" }), true);
  });

  test("identificado exige documento y nombre", () => {
    assert.equal(valido({ kind: "IDENTIFICADO", document: "V-18765432", name: "Carolina Méndez" }), true);
    assert.equal(valido({ kind: "IDENTIFICADO", document: "J-40123456-7", name: "Eventos Kids C.A." }), true);
    assert.equal(valido({ kind: "IDENTIFICADO", name: "Carolina Méndez" }), false);
    assert.equal(valido({ kind: "IDENTIFICADO", document: "V-18765432" }), false);
  });

  test("un documento sin letra o con formato raro no pasa", () => {
    assert.equal(valido({ kind: "IDENTIFICADO", document: "18765432", name: "Carolina Méndez" }), false);
    assert.equal(valido({ kind: "IDENTIFICADO", document: "X-18765432", name: "Carolina Méndez" }), false);
  });
});
