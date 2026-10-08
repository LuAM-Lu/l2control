/**
 * El kárdex contra l2control_test — B11-3 (M-29).
 *
 * Con reloj fijo: jueves 8 de octubre de 2026, 2:00 pm en Caracas. El martes 6 llegan 24 refrescos; el miércoles 7 se
 * venden 2 en el mostrador y se saca 1 por merma; el jueves 8 un conteo encuentra 20 donde se esperaban 21 y la malta
 * se cuenta en cero; las galletas arrancan con su inventario inicial en cero. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T18:00:00.000Z");
const HORA = 3_600_000;
const MARTES = Date.parse("2026-10-06T14:00:00.000Z");
const MIERCOLES = Date.parse("2026-10-07T15:00:00.000Z");
const JUEVES = Date.parse("2026-10-08T13:00:00.000Z");

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxMonitora: Contexto;
let admin: string;
const ids: Record<string, string> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const conPinDeAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Revisado en el depósito" });
const linea = (nombre: string) => ({ id: randomUUID(), concept: nombre, kind: "RESTAURANTE" as const, amount: usd("150"), paid: false, productId: ids[nombre]!, taxCode: "GENERAL" as const });
const kardex = (consulta: Record<string, unknown>, ctx: Contexto = ctxAdmin) => local.app.reportes.movimientos(ctx, consulta, AHORA);
const filas = (p: { movimientos: { tipo: string; cantidad: number; saldo: number; detalle: string }[] }) => p.movimientos.map((m) => [m.tipo, m.cantidad, m.saldo, m.detalle]);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Kárdex");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "2846" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Sala"), monitora, "2846");
  for (const [nombre, categoria, tipo] of [
    ["Refresco", "Bebidas", "PRODUCTO"],
    ["Malta", "Bebidas", "PRODUCTO"],
    ["Galleta", "Chucherías", "PRODUCTO"],
    ["Café", "Bebidas", "PREPARADO"],
  ] as const) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo, precioMinor: "150" } }, MARTES - HORA));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  valor(
    await local.app.turnos.abrir(ctxCajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, MARTES - HORA),
  );

  // Martes: 2 bultos de 12 refrescos de la Distribuidora Centro, factura A-123.
  valor(
    await local.app.entradas.registrar(
      local.sistema,
      {
        idempotencyKey: randomUUID(),
        tipo: "COMPRA",
        proveedor: "Distribuidora Centro",
        factura: "A-123",
        lineas: [{ productId: ids.Refresco!, bultos: 2, unidadesPorBulto: 12, costo: { por: "BULTO", minor: "600" } }],
      },
      MARTES,
    ),
  );
  // Miércoles: 2 refrescos en el mostrador y 1 por merma.
  valor(
    await local.app.cuentas.guardar(
      ctxCajera,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(MIERCOLES).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [linea("Refresco"), linea("Refresco")],
        },
      },
      MIERCOLES,
    ),
  );
  valor(
    await local.app.salidas.salida(
      ctxAdmin,
      { idempotencyKey: randomUUID(), motivo: "MERMA", detalle: "Latas abolladas", lineas: [{ productId: ids.Refresco!, cantidad: 1 }] },
      conPinDeAdmin(),
      MIERCOLES + HORA,
    ),
  );
  // Jueves: el conteo encuentra 20 refrescos (se esperaban 21) y la malta, que nunca se contó, en cero.
  valor(
    await local.app.salidas.conteo(
      ctxAdmin,
      {
        idempotencyKey: randomUUID(),
        lineas: [
          { productId: ids.Refresco!, esperado: 21, contado: 20 },
          { productId: ids.Malta!, esperado: 0, contado: 0 },
        ],
      },
      conPinDeAdmin(),
      JUEVES,
    ),
  );
  // Y las galletas arrancan con su inventario inicial en cero.
  valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "INICIAL", lineas: [], enCero: [ids.Galleta!] }, JUEVES + HORA));
});

after(async () => {
  await local.cerrar();
});

describe("el kárdex de un producto (B11-3)", () => {
  test("cada movimiento con quién, el motivo y el saldo que deja; el saldo final es la existencia", async () => {
    const i = valor(await kardex({ desde: "2026-10-07", hasta: "2026-10-08", producto: ids.Refresco }));
    assert.equal(i.filtro.producto, "Refresco");
    const [r] = i.productos;
    assert.ok(r);
    assert.equal(r.inicial, 24, "lo del martes queda antes del periodo");
    assert.deepEqual(filas(r), [
      ["VENTA", -2, 22, "Venta · Mostrador"],
      ["SALIDA", -1, 21, "Merma · Latas abolladas"],
      ["AJUSTE", -1, 20, "Conteo: se esperaban 21 y se contaron 20"],
    ]);
    assert.deepEqual([r.entradas, r.salidas, r.final, r.existencia], [0, 4, 20, 20]);
    assert.equal(r.movimientos[0]!.quien, "Marisol Prieto");
    assert.deepEqual(
      r.movimientos.map((m) => m.autorizo),
      [null, "Abigail Karam", "Abigail Karam"],
    );
  });

  test("la entrada dice de dónde vino; un periodo pasado no cambia con lo que vino después", async () => {
    const [r] = valor(await kardex({ desde: "2026-10-06", hasta: "2026-10-06", producto: ids.Refresco })).productos;
    assert.deepEqual(filas(r!), [["ENTRADA", 24, 24, "Compra · Distribuidora Centro · factura A-123 · 2 × 12"]]);
    assert.deepEqual([r!.inicial, r!.final, r!.existencia], [0, 24, 20]);
  });
});

describe("el kárdex de una categoría", () => {
  test("cada producto que se cuenta, con lo que pasó sin mover nada: el conteo que cuadró y el inicial en cero", async () => {
    const bebidas = valor(await kardex({ desde: "2026-10-08", hasta: "2026-10-08", categoria: "Bebidas" }));
    assert.deepEqual(
      bebidas.productos.map((p) => p.nombre),
      ["Malta", "Refresco"],
      "el café no se cuenta",
    );
    assert.deepEqual(filas(bebidas.productos[0]!), [["CONTEO", 0, 0, "Conteo: se contaron 0, cuadra"]]);
    const [galleta] = valor(await kardex({ desde: "2026-10-08", hasta: "2026-10-08", categoria: "Chucherías" })).productos;
    assert.deepEqual(filas(galleta!), [["INICIAL", 0, 0, "Inventario inicial en cero"]]);
  });

  test("sin producto ni categoría, solo lo que se puede elegir", async () => {
    const i = valor(await kardex({ desde: "2026-10-08", hasta: "2026-10-08" }));
    assert.deepEqual(i.productos, []);
    assert.deepEqual(i.opciones.categorias, ["Bebidas", "Chucherías"]);
    assert.deepEqual(
      i.opciones.productos.map((p) => p.nombre),
      ["Malta", "Refresco", "Galleta"],
    );
  });
});

describe("quién y qué periodo", () => {
  test("la monitora no ve los reportes; un periodo de más de 93 días se parte", async () => {
    const r = await kardex({ desde: "2026-10-08", hasta: "2026-10-08", producto: ids.Refresco }, ctxMonitora);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const largo = await kardex({ desde: "2026-01-01", hasta: "2026-10-08", producto: ids.Refresco });
    assert.equal(!largo.ok && largo.mensaje, "Hasta 93 días: parte el periodo");
  });
});
