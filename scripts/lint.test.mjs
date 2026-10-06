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

test("en la aplicación no se lanzan consultas a la vez; en sus pruebas y en la web, sí se puede", () => {
  const r = "packages/application/src/caja/x.ts";
  assert.deepEqual(reglas(r, "const [a, b] = await Promise.all([tx.a.findMany(), tx.b.findMany()]);"), ["transaccion-sin-consultas-a-la-vez"]);
  assert.deepEqual(reglas(r, "await Promise.allSettled(xs)"), ["transaccion-sin-consultas-a-la-vez"]);
  assert.deepEqual(reglas(r, "// lint-permitido: transaccion-sin-consultas-a-la-vez — son peticiones de red\nawait Promise.all(fuentes)"), []);
  assert.deepEqual(reglas("packages/application/src/caja/x.test-db.ts", "await Promise.all([a(), b()])"), []);
  assert.deepEqual(reglas("apps/web/src/features/x.ts", "await Promise.all([a(), b()])"), []);
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

test("sin-simulacion: el almacenamiento del navegador se rechaza en la web, salvo con su motivo", () => {
  const r = "apps/web/src/features/park/x.tsx";
  assert.deepEqual(reglas(r, 'window.localStorage.setItem("l2.sala", JSON.stringify(ninos));'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'const c = sessionStorage.getItem("cuenta");'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'const bd = indexedDB.open("l2");'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, '// lint-permitido: sin-simulacion — recuerda la vista elegida\nlocalStorage.setItem("vista", v);'), []);
  assert.deepEqual(reglas(r, '// lint-permitido: sin-simulacion\nlocalStorage.setItem("vista", v);'), ["sin-simulacion"]);
  assert.deepEqual(reglas("apps/web/src/features/park/x.test.ts", 'localStorage.setItem("a", "b");'), []);
});

test("sin-simulacion: un PIN literal se rechaza fuera de las pruebas", () => {
  const r = "apps/web/src/features/identity/x.tsx";
  assert.deepEqual(reglas(r, 'const [pin, setPin] = useState(""); const PIN_ADMIN = "1970";'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'entrar({ userId, pin: "1970" });'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'if (pin === "1970") abrir();'), ["sin-simulacion"]);
  assert.deepEqual(reglas("packages/application/src/identidad/x.ts", "const elPin = cmd.pin ?? '2580';"), ["sin-simulacion"]);
  assert.deepEqual(reglas("packages/application/src/identidad/x.test-db.ts", 'pin: "4826"'), []);
  assert.deepEqual(reglas("packages/application/src/para-pruebas.ts", 'p.pin ?? "2580"'), []);
  for (const texto of ['const [pin, setPin] = useState("");', 'placeholder="PIN de 4 a 8 cifras"', 'opinion: "1234"', 'codigo: "0102"', "pin.length === 4"]) {
    assert.deepEqual(reglas(r, texto), [], texto);
  }
});

test("sin-simulacion: una pantalla no trae listas de ejemplo ni importa de una carpeta demo", () => {
  const r = "apps/web/src/features/inventario/x.tsx";
  assert.deepEqual(reglas(r, "const PRODUCTOS: readonly ProductoDto[] = ["), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'export const CUENTAS: CuentaDto[] = [{ id: "1" }];'), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, "const PRODUCTOS_DEMO = ["), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, "const mockCuentas = cuentas();"), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, "function familiasDeEjemplo() {"), ["sin-simulacion"]);
  assert.deepEqual(reglas(r, 'import { CARTA } from "@/demo/carta";'), ["sin-simulacion"]);
  assert.deepEqual(reglas("apps/web/app/(admin)/panel/page.tsx", 'import { dia } from "../../src/demo";'), ["sin-simulacion"]);
});

test("sin-simulacion: las opciones de una pantalla, una lista vacía y un ejemplo calculado no son simulación", () => {
  const r = "apps/web/src/features/cash/x.tsx";
  for (const texto of [
    "const SIN_TERMINALES: readonly PosTerminalDto[] = [];",
    "const FILTROS: readonly { id: FiltroCola; texto: string }[] = [",
    'const FIJOS: readonly { kind: ElementoFijoDto["kind"]; nombre: string }[] = [',
    "const BILLETES_USD = [1, 5, 10, 20, 50, 100] as const;",
    "  const visibles: CuentaDto[] = [...cuentas].sort(porNumero);",
    "const deMostrador = linea !== undefined && esLineaDeMostrador(linea);",
    "type ItemDeMostrador = Readonly<{ concepto: string }>;",
    "function ejemploExcedente(p: ParkPolicyDto, minutosDeMas: number) {",
    "const minutosEjemplo = 20;",
    'import { x } from "@l2/domain-money";',
  ]) {
    assert.deepEqual(reglas(r, texto), [], texto);
  }
});
