/** `cn` conoce la escala de texto de T-16: no la toma por un color. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ESCALA_DE_TEXTO, cn } from "./cn.ts";

test("un escalón de la escala y un color conviven; dos escalones, gana el último", () => {
  assert.equal(cn("text-detalle text-ink-2"), "text-detalle text-ink-2");
  assert.equal(cn("tnum text-cifra leading-none", "text-state-ok"), "tnum text-cifra leading-none text-state-ok");
  assert.equal(cn("text-etiqueta font-bold uppercase", "text-state-crit"), "text-etiqueta font-bold uppercase text-state-crit");
  assert.equal(cn("text-detalle", "text-cuerpo"), "text-cuerpo");
  assert.equal(cn("text-[13px]", "text-nota"), "text-nota");
});

test("la lista de `cn` es la de los tokens: un escalón nuevo no se pierde", () => {
  const tokens = readFileSync(new URL("../../config/tokens.css", import.meta.url), "utf8");
  const enTokens = [...tokens.matchAll(/^\s*--text-([a-z]+):/gm)].map((m) => m[1]);
  assert.deepEqual([...enTokens].sort(), [...ESCALA_DE_TEXTO].sort());
});
