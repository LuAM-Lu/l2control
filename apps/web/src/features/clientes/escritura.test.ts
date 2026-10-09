import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  cursorTrasDigitos,
  digitosALaVista,
  digitosDelTelefono,
  documentoDe,
  partesDelDocumento,
  problemaDelDocumento,
  problemaDelTelefono,
  telefonoALaVista,
  telefonoDe,
} from "./escritura.ts";

/**
 * La cédula y el teléfono mientras se escriben (T-19, M-34): en el local se tecleaban de cualquier forma y un dígito de
 * menos no se veía hasta que el servidor lo rechazaba.
 */

describe("la cédula mientras se escribe (T-19)", () => {
  test("lo escrito o pegado se separa en su letra y sus dígitos, escrito como se escriba", () => {
    assert.deepEqual(partesDelDocumento("v-12.345.678"), { letra: "V", digitos: "12345678" });
    assert.deepEqual(partesDelDocumento("E 84.123.456"), { letra: "E", digitos: "84123456" });
    assert.deepEqual(partesDelDocumento("12345678", "E"), { letra: "E", digitos: "12345678" });
    assert.deepEqual(partesDelDocumento("J-40123456-7"), { letra: "J", digitos: "401234567" });
    // Una letra después de los dígitos no cambia la que hay; más de 9 dígitos no caben.
    assert.deepEqual(partesDelDocumento("1234v"), { letra: "V", digitos: "1234" });
    assert.equal(partesDelDocumento("1234567890123").digitos, "123456789");
  });

  test("se guarda en la forma de la casa y se lee con puntos", () => {
    assert.equal(documentoDe("V", "12345678"), "V-12345678");
    assert.equal(documentoDe("J", "401234567"), "J-40123456-7");
    assert.equal(documentoDe("V", ""), "");
    assert.equal(digitosALaVista("V", "12345678"), "12.345.678");
    assert.equal(digitosALaVista("V", "1234"), "1.234");
    assert.equal(digitosALaVista("J", "401234567"), "40.123.456-7");
  });

  test("dice qué le falta, con lo mismo que mira el servidor", () => {
    assert.equal(problemaDelDocumento(""), null);
    assert.equal(problemaDelDocumento("V-12345678"), null);
    assert.equal(problemaDelDocumento("V-123"), "Faltan dígitos: la cédula lleva de 5 a 9");
    assert.equal(problemaDelDocumento("J-4012345"), "El RIF lleva 9 dígitos: J-40123456-7");
    assert.equal(problemaDelDocumento("J-40123456-7"), null);
  });
});

describe("el teléfono mientras se escribe (T-19)", () => {
  test("se entiende con el +58, sin el cero o con espacios, y se queda en 11 dígitos", () => {
    assert.equal(digitosDelTelefono("+58 414 1234567"), "04141234567");
    assert.equal(digitosDelTelefono("584141234567"), "04141234567");
    assert.equal(digitosDelTelefono("414-1234567"), "04141234567");
    assert.equal(digitosDelTelefono("0414 123 45 67"), "04141234567");
    assert.equal(digitosDelTelefono("0414123456789"), "04141234567");
    assert.equal(digitosDelTelefono("4"), "04");
  });

  test("se guarda como 0414-1234567 y se lee como 0414-123.45.67", () => {
    assert.equal(telefonoDe("04141234567"), "0414-1234567");
    assert.equal(telefonoDe("0414"), "0414");
    assert.equal(telefonoALaVista("04141234567"), "0414-123.45.67");
    assert.equal(telefonoALaVista("041412"), "0414-12");
    assert.equal(telefonoALaVista("04141234"), "0414-123.4");
  });

  test("dice cuántos dígitos faltan, o que el código no es de aquí", () => {
    assert.equal(problemaDelTelefono(""), null);
    assert.equal(problemaDelTelefono("0414-1234567"), null);
    assert.equal(problemaDelTelefono("0414-12345"), "Faltan 2 dígitos: 0414-1234567");
    assert.equal(problemaDelTelefono("0414-123456"), "Falta un dígito: 0414-1234567");
    assert.match(problemaDelTelefono("0499-1234567")!, /no es de Venezuela/);
  });

  test("el cursor queda tras los mismos dígitos al reescribir", () => {
    assert.equal(cursorTrasDigitos("0414-123.45.67", 5), 6);
    assert.equal(cursorTrasDigitos("0414-123.45.67", 4), 4);
    assert.equal(cursorTrasDigitos("12.345.678", 3), 4);
    assert.equal(cursorTrasDigitos("12.345.678", 0), 0);
  });
});
