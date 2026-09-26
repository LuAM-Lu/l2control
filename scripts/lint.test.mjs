/**
 * El lint MUERDE, y no salta con lo que no debe. Un lint que pasa en verde sin mirar
 * nada es peor que no tenerlo (mismo criterio que `pnpm arch:demo`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { revisar } from "./lint-reglas.mjs";

const reglas = (ruta, texto) => revisar(ruta, texto).map((h) => h.regla);

test("toFixed fuera de @l2/ui se rechaza; dentro, no", () => {
  assert.deepEqual(reglas("apps/web/src/features/cash/x.tsx", "const s = total.toFixed(2);"), ["dinero-sin-toFixed"]);
  assert.deepEqual(reglas("packages/ui/src/MoneyDisplay.tsx", "const s = n.toFixed(2);"), []);
});

test("parseFloat se rechaza en cualquier parte", () => {
  assert.deepEqual(reglas("packages/domain/rates/src/x.ts", "const t = parseFloat(v);"), ["dinero-sin-parseFloat"]);
  assert.deepEqual(reglas("apps/web/src/x.ts", "Number.parseFloat(v)"), ["dinero-sin-parseFloat"]);
});

test("colores literales fuera de tokens.css se rechazan", () => {
  const r = "apps/web/src/features/x.tsx";
  assert.deepEqual(reglas(r, 'style={{ color: "#eab308" }}'), ["colores-solo-desde-tokens"]);
  assert.deepEqual(reglas(r, '<div className="bg-[#0f172a]" />'), ["colores-solo-desde-tokens"]);
  assert.deepEqual(reglas(r, "const c = 'rgb(0 0 0 / 0.3)';"), ["colores-solo-desde-tokens"]);
  assert.deepEqual(reglas(r, 'fill="#000"'), ["colores-solo-desde-tokens"]);
  assert.deepEqual(reglas("packages/config/tokens.css", "--color-base: #0f172a;"), []);
});

test("números de orden, anclas y campos privados no son colores", () => {
  const r = "apps/web/src/features/x.tsx";
  for (const texto of ['orden: "#1042"', 'href="#pagos"', "this.#add()", 'id="seccion-#abc-1"', "`Cuenta #1042 · 10 %`"]) {
    assert.deepEqual(reglas(r, texto), [], texto);
  }
});

test("el dominio no lee el reloj; sus pruebas y el resto sí pueden", () => {
  assert.deepEqual(reglas("packages/domain/park/src/index.ts", "const ahora = Date.now();"), ["dominio-sin-reloj"]);
  assert.deepEqual(reglas("packages/domain/cash/src/x.ts", "const d = new Date();"), ["dominio-sin-reloj"]);
  assert.deepEqual(reglas("packages/domain/cash/src/x.ts", "const d = new Date(instante);"), []);
  assert.deepEqual(reglas("packages/domain/park/src/x.test.ts", "Date.now()"), []);
  assert.deepEqual(reglas("apps/web/src/x.ts", "Date.now()"), []);
});

test("un emoji en una pantalla se rechaza; en un comentario, no", () => {
  assert.deepEqual(reglas("apps/web/src/features/x.tsx", "<span>✅ Pagado</span>"), ["sin-emojis-en-pantalla"]);
  assert.deepEqual(reglas("apps/web/src/features/x.tsx", " * ⚠ DEUDA: esto es un comentario"), []);
  assert.deepEqual(reglas("apps/web/src/features/x.tsx", "{/* ⚠ también */}"), []);
});

test("lo que está en un comentario no cuenta", () => {
  assert.deepEqual(reglas("apps/web/src/x.ts", "// parseFloat(x) sería un error"), []);
  assert.deepEqual(reglas("apps/web/src/x.ts", "const a = 1; // nunca toFixed(2)"), []);
  assert.deepEqual(reglas("apps/web/src/x.ts", 'const u = "https://ejemplo.com/a"; x.toFixed(2)'), ["dinero-sin-toFixed"]);
});

test("una excepción se acepta solo con su motivo", () => {
  const r = "apps/web/src/features/x.tsx";
  const conMotivo = "// lint-permitido: colores-solo-desde-tokens — un atributo SVG no lee var()\nfloodColor=\"#000\"";
  const sinMotivo = "// lint-permitido: colores-solo-desde-tokens\nfloodColor=\"#000\"";
  const otraRegla = "// lint-permitido: dinero-sin-toFixed — no aplica\nfloodColor=\"#000\"";
  assert.deepEqual(reglas(r, conMotivo), []);
  assert.deepEqual(reglas(r, sinMotivo), ["colores-solo-desde-tokens"]);
  assert.deepEqual(reglas(r, otraRegla), ["colores-solo-desde-tokens"]);
});

test("las excepciones de archivo entero son solo para su regla", () => {
  assert.deepEqual(reglas("apps/web/app/manifest.ts", 'theme_color: "#0f172a",'), []);
  assert.deepEqual(reglas("apps/web/app/manifest.ts", "x.toFixed(2)"), ["dinero-sin-toFixed"]);
});
