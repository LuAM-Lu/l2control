/**
 * §10.3: si falta una variable o un valor es inválido, el proceso NO arranca, y el
 * mensaje dice cuál sin enseñar su valor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { EntornoInvalido, leerEntorno, nivelLog, urlPostgres, urlValkey } from "./entorno.ts";

const esquema = z.object({
  L2_DB_APP_URL: urlPostgres,
  L2_VALKEY_URL: urlValkey,
  L2_LOG_LEVEL: nivelLog,
  L2_SECRETO_SESION: z.string().min(32),
});

const bueno = {
  L2_DB_APP_URL: "postgresql://l2_app:clave-de-verdad@127.0.0.1:5433/l2control",
  L2_VALKEY_URL: "redis://:otra-clave@127.0.0.1:6379",
  L2_LOG_LEVEL: "info",
  L2_SECRETO_SESION: "x".repeat(40),
  PATH: "lo que no se declara se ignora",
};

test("con todo en orden devuelve el entorno tipado", () => {
  const entorno = leerEntorno(esquema, bueno);
  assert.equal(entorno.L2_LOG_LEVEL, "info");
  assert.ok(!("PATH" in entorno));
});

test("si falta una variable, no arranca y dice cuál", () => {
  const { L2_DB_APP_URL: _, ...sinBase } = bueno;
  assert.throws(() => leerEntorno(esquema, sinBase), (e: unknown) => {
    assert.ok(e instanceof EntornoInvalido);
    assert.deepEqual(e.problemas, ["L2_DB_APP_URL: falta"]);
    return true;
  });
});

test("dice TODOS los problemas a la vez", () => {
  assert.throws(() => leerEntorno(esquema, {}), (e: unknown) => {
    assert.ok(e instanceof EntornoInvalido);
    assert.equal(e.problemas.length, 4);
    return true;
  });
});

test("un valor inválido se rechaza sin repetir el valor en el mensaje", () => {
  const malo = {
    ...bueno,
    L2_DB_APP_URL: "mysql://root:mi-clave-filtrada@host/db",
    L2_SECRETO_SESION: "corto-pero-secreto",
    L2_LOG_LEVEL: "chismoso",
  };
  assert.throws(() => leerEntorno(esquema, malo), (e: unknown) => {
    assert.ok(e instanceof EntornoInvalido);
    assert.ok(!e.message.includes("mi-clave-filtrada"), e.message);
    assert.ok(!e.message.includes("corto-pero-secreto"), e.message);
    assert.ok(!e.message.includes("chismoso"), e.message);
    assert.match(e.message, /L2_DB_APP_URL/);
    assert.match(e.message, /L2_SECRETO_SESION: demasiado corto/);
    assert.match(e.message, /L2_LOG_LEVEL: no es uno de los valores admitidos/);
    return true;
  });
});

test("una variable vacía no cuenta como presente", () => {
  assert.throws(() => leerEntorno(esquema, { ...bueno, L2_VALKEY_URL: "" }), EntornoInvalido);
});
