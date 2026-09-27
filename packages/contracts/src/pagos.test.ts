/**
 * Pruebas de los datos por medio de pago — F4-04.
 * Se prueba lo que impide: pagos que no se podrían conciliar.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DatosDePagoSchema, claveDeReferencia, enmascararDatos } from "./pagos.ts";

const valido = (d: unknown) => DatosDePagoSchema.safeParse(d).success;

describe("datos por medio de pago (F4-04)", () => {
  test("un Pago Móvil exige referencia numérica y banco de origen", () => {
    assert.equal(valido({ kind: "PAGO_MOVIL", reference: "004512", bankCode: "0134" }), true);
    assert.equal(valido({ kind: "PAGO_MOVIL", bankCode: "0134" }), false);
    assert.equal(valido({ kind: "PAGO_MOVIL", reference: "45A1", bankCode: "0134" }), false);
    assert.equal(valido({ kind: "PAGO_MOVIL", reference: "004512" }), false);
  });

  test("los datos del pagador son opcionales pero, si están, tienen formato", () => {
    const base = { kind: "PAGO_MOVIL", reference: "004512", bankCode: "0134" };
    assert.equal(valido({ ...base, payerPhone: "0414-1234567", payerDocument: "V-12345678" }), true);
    assert.equal(valido({ ...base, payerPhone: "1234" }), false);
    assert.equal(valido({ ...base, payerDocument: "12345678" }), false);
  });

  test("un USDT exige TxID y red", () => {
    assert.equal(valido({ kind: "USDT", txId: "a1b2c3d4e5f6", network: "TRC20" }), true);
    assert.equal(valido({ kind: "USDT", txId: "a1b2", network: "TRC20" }), false);
    assert.equal(valido({ kind: "USDT", txId: "a1b2c3d4e5f6" }), false);
  });

  test("un punto de venta exige terminal y referencia", () => {
    assert.equal(valido({ kind: "PUNTO", terminalId: "pdv-1", reference: "123456" }), true);
    assert.equal(valido({ kind: "PUNTO", reference: "123456" }), false);
  });

  test("Zelle exige el titular; un tipo desconocido no pasa", () => {
    assert.equal(valido({ kind: "ZELLE", holder: "ana@correo.com" }), true);
    assert.equal(valido({ kind: "ZELLE", holder: "" }), false);
    assert.equal(valido({ kind: "CHEQUE", numero: "1" }), false);
  });
});

describe("la referencia fuera del cobro (§7.6, B3-2)", () => {
  const casos = [
    { kind: "PAGO_MOVIL", reference: "0987654321", bankCode: "0102" },
    { kind: "PUNTO", terminalId: "01a0e11b-879b-75dd-bb18-70f1c287e118", reference: "55667788" },
    { kind: "USDT", txId: "a1b2c3d4e5f6a7b8c9d0", network: "TRC20" },
    { kind: "ZELLE", holder: "maria.perez@correo.com", confirmation: "ZX99887766" },
  ] as const;

  test("enmascarada no enseña la referencia entera ni el titular", () => {
    for (const d of casos) {
      const visto = enmascararDatos(DatosDePagoSchema.parse(d));
      for (const secreto of ["0987654321", "55667788", "a1b2c3d4e5f6a7b8c9d0", "maria.perez@correo.com", "ZX99887766"]) {
        assert.ok(!visto.includes(secreto), `${d.kind}: ${visto}`);
      }
    }
  });

  test("la clave reconoce el mismo pago; un Zelle sin confirmación no tiene clave", () => {
    const [movil] = casos;
    assert.equal(claveDeReferencia(DatosDePagoSchema.parse(movil)), claveDeReferencia(DatosDePagoSchema.parse({ ...movil })));
    assert.notEqual(claveDeReferencia(DatosDePagoSchema.parse(movil)), claveDeReferencia(DatosDePagoSchema.parse({ ...movil, bankCode: "0134" })));
    assert.equal(claveDeReferencia(DatosDePagoSchema.parse({ kind: "ZELLE", holder: "Maria Perez" })), null);
  });
});
