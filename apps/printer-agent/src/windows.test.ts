/**
 * La impresora por USB (B5-4) con un PowerShell de mentira: qué se le pasa y cómo se dice lo que contesta.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { imprimirEnWindows, listarImpresorasDeWindows, type CorrerPowerShell } from "./windows.ts";

test("lista las impresoras de Windows; si PowerShell falla o contesta otra cosa, ninguna", async () => {
  const bien: CorrerPowerShell = async () => ({ codigo: 0, salida: '["XP-80C","Microsoft Print to PDF",""]' });
  assert.deepEqual(await listarImpresorasDeWindows(bien), ["XP-80C", "Microsoft Print to PDF"]);
  assert.deepEqual(await listarImpresorasDeWindows(async () => ({ codigo: 1, salida: "" })), []);
  assert.deepEqual(await listarImpresorasDeWindows(async () => ({ codigo: 0, salida: "no es json" })), []);
});

test("imprime con el nombre y los bytes en el entorno, y dice en palabras por qué no salió", async () => {
  let entorno: Record<string, string> = {};
  const bien: CorrerPowerShell = async (_g, e) => {
    entorno = e;
    return { codigo: 0, salida: "" };
  };
  const r = await imprimirEnWindows("XP-80C", Uint8Array.from([0x1b, 0x40]), bien);
  assert.equal(r.ok, true);
  assert.deepEqual(entorno, { L2_IMPRESORA: "XP-80C", L2_DATOS: "G0A=" });

  const no = (salida: string, codigo: number | null = 2): CorrerPowerShell => async () => ({ codigo, salida });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("NO_ESTA")), {
    ok: false,
    error: "Windows no tiene una impresora «XP-80C»: revisa su nombre en Ajustes → Impresoras",
  });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("INCOMPLETO 10 40")), { ok: false, error: "Windows recibió 10 de 40 bytes en «XP-80C»" });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("", null)), { ok: false, error: "«XP-80C» no respondió a tiempo" });
});
