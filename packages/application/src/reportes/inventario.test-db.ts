/**
 * El inventario al momento contra l2control_test — B11-2 (M-29).
 *
 * Con reloj fijo: jueves 8 de octubre de 2026, 2:00 pm en Caracas. Llegan 24 refrescos a $ 0,50 y se venden 2; 4
 * maltas con su mínimo en 5; las chupetas arrancan en cero; las galletas nunca se contaron; un turrón retirado sin nada y
 * unos chocolates retirados con 3 en el depósito. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T18:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxCajera: Contexto;
let ctxMonitora: Contexto;
const ids: Record<string, string> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const unidades = (nombre: string, n: number, costoMinor: string) => ({ productId: ids[nombre]!, bultos: n, unidadesPorBulto: 1, costo: { por: "UNIDAD", minor: costoMinor } });

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Inventario al momento");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "2846" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Sala"), monitora, "2846");
  for (const [nombre, categoria, tipo, minimo] of [
    ["Refresco", "Bebidas", "PRODUCTO", null],
    ["Malta", "Bebidas", "PRODUCTO", 5],
    ["Café", "Bebidas", "PREPARADO", null],
    ["Chupeta", "Golosinas", "PRODUCTO", null],
    ["Galleta", "Golosinas", "PRODUCTO", null],
    ["Turrón", "Golosinas", "PRODUCTO", null],
    ["Chocolate", "Golosinas", "PRODUCTO", null],
  ] as const) {
    const c = valor(
      await local.app.productos.aplicar(
        local.sistema,
        { kind: "CREAR", producto: { nombre, categoria, taxCode: "GENERAL", tipo, precioMinor: "150", ...(minimo !== null ? { minimo } : {}) } },
        AHORA - 60 * MIN,
      ),
    );
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  valor(
    await local.app.entradas.registrar(
      local.sistema,
      { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [unidades("Refresco", 24, "50"), unidades("Malta", 4, "75"), unidades("Chocolate", 3, "100")] },
      AHORA - 50 * MIN,
    ),
  );
  valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "INICIAL", lineas: [], enCero: [ids.Chupeta!] }, AHORA - 45 * MIN));
  valor(await local.app.turnos.abrir(ctxCajera, { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] }, AHORA - 40 * MIN));
  const linea = () => ({ id: randomUUID(), concept: "Refresco", kind: "RESTAURANTE" as const, amount: usd("150"), paid: false, productId: ids.Refresco!, taxCode: "GENERAL" as const });
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
          openedAt: new Date(AHORA - 30 * MIN).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [linea(), linea()],
        },
      },
      AHORA - 30 * MIN,
    ),
  );
  for (const nombre of ["Turrón", "Chocolate"]) valor(await local.app.productos.aplicar(local.sistema, { kind: "ACTIVAR", productId: ids[nombre]!, activo: false }, AHORA - 20 * MIN));
});

after(async () => {
  await local.cerrar();
});

describe("el inventario al momento (B11-2)", () => {
  test("cada producto que se cuenta con su existencia, su costo y su estado; lo retirado con existencia sigue contando", async () => {
    const i = valor(await local.app.reportes.inventario(ctxAdmin, AHORA));
    const por = new Map(i.productos.map((p) => [p.nombre, p]));
    assert.deepEqual(
      i.productos.map((p) => p.nombre),
      ["Malta", "Refresco", "Chocolate", "Chupeta", "Galleta"],
      "por categoría y nombre; ni el café (no se cuenta) ni el turrón retirado sin nada",
    );
    assert.deepEqual(
      [...por.values()].map((p) => [p.nombre, p.existencia, p.estado, p.valor.minor, p.costoPromedio?.minor ?? null]),
      [
        ["Malta", 4, "BAJO_MINIMO", "300", "75"],
        ["Refresco", 22, "BIEN", "1100", "50"],
        ["Chocolate", 3, "BIEN", "300", "100"],
        ["Chupeta", 0, "AGOTADO", "0", null],
        ["Galleta", 0, "SIN_INICIAL", "0", null],
      ],
    );
    assert.equal(por.get("Chocolate")!.retirado, true);
    assert.deepEqual(i.resumen, { productos: 5, unidades: 29, valor: usd("1700"), agotados: 1, bajoMinimo: 1, sinInicial: 1 });
    assert.deepEqual(i.categorias, [
      { categoria: "Bebidas", productos: 2, unidades: 26, valor: usd("1400") },
      { categoria: "Golosinas", productos: 3, unidades: 3, valor: usd("300") },
    ]);
    assert.equal(i.encabezado.generadoPor, "Abigail Karam");
  });

  test("la monitora no ve los reportes", async () => {
    const r = await local.app.reportes.inventario(ctxMonitora, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });
});
