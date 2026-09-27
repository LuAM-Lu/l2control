import { test } from "node:test";
import assert from "node:assert/strict";
import { esClaveSensible, redactar, REDACTADO } from "./redaccion.ts";

test("reconoce los nombres sensibles por palabra, en cualquier estilo", () => {
  for (const clave of ["pin", "pinHash", "PIN", "nuevo_pin", "referencia", "referenciaPago", "txId",
    "telefono", "Teléfono", "telefonoOrigen", "contacto", "correo", "cedula", "rif", "documento",
    "password", "apiKey", "api_key", "authorization", "titular", "sessionToken",
    // Los datos de un pago tal como viajan desde B3-2 (DatosDePagoSchema) y los del local.
    "holder", "payerPhone", "payerDocument", "phone", "email", "document"]) {
    assert.ok(esClaveSensible(clave), clave);
  }
});

test("no confunde palabras que solo contienen una sensible", () => {
  // «tarifa» contiene «rif»; «spinner», «pin»; «opinion», «pin». Ninguna es un secreto.
  for (const clave of ["tarifa", "tarifario", "spinner", "opinion", "tenantId", "monto", "cuentaId", "nombre"]) {
    assert.ok(!esClaveSensible(clave), clave);
  }
});

test("no modifica el objeto original", () => {
  const original = { pin: "1970", anidado: { referencia: "123" } };
  redactar(original);
  assert.deepEqual(original, { pin: "1970", anidado: { referencia: "123" } });
});

test("sobrevive a ciclos y a objetos muy profundos", () => {
  const ciclo: Record<string, unknown> = { nombre: "a" };
  ciclo.yo = ciclo;
  assert.deepEqual(redactar(ciclo), { nombre: "a", yo: "[CICLO]" });

  let profundo: Record<string, unknown> = { pin: "1" };
  for (let i = 0; i < 20; i++) profundo = { mas: profundo };
  assert.ok(JSON.stringify(redactar(profundo)).includes("DEMASIADO PROFUNDO"));
});

test("un campo sensible vacío sigue vacío (se ve que no vino, no que se tapó)", () => {
  assert.deepEqual(redactar({ pin: null, referencia: undefined }), { pin: null, referencia: undefined });
});

test("un error conserva su tipo y su mensaje, sin secretos", () => {
  const e = new TypeError("fallo con token=abc en postgres://a:b@h/d");
  const r = redactar(e) as Record<string, unknown>;
  assert.equal(r.tipo, "TypeError");
  assert.ok(String(r.mensaje).includes(`postgres://a:${REDACTADO}@h/d`));
});

test("el identificador de un documento del libro no es un documento de identidad", () => {
  assert.equal(esClaveSensible("documentId"), false);
  assert.equal(esClaveSensible("document_id"), false);
  assert.deepEqual(redactar({ documentId: "01a0e11b", payerDocument: "V-12345678" }), { documentId: "01a0e11b", payerDocument: REDACTADO });
});
