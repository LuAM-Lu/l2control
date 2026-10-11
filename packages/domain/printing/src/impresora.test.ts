/**
 * Pruebas de la impresora, su estado y su respaldo — B5-6 (M-38, W-1).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ERROR_SIN_PAPEL,
  MAX_INTENTOS,
  atascadaEnWindows,
  causaDeFallo,
  estadoQueAvisa,
  estadoTrasFallo,
  noRespondeEnWindows,
  sinPapelEnWindows,
  trasFalloConCausa,
  type TrabajoConCamino,
} from "./index.ts";

const enviado = (intentos = 1, porRespaldo = false): TrabajoConCamino => ({ estado: "ENVIADO", intentos, proximoIntento: 0, enviadoEn: 1_000, porRespaldo });

describe("de qué fue un fallo (B5-6)", () => {
  test("el papel, por red o por USB", () => {
    assert.equal(causaDeFallo(ERROR_SIN_PAPEL), "SIN_PAPEL");
    assert.equal(causaDeFallo(sinPapelEnWindows("CAJA POS")), "SIN_PAPEL");
  });

  test("que no contesta: la red, el tiempo, Windows sin conexión y lo atascado en su cola", () => {
    for (const e of [
      "No responde en 192.168.1.50:9100",
      "La impresora en 192.168.1.50:9100 rechaza la conexión",
      "La impresora en 192.168.1.50:9100 no está en la red",
      "La impresora en 192.168.1.50:9100 no terminó a tiempo",
      "La conexión con 192.168.1.50:9100 se cortó",
      "«CAJA POS» no respondió a tiempo",
      noRespondeEnWindows("CAJA POS", "sin conexión"),
      atascadaEnWindows("CAJA POS"),
    ]) {
      assert.equal(causaDeFallo(e), "NO_RESPONDE", e);
    }
  });

  test("lo demás no es de la impresora: un nombre mal escrito, el agente caído, una apagada", () => {
    assert.equal(causaDeFallo("Windows no tiene una impresora «CAJA»: revisa su nombre en Ajustes → Impresoras"), "OTRO");
    assert.equal(causaDeFallo("El agente no respondió"), "OTRO");
    assert.equal(causaDeFallo("«CAJA» está apagada"), "OTRO");
  });

  test("el estado que deja en la impresora, y cuál avisa", () => {
    assert.equal(estadoTrasFallo("SIN_PAPEL"), "SIN_PAPEL");
    assert.equal(estadoTrasFallo("NO_RESPONDE"), "NO_RESPONDE");
    assert.equal(estadoTrasFallo("OTRO"), null);
    assert.equal(estadoQueAvisa("SIN_PAPEL"), true);
    assert.equal(estadoQueAvisa("NO_RESPONDE"), true);
    assert.equal(estadoQueAvisa("POCO_PAPEL"), false);
    assert.equal(estadoQueAvisa(null), false);
  });
});

describe("qué pasa con el trabajo (B5-6)", () => {
  test("sin papel, «no salió» en el acto, con o sin respaldo: el rollo es el mismo", () => {
    for (const hay of [true, false]) {
      const t = trasFalloConCausa(enviado(), "SIN_PAPEL", hay, 5_000);
      assert.equal(t.estado, "FALLIDO");
      assert.equal(t.porRespaldo, false);
      assert.equal(t.desviado, false);
    }
  });

  test("no responde con respaldo: sale por él ya, una sola vez", () => {
    const t = trasFalloConCausa(enviado(), "NO_RESPONDE", true, 5_000);
    assert.deepEqual([t.estado, t.proximoIntento, t.porRespaldo, t.desviado], ["PENDIENTE", 5_000, true, true]);
    // Si el respaldo tampoco responde, sigue por él con la espera de siempre: no vuelve y va.
    const otra = trasFalloConCausa({ ...t, estado: "ENVIADO", intentos: 2 }, "NO_RESPONDE", true, 9_000);
    assert.deepEqual([otra.estado, otra.porRespaldo, otra.desviado], ["PENDIENTE", true, false]);
    assert.ok(otra.proximoIntento > 9_000);
  });

  test("no responde sin respaldo, u otro motivo: la espera que crece y FALLIDO al quinto", () => {
    const t = trasFalloConCausa(enviado(1), "NO_RESPONDE", false, 5_000);
    assert.deepEqual([t.estado, t.proximoIntento, t.desviado], ["PENDIENTE", 10_000, false]);
    assert.equal(trasFalloConCausa(enviado(MAX_INTENTOS), "OTRO", true, 5_000).estado, "FALLIDO");
  });
});
