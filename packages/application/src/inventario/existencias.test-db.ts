/**
 * Las existencias contra l2control_test — B9-2, F8-05, I-10, ADR-023.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas): el precio del catálogo y el
 * IVA del cobro dependen de él. Corre con `pnpm test:db`.
 *
 * La existencia de partida entra con una entrada de mercancía (B9-3), como en el local.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, planoDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxCajera: Contexto;
let ctxMesero: Contexto;
const ids: Record<string, string> = {};

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

const PRECIOS: Record<string, string> = { Refresco: "150", Chupeta: "50", Jugo: "200", Galleta: "100", Café: "120" };
const linea = (nombre: string) => ({
  id: randomUUID(),
  concept: nombre,
  kind: "RESTAURANTE" as const,
  amount: usd(PRECIOS[nombre]!),
  paid: false,
  productId: ids[nombre]!,
  taxCode: "GENERAL" as const,
});
const mostrador = (lines: unknown[]) => ({
  id: randomUUID(),
  kind: "MOSTRADOR",
  family: "Mostrador",
  mode: "PREPAGO",
  status: "POR_COBRAR",
  openedAt: new Date(AHORA).toISOString(),
  sessionIds: [],
  closedSessionIds: [],
  lines,
});
const guardar = (cuenta: unknown, ctx: Contexto = ctxCajera) => local.app.cuentas.guardar(ctx, { cuenta }, AHORA);
const abrir = async (cuenta: unknown, ctx: Contexto = ctxCajera) => valor(await guardar(cuenta, ctx));

/** La existencia que enseña el catálogo (`null` si el producto no lleva). */
const existencia = async (nombre: string) => valor({ ok: true, valor: await local.app.productos.leer(ctxCajera) }).productos.find((p) => p.id === ids[nombre])!.existencia;
const movimientosDe = (accountId: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findMany({ where: { accountId }, orderBy: [{ accountVersion: "asc" }, { productId: "asc" }] }));

/** Mete `n` unidades de partida con una reposición, a $ 0,50 cada una. */
async function cargar(nombre: string, n: number): Promise<void> {
  valor(
    await local.app.entradas.registrar(
      local.sistema,
      { idempotencyKey: randomUUID(), tipo: "REPOSICION", lineas: [{ productId: ids[nombre]!, bultos: n, unidadesPorBulto: 1, costoBultoMinor: "50" }] },
      AHORA - MIN,
    ),
  );
}

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Existencias");
  otro = await abrirLocalDePrueba(URL_APP, "Existencias de otro");
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const mesero = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Salón"), mesero, "3175");
  await planoDePrueba(local);
  valor(
    await local.app.turnos.abrir(
      ctxCajera,
      { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] },
      AHORA - 2 * MIN,
    ),
  );
  valor(await local.app.impuestos.programar(local.sistema, { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY }, AHORA - 10 * MIN));
  // El IGTF al 0 %, como en el local (V-13): sin él no se cobra en divisas.
  valor(await local.app.impuestos.programar(local.sistema, { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY }, AHORA - 10 * MIN));
  for (const [nombre, precioMinor] of Object.entries(PRECIOS)) {
    const tipo = nombre !== "Café" ? ("PRODUCTO" as const) : ("PREPARADO" as const); // un café hecho al momento no lleva existencia
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Mostrador", taxCode: "GENERAL", tipo, precioMinor } }, AHORA - 5 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("sin existencia no se vende (ADR-023 §3)", () => {
  test("una venta de lo que no hay se rechaza señalando su línea, y no deja nada escrito", async () => {
    assert.equal(await existencia("Refresco"), 0);
    const cuenta = mostrador([linea("Café"), linea("Refresco")]);
    const r = await guardar(cuenta);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.match(!r.ok ? r.mensaje : "", /Sin existencia de Refresco: no queda ninguno/);
    assert.deepEqual(!r.ok && r.problemas?.[0]?.path, ["cuenta", "lines", 1]);
    assert.match((!r.ok && r.problemas?.[0]?.message) || "", /^SIN_EXISTENCIA/);
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.account.findUnique({ where: { id: cuenta.id } }));
    assert.equal(fila, null);
  });

  test("tampoco en la tablet del mesero", async () => {
    const mesa = { ...mostrador([linea("Galleta")]), kind: "MESA", family: "Mesa 3", status: "ABIERTA", tableId: "mesa-3", tableLabel: "3" };
    const r = await guardar(mesa, ctxMesero);
    assert.match(!r.ok ? r.mensaje : "", /Sin existencia de Galleta/);
  });

  test("lo que no lleva existencia se vende sin ella y no deja movimientos", async () => {
    const c = await abrir(mostrador([linea("Café"), linea("Café")]));
    assert.equal(await existencia("Café"), null);
    assert.deepEqual(await movimientosDe(c.id), []);
  });
});

