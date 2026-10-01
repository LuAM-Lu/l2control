/**
 * Pruebas del ticket impreso y de la cola — B5-2, ADR-015, ADR-026.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  COLUMNAS,
  comoTexto,
  componer,
  enCp850,
  escpos,
  esperaTrasFallo,
  importeVE,
  MAX_INTENTOS,
  partir,
  problemaDePapel,
  puedeReclamarse,
  reclamado,
  reintentado,
  reintentoProblem,
  descarteProblem,
  respuestaProblem,
  sinRespuesta,
  trasFallo,
  type Documento,
  type Trabajo,
} from "./index.ts";

const recibo: Documento = {
  renglones: [
    { tipo: "TEXTO", texto: "Abby Kingdom", alinear: "CENTRO", negrita: true, grande: true },
    { tipo: "TEXTO", texto: "RECIBO NO FISCAL", alinear: "CENTRO" },
    { tipo: "LINEA" },
    { tipo: "PAR", izq: "1 Paquete 1 hora · PB36-8153", der: "$ 5.00" },
    { tipo: "PAR", izq: "Descuento · Prueba VIP · 20 % sobre el parque", der: "− $ 1.00" },
    { tipo: "LINEA", caracter: "=" },
    { tipo: "PAR", izq: "Total", der: "$ 4.64", negrita: true },
    { tipo: "VACIO" },
    { tipo: "TEXTO", texto: "¡Gracias por visitarnos!", alinear: "CENTRO" },
  ],
};

describe("la composición", () => {
  test("32 columnas en 58 mm y 48 en 80 mm; ningún renglón se pasa", () => {
    assert.deepEqual(COLUMNAS, { 58: 32, 80: 48 });
    for (const ancho of [58, 80] as const) {
      for (const r of componer(recibo, ancho)) assert.ok(r.texto.length <= (r.grande ? COLUMNAS[ancho] / 2 : COLUMNAS[ancho]), `${ancho}: «${r.texto}»`);
    }
  });

  test("un par lleva el importe al borde derecho y parte el concepto si no cabe", () => {
    const t58 = comoTexto({ renglones: [{ tipo: "PAR", izq: "Descuento · Prueba VIP · 20 % sobre el parque", der: "− $ 1.00" }] }, 58).split("\n");
    assert.equal(t58.length, 2);
    assert.ok(t58[1]!.endsWith("− $ 1.00"));
    assert.equal(t58[1]!.length, 32);
    const t80 = comoTexto({ renglones: [{ tipo: "PAR", izq: "Total", der: "$ 4.64" }] }, 80);
    assert.equal(t80, `Total${" ".repeat(48 - 5 - 6)}$ 4.64`);
  });

  test("lo grande cabe en la mitad y se centra en su mitad", () => {
    const [r] = componer({ renglones: [{ tipo: "TEXTO", texto: "Abby Kingdom", alinear: "CENTRO", grande: true }] }, 58);
    assert.equal(r!.texto.length, 16);
    assert.equal(r!.texto.trim(), "Abby Kingdom");
  });

  test("una palabra más larga que el renglón se parte por letras", () => {
    assert.deepEqual(partir("a ".concat("x".repeat(40)), 32), ["a", "x".repeat(32), "x".repeat(8)]);
    assert.deepEqual(partir("", 32), [""]);
  });
});

describe("el ESC/POS", () => {
  test("empieza iniciando y con la página 850, y termina avanzando y cortando", () => {
    const b = escpos(recibo, 80);
    assert.deepEqual([...b.slice(0, 5)], [0x1b, 0x40, 0x1b, 0x74, 0x02]);
    assert.deepEqual([...b.slice(-7)], [0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0x00]);
    assert.deepEqual([...escpos({ ...recibo, cortar: false }, 80).slice(-3)], [0x1b, 0x64, 4]);
  });

  test("las tildes, la eñe y los signos de abrir salen en la 850; lo que no está, «?»", () => {
    assert.deepEqual(enCp850("ñÑáéíóú¿¡"), [0xa4, 0xa5, 0xa0, 0x82, 0xa1, 0xa2, 0xa3, 0xa8, 0xad]);
    assert.deepEqual(enCp850("− €"), [0x2d, 0x20, 0x3f]);
  });

  test("la negrita y lo grande se encienden y se apagan, y nada queda encendido al final", () => {
    const b = [...escpos(recibo, 58)];
    const veces = (seq: number[]) => b.filter((_, i) => seq.every((x, k) => b[i + k] === x)).length;
    assert.equal(veces([0x1b, 0x45, 1]), veces([0x1b, 0x45, 0]));
    assert.equal(veces([0x1d, 0x21, 0x11]), veces([0x1d, 0x21, 0x00]));
  });

  test("el estado del papel: sin papel, poco papel o nada que decir", () => {
    assert.equal(problemaDePapel(0x12), null);
    assert.equal(problemaDePapel(0x72), "SIN_PAPEL");
    assert.equal(problemaDePapel(0x1e), "POCO_PAPEL");
    assert.equal(problemaDePapel(0xff), null, "un byte sin la forma de una respuesta no dice nada");
  });
});

test("los importes como en la pantalla", () => {
  assert.equal(importeVE(123456n, "USD"), "$ 1,234.56");
  assert.equal(importeVE(123456789n, "VES"), "Bs. 1.234.567,89");
  assert.equal(importeVE(-100n, "USD"), "$ -1.00");
});

describe("la cola", () => {
  const nuevo: Trabajo = { estado: "PENDIENTE", intentos: 0, proximoIntento: 1000, enviadoEn: null };

  test("se reclama cuando le toca, y reclamarlo cuenta un intento", () => {
    assert.equal(puedeReclamarse(nuevo, 999), false);
    assert.equal(puedeReclamarse(nuevo, 1000), true);
    const r = reclamado(nuevo, 1000);
    assert.equal(r.estado, "ENVIADO");
    assert.equal(r.intentos, 1);
    assert.equal(puedeReclamarse(r, 5000), false);
  });

  test("un fallo vuelve a la cola con espera creciente; al quinto, FALLIDO", () => {
    assert.deepEqual([1, 2, 3, 4].map(esperaTrasFallo), [5000, 10000, 20000, 40000]);
    let t: Trabajo = nuevo;
    for (let i = 1; i < MAX_INTENTOS; i++) {
      t = trasFallo(reclamado(t, t.proximoIntento), t.proximoIntento);
      assert.equal(t.estado, "PENDIENTE");
    }
    t = trasFallo(reclamado(t, t.proximoIntento), t.proximoIntento);
    assert.equal(t.estado, "FALLIDO");
    assert.equal(t.intentos, MAX_INTENTOS);
  });

  test("un enviado sin respuesta en 30 s se trata como un fallo", () => {
    const r = reclamado(nuevo, 1000);
    assert.equal(sinRespuesta(r, 30_999), false);
    assert.equal(sinRespuesta(r, 31_000), true);
  });

  test("el agente responde solo por lo enviado; una persona reintenta solo lo fallido, desde cero", () => {
    assert.equal(respuestaProblem(nuevo), "NO_ESTA_ENVIADO");
    assert.equal(respuestaProblem(reclamado(nuevo, 1)), null);
    const fallido: Trabajo = { ...nuevo, estado: "FALLIDO", intentos: 5 };
    assert.equal(reintentoProblem(nuevo), "NO_ESTA_FALLIDO");
    assert.equal(reintentoProblem(fallido), null);
    assert.deepEqual(reintentado(fallido, 7000), { estado: "PENDIENTE", intentos: 0, proximoIntento: 7000, enviadoEn: null });
  });
});

test("la tasa y la hora como en la pantalla", async () => {
  const { tasaVE, fechaYHora } = await import("./index.ts");
  assert.equal(tasaVE("857.0058"), "857,01");
  assert.equal(tasaVE("1234.5"), "1.234,50");
  const t = Date.parse("2026-10-01T17:27:00.000Z");
  assert.equal(fechaYHora(t, "12h", "America/Caracas"), "01/10/2026 · 1:27 pm");
  assert.equal(fechaYHora(t, "24h", "America/Caracas"), "01/10/2026 · 13:27");
});

test("se descarta lo que falló o espera; no lo que está imprimiéndose ni lo terminado", () => {
  assert.equal(descarteProblem({ estado: "FALLIDO" }), null);
  assert.equal(descarteProblem({ estado: "PENDIENTE" }), null);
  assert.equal(descarteProblem({ estado: "ENVIADO" }), "EN_CURSO");
  assert.equal(descarteProblem({ estado: "CONFIRMADO" }), "YA_TERMINADO");
  assert.equal(descarteProblem({ estado: "DESCARTADO" }), "YA_TERMINADO");
});
