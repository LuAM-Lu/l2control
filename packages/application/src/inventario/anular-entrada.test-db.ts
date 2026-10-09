/**
 * Anular una entrada de mercancía mal cargada, contra l2control_test — B9-12 (M-34).
 *
 * Lo que fijan: cada línea sale a su costo de esa entrada y el costo promedio se recalcula; la entrada queda anulada
 * con quién, quién autorizó y por qué (nada se borra); si ya se vendió o se sacó algo desde entonces, se niega y dice
 * cuánto; un inventario inicial anulado deja el producto «Sin inventario inicial» y se vuelve a contar; supervisión
 * necesita el PIN de administración y la caja no anula. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-09T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxSupervisor: Contexto;
let ctxCajera: Contexto;
let admin: string;
const ids: Record<string, string> = {};

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const conPin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Revisado con la factura" });
const producto = async (nombre: string) => (await local.app.productos.leer(ctxAdmin)).productos.find((p) => p.id === ids[nombre])!;
const linea = (nombre: string, bultos: number, porBulto: number, minorPorBulto: string) => ({ productId: ids[nombre]!, bultos, unidadesPorBulto: porBulto, costo: { por: "BULTO", minor: minorPorBulto } });
const entrar = (tipo: "COMPRA" | "INICIAL", lineas: unknown[], cuando: number) => local.app.entradas.registrar(ctxAdmin, { idempotencyKey: randomUUID(), tipo, lineas }, cuando);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Anular entradas");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Depósito"), supervisor, "5937");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  for (const nombre of ["Refresco", "Malta", "Chupeta", "Galleta"]) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "150" } }, AHORA - 60 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
});

after(async () => {
  await local.cerrar();
});

describe("anular una entrada (B9-12)", () => {
  test("cada línea sale a su costo de esa entrada y el promedio se recalcula; queda anulada, con quién y por qué", async () => {
    // Una compra mal cargada (refrescos a $ 0,50 y maltas a $ 0,75) y otra bien (refrescos a $ 1,00).
    const mala = valor(await entrar("COMPRA", [linea("Refresco", 1, 24, "1200"), linea("Malta", 1, 12, "900")], AHORA - 30 * MIN));
    valor(await entrar("COMPRA", [linea("Refresco", 1, 24, "2400")], AHORA - 20 * MIN));
    assert.equal((await producto("Refresco")).costoPromedio?.minor, "75");
    const anulada = valor(await local.app.entradas.anular(ctxAdmin, { entryId: mala.id, motivo: "Se cargó la factura de otro local" }, conPin(), AHORA));
    assert.equal(anulada.anulada?.por, "Abigail Karam");
    assert.equal(anulada.anulada?.autorizo, "Abigail Karam");
    assert.equal(anulada.anulada?.motivo, "Se cargó la factura de otro local");
    const refresco = await producto("Refresco");
    assert.equal(refresco.existencia, 24);
    assert.equal(refresco.costoPromedio?.minor, "100");
    assert.equal((await producto("Malta")).existencia, 0);
    // Los movimientos quedan: la entrada y su reverso, al mismo costo.
    const movs = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findMany({ where: { productId: ids.Malta! }, orderBy: { at: "asc" } }));
    assert.deepEqual(
      movs.map((m) => [m.kind, m.quantity, String(m.valueMinor)]),
      [
        ["ENTRADA", 12, "900"],
        ["ANULACION", -12, "-900"],
      ],
    );
    // Se ve anulada en la lista; una segunda vez, no.
    assert.ok(valor(await local.app.entradas.leer(ctxAdmin)).entradas.find((e) => e.id === mala.id)?.anulada);
    const otra = await local.app.entradas.anular(ctxAdmin, { entryId: mala.id, motivo: "Otra vez" }, conPin(), AHORA + MIN);
    assert.equal(!otra.ok && otra.motivo, "CONFLICTO");
  });

  test("si ya se vendió o se sacó algo desde la entrada, se niega y dice cuánto", async () => {
    const e = valor(await entrar("COMPRA", [linea("Chupeta", 1, 10, "500")], AHORA - 10 * MIN));
    valor(await local.app.salidas.salida(ctxAdmin, { idempotencyKey: randomUUID(), motivo: "MERMA", lineas: [{ productId: ids.Chupeta!, cantidad: 2 }] }, conPin(), AHORA - 5 * MIN));
    const r = await local.app.entradas.anular(ctxAdmin, { entryId: e.id, motivo: "Mal cargada" }, conPin(), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /De Chupeta ya salieron 2 desde esta entrada/);
    assert.equal((await producto("Chupeta")).existencia, 8);
  });

  test("un inventario inicial anulado deja el producto sin inventario inicial, y se vuelve a contar", async () => {
    const inicial = valor(await entrar("INICIAL", [linea("Galleta", 1, 30, "900")], AHORA - 10 * MIN));
    assert.ok((await producto("Galleta")).inventarioInicialEl);
    valor(await local.app.entradas.anular(ctxAdmin, { entryId: inicial.id, motivo: "Se contó el depósito equivocado" }, conPin(), AHORA));
    const g = await producto("Galleta");
    assert.equal(g.existencia, 0);
    assert.equal(g.inventarioInicialEl, null);
    // Se vuelve a contar: arranca de nuevo.
    valor(await entrar("INICIAL", [linea("Galleta", 1, 12, "360")], AHORA + MIN));
    assert.equal((await producto("Galleta")).existencia, 12);
    assert.ok((await producto("Galleta")).inventarioInicialEl);
  });

  test("supervisión necesita el PIN de administración; la caja no anula; lo anotado no se corrige ni se borra", async () => {
    const e = valor(await entrar("COMPRA", [linea("Refresco", 1, 6, "600")], AHORA + 2 * MIN));
    const sinPin = await local.app.entradas.anular(ctxSupervisor, { entryId: e.id, motivo: "Mal cargada" }, undefined, AHORA + 3 * MIN);
    assert.notEqual(sinPin.ok, true);
    const caja = await local.app.entradas.anular(ctxCajera, { entryId: e.id, motivo: "Mal cargada" }, conPin(), AHORA + 3 * MIN);
    assert.equal(!caja.ok && caja.motivo, "NO_PERMITIDO");
    valor(await local.app.entradas.anular(ctxSupervisor, { entryId: e.id, motivo: "Mal cargada" }, conPin(), AHORA + 3 * MIN));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockEntryVoid.updateMany({ data: { reason: "cambiado" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockEntryVoid.deleteMany({})));
  });
});

describe("vigentes, anuladas y por periodo (B9-13)", () => {
  const leer = (consulta: unknown) => local.app.entradas.leer(ctxAdmin, consulta);

  test("se filtran por estado y por días del local, y se pagina; ocultar no borra", async () => {
    const vieja = valor(await entrar("COMPRA", [linea("Galleta", 1, 10, "500")], Date.parse("2026-09-15T15:00:00.000Z")));
    const todas = valor(await leer({}));
    const vigentes = valor(await leer({ estado: "VIGENTES" }));
    const anuladas = valor(await leer({ estado: "ANULADAS" }));
    assert.equal(todas.total, vigentes.total + anuladas.total);
    assert.ok(anuladas.total >= 1 && anuladas.entradas.every((e) => e.anulada));
    assert.ok(vigentes.entradas.every((e) => !e.anulada));
    assert.deepEqual([todas.vigentes, todas.anuladas], [vigentes.total, anuladas.total]);
    // Por periodo, en días del local: septiembre trae solo la vieja; octubre, no.
    assert.deepEqual(valor(await leer({ desde: "2026-09-01", hasta: "2026-09-30" })).entradas.map((e) => e.id), [vieja.id]);
    assert.ok(!valor(await leer({ desde: "2026-10-01", hasta: "2026-10-31" })).entradas.some((e) => e.id === vieja.id));
    // Un periodo sin entradas está vacío, pero la sucursal sí tiene.
    const nada = valor(await leer({ desde: "2026-08-01", hasta: "2026-08-02" }));
    assert.deepEqual([nada.total, nada.entradas.length, nada.existe], [0, 0, true]);
    // Páginas de 20, de la más nueva a la más vieja; una que no existe da la última.
    for (let i = 0; i < 21; i++) valor(await entrar("COMPRA", [linea("Chupeta", 1, 1, "10")], Date.parse("2026-08-10T15:00:00.000Z") + i * MIN));
    const dia = { desde: "2026-08-10", hasta: "2026-08-10" };
    const p1 = valor(await leer(dia));
    const p2 = valor(await leer({ ...dia, pagina: 2 }));
    assert.deepEqual([p1.total, p1.entradas.length, p2.entradas.length, p2.pagina], [21, 20, 1, 2]);
    assert.ok(p1.entradas[0]!.recibidaEn > p2.entradas[0]!.recibidaEn);
    assert.equal(valor(await leer({ ...dia, pagina: 9 })).pagina, 2);
    // Un filtro al revés no se lee.
    const mal = await leer({ desde: "2026-10-31", hasta: "2026-10-01" });
    assert.equal(!mal.ok && mal.motivo, "INVALIDO");
  });
});
