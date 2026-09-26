import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { coincide, componer, huella, leerCredencial, nuevoSecreto } from "./credenciales.ts";
import { crearCifrador } from "./cifrado.ts";

test("un secreto son 256 bits aleatorios y nunca se repite", () => {
  const vistos = new Set(Array.from({ length: 1000 }, nuevoSecreto));
  assert.equal(vistos.size, 1000);
  assert.equal(Buffer.from([...vistos][0]!, "base64url").length, 32);
});

test("la huella coincide con su secreto y con ningún otro", () => {
  const s = nuevoSecreto();
  assert.ok(coincide(s, huella(s)));
  assert.ok(!coincide(nuevoSecreto(), huella(s)));
  assert.ok(!coincide(s, "00"), "una huella de otra longitud no revienta: no coincide");
});

test("una credencial se compone y se lee igual", () => {
  const c = { tenantId: randomUUID(), id: randomUUID(), secreto: nuevoSecreto() };
  assert.deepEqual(leerCredencial(componer(c)), c);
});

test("lo que no tiene la forma exacta no es una credencial", () => {
  const t = randomUUID();
  const s = nuevoSecreto();
  for (const malo of [
    undefined,
    "",
    "abc",
    `${t}.${t}`,
    `${t}.${t}.${s}.extra`,
    `no-uuid.${t}.${s}`,
    `${t}.${t}.corto`,
    `${t}.${t}.${s.slice(0, 42)}=`,
    `${t}.${t}.' OR 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
  ]) {
    assert.equal(leerCredencial(malo), null, String(malo));
  }
});

test("el cifrado va y vuelve, y un texto manipulado no se descifra", () => {
  const c = crearCifrador(Buffer.alloc(32, 7).toString("base64"));
  const cifrado = c.cifrar("JBSWY3DPEHPK3PXP");
  assert.equal(c.descifrar(cifrado), "JBSWY3DPEHPK3PXP");
  assert.notEqual(c.cifrar("x"), c.cifrar("x"), "IV aleatorio: el mismo texto no da lo mismo");
  const partes = cifrado.split(".");
  partes[3] = Buffer.from("otra cosa").toString("base64url");
  assert.throws(() => c.descifrar(partes.join(".")));
});

test("una clave que no es de 32 bytes se rechaza", () => {
  assert.throws(() => crearCifrador("corta"), /32 bytes/);
});