describe("la existencia sale al entrar en la cuenta", () => {
  test("la venta descuenta en la transacción de la cuenta y quitar sin pagar la devuelve, cada cosa con su movimiento", async () => {
    await cargar("Refresco", 3);
    const c = await abrir(mostrador([linea("Refresco"), linea("Refresco"), linea("Café")]));
    assert.equal(await existencia("Refresco"), 1);
    const sinUna = await abrir({ ...c, lines: c.lines.filter((l) => l.id !== c.lines[0]!.id) });
    assert.equal(await existencia("Refresco"), 2);
    const movs = await movimientosDe(c.id);
    assert.deepEqual(
      movs.map((m) => [m.kind, m.quantity, m.accountVersion, m.productId, m.createdByName]),
      [
        ["VENTA", -2, 1, ids.Refresco, "Marisol Prieto"],
        ["DEVOLUCION", 1, sinUna.version, ids.Refresco, "Marisol Prieto"],
      ],
    );
    // Cada movimiento deja su asiento, que cuenta el cambio en vivo (tema «catalogo»).
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "existencia.mover", entityId: c.id } }));
    assert.equal(asientos.length, 2);
  });

  test("un reintento del alta o guardar lo mismo no descuenta dos veces", async () => {
    await cargar("Chupeta", 5);
    const nueva = mostrador([linea("Chupeta"), linea("Chupeta")]);
    const a = await abrir(nueva);
    await abrir(nueva);
    await abrir(a);
    assert.equal(await existencia("Chupeta"), 3);
    assert.equal((await movimientosDe(a.id)).length, 1);
  });

  test("dos ventas a la vez no venden la última unidad dos veces", async () => {
    const hay = (await existencia("Chupeta"))!;
    // Deja una sola unidad y la piden dos cajas a la vez.
    if (hay > 1) await abrir(mostrador(Array.from({ length: hay - 1 }, () => linea("Chupeta"))));
    assert.equal(await existencia("Chupeta"), 1);
    const [a, b] = await Promise.all([guardar(mostrador([linea("Chupeta")])), guardar(mostrador([linea("Chupeta")]))]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, JSON.stringify([a, b]));
    assert.equal([a, b].filter((r) => !r.ok && /Sin existencia/.test(r.mensaje)).length, 1);
    assert.equal(await existencia("Chupeta"), 0);
  });

  test("cobrar no mueve la existencia: ya salió al entrar en la cuenta", async () => {
    await cargar("Jugo", 2);
    const c: FamilyAccountDto = await abrir(mostrador([linea("Jugo")]));
    valor(
      await local.app.cuentas.cobrar(
        ctxCajera,
        {
          idempotencyKey: randomUUID(),
          accountId: c.id,
          version: c.version,
          lineIds: c.lines.map((l) => l.id),
          total: usd("232"), // $ 2,00 + IVA 16 %
          pagos: [{ method: "EFECTIVO_USD", amount: usd("232") }],
          destinoSobra: "VUELTO",
        },
        AHORA,
      ),
    );
    assert.equal(await existencia("Jugo"), 1);
    assert.equal((await movimientosDe(c.id)).length, 1);
  });

  test("la existencia es de la sucursal: otro local no ve la de este", async () => {
    const r = await otro.app.productos.leer(otro.sistema);
    assert.ok(!r.productos.some((p) => p.id === ids.Refresco));
    const n = await otro.base.conTenant(otro.sistema.tenantId, (tx) => tx.stockMovement.count());
    assert.equal(n, 0);
  });
});

describe("lo que entró antes de llevarse la existencia", () => {
  test("una cuenta no devuelve al estante lo que nunca sacó", async () => {
    // La galleta se vendía sin existencia; con unidades ya en una cuenta, se le enciende el control.
    const c = await abrir(mostrador([linea("Café")]));
    valor(await local.app.productos.aplicar(local.sistema, { kind: "EDITAR", productId: ids.Galleta!, nombre: "Galleta", categoria: "Mostrador", taxCode: "GENERAL", tipo: "PREPARADO", codigoBarras: null, presentacion: null }, AHORA - MIN));
    const conGalletas = await abrir({ ...c, lines: [...c.lines, linea("Galleta"), linea("Galleta")] });
    valor(await local.app.productos.aplicar(local.sistema, { kind: "EDITAR", productId: ids.Galleta!, nombre: "Galleta", categoria: "Mostrador", taxCode: "GENERAL", tipo: "PRODUCTO", codigoBarras: null, presentacion: null }, AHORA - MIN));
    assert.equal(await existencia("Galleta"), 0);
    // Quitar una no pone en el estante una galleta que nunca salió de él.
    await abrir({ ...conGalletas, lines: conGalletas.lines.filter((l) => l.id !== conGalletas.lines.at(-1)!.id) });
    assert.equal(await existencia("Galleta"), 0);
    assert.deepEqual(await movimientosDe(c.id), []);
  });
});
