/**
 * La comprobación de la versión MUERDE (M-10): un número subido sin su entrada en el
 * CHANGELOG, o al revés, no pasa `pnpm verify`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { comprobarVersion } from "./version-reglas.mjs";

const paquete = (version, etapa = "Etapa 2 · Dinero", pasos = 45) => ({ version, l2: { etapa, pasos } });
const changelog = (...versiones) =>
  ["# Cambios", "", "## [Sin publicar]", "", ...versiones.map((v) => `## [${v}] — 2026-09-26\n\n- algo\n`)].join("\n");

test("versión y CHANGELOG al día: pasa y cuenta los pasos por el MINOR", () => {
  const r = comprobarVersion(paquete("0.14.0"), changelog("0.14.0", "0.13.0"));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.entregados, 14);
});

test("subir el package.json sin su entrada en el CHANGELOG se rechaza", () => {
  const r = comprobarVersion(paquete("0.15.0"), changelog("0.14.0", "0.13.0"));
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.problemas.join(" "), /abre con 0\.14\.0/);
});

test("una entrada nueva en el CHANGELOG sin subir el package.json también", () => {
  assert.equal(comprobarVersion(paquete("0.14.0"), changelog("0.15.0", "0.14.0")).ok, false);
});

test("versiones que no son SemVer, sin etapa o con más pasos que la ruta se rechazan", () => {
  for (const p of [paquete("0.14"), paquete("v0.14.0"), paquete("0.14.0-beta"), paquete("0.14.0", "  "), paquete("0.46.0")]) {
    assert.equal(comprobarVersion(p, changelog(p.version)).ok, false, JSON.stringify(p));
  }
});

test("un candidato de staging (-rc.N) es válido", () => {
  assert.equal(comprobarVersion(paquete("0.30.0-rc.2"), changelog("0.30.0-rc.2")).ok, true);
});

test("un CHANGELOG sin versiones se rechaza", () => {
  assert.equal(comprobarVersion(paquete("0.14.0"), "# Cambios\n\n## [Sin publicar]\n").ok, false);
});
