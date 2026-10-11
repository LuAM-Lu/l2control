/**
 * La impresora por USB (B5-4) con un PowerShell de mentira: qué se le pasa y cómo se dice lo que contesta. Y lo de B5-6:
 * lo que Windows sabe de ella antes de mandar, lo que se queda atascado en su cola y su estado cada 30 s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { causaDeFallo } from "@l2/domain-printing";
import { estadoEnWindows, imprimirEnWindows, listarImpresorasDeWindows, type CorrerPowerShell } from "./windows.ts";

test("lista las impresoras de Windows; si PowerShell falla o contesta otra cosa, ninguna", async () => {
  const bien: CorrerPowerShell = async () => ({ codigo: 0, salida: '["XP-80C","Microsoft Print to PDF",""]' });
  assert.deepEqual(await listarImpresorasDeWindows(bien), ["XP-80C", "Microsoft Print to PDF"]);
  assert.deepEqual(await listarImpresorasDeWindows(async () => ({ codigo: 1, salida: "" })), []);
  assert.deepEqual(await listarImpresorasDeWindows(async () => ({ codigo: 0, salida: "no es json" })), []);
});

test("imprime con el nombre, los bytes y los 15 s de la cola en el entorno, y dice en palabras por qué no salió", async () => {
  let entorno: Record<string, string> = {};
  const bien: CorrerPowerShell = async (_g, e) => {
    entorno = e;
    return { codigo: 0, salida: "" };
  };
  const r = await imprimirEnWindows("XP-80C", Uint8Array.from([0x1b, 0x40]), bien);
  assert.equal(r.ok, true);
  assert.deepEqual(entorno, { L2_IMPRESORA: "XP-80C", L2_DATOS: "G0A=", L2_ATASCADA_MS: "15000" });

  const no = (salida: string, codigo: number | null = 2): CorrerPowerShell => async () => ({ codigo, salida });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("NO_ESTA")), {
    ok: false,
    error: "Windows no tiene una impresora «XP-80C»: revisa su nombre en Ajustes → Impresoras",
  });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("INCOMPLETO 10 40")), { ok: false, error: "Windows recibió 10 de 40 bytes en «XP-80C»" });
  assert.deepEqual(await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("", null)), { ok: false, error: "«XP-80C» no respondió a tiempo" });
});

test("por USB, sin papel, sin conexión o atascada en la cola: no salió, con la causa que entiende el servidor (B5-6)", async () => {
  const no = (salida: string): CorrerPowerShell => async () => ({ codigo: 2, salida });
  const sinPapel = await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("SIN_PAPEL"));
  assert.ok(!sinPapel.ok && causaDeFallo(sinPapel.error) === "SIN_PAPEL", JSON.stringify(sinPapel));
  const sinConexion = await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("SIN_CONEXION desconectada"));
  assert.ok(!sinConexion.ok && causaDeFallo(sinConexion.error) === "NO_RESPONDE" && sinConexion.error.includes("desconectada"), JSON.stringify(sinConexion));
  const atascada = await imprimirEnWindows("XP-80C", Uint8Array.of(1), no("ATASCADA"));
  assert.ok(!atascada.ok && causaDeFallo(atascada.error) === "NO_RESPONDE" && atascada.error.includes("se sacó de la cola"), JSON.stringify(atascada));
});

test("el estado de cada una según Windows, cada 30 s (B5-6)", async () => {
  let entorno: Record<string, string> = {};
  const correr: CorrerPowerShell = async (_g, e) => {
    entorno = e;
    return {
      codigo: 0,
      salida: JSON.stringify([
        { nombre: "XP-80C", estado: "", atascados: 0 },
        { nombre: "CAJA POS", estado: "SIN_PAPEL", atascados: 0 },
        { nombre: "Barra", estado: "SIN_CONEXION desconectada", atascados: 0 },
        { nombre: "Cocina", estado: "", atascados: 2 },
        { nombre: "Otra", estado: "", atascados: 0 },
      ]),
    };
  };
  const e = await estadoEnWindows(["XP-80C", "CAJA POS", "Barra", "Cocina"], correr);
  assert.deepEqual(JSON.parse(entorno.L2_IMPRESORAS ?? "[]"), ["XP-80C", "CAJA POS", "Barra", "Cocina"]);
  assert.equal(e.get("XP-80C")?.estado, "LISTA");
  assert.equal(e.get("CAJA POS")?.estado, "SIN_PAPEL");
  assert.equal(e.get("Barra")?.estado, "NO_RESPONDE");
  assert.match(e.get("Cocina")?.detalle ?? "", /2 trabajos atascados/);
  assert.equal(e.has("Otra"), false);
  // Si Windows no contesta, no se sabe: no se dice nada (no se inventa un «lista»).
  assert.equal((await estadoEnWindows(["XP-80C"], async () => ({ codigo: 1, salida: "" }))).size, 0);
  assert.equal((await estadoEnWindows([], correr)).size, 0);
});
