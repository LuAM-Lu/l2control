/**
 * El catálogo sin existencias y su conteo inicial contra l2control_test — B9-7, M-28.
 *
 * Lo que fijan: el catálogo se da de alta en una hoja, sin cantidades, todos o ninguno; lo que se cuenta
 * nace «Sin inventario inicial» (distinto de agotado) y no se vende; el inventario inicial es solo de lo
 * que falta, admite lo que se contó en cero y deja su fecha; una compra o un conteo también lo arrancan;
 * lo cargado antes (o con la versión anterior) cuenta como arrancado; y la puesta a punto cuenta los
 * pendientes. Con reloj fijo (jueves 8 de octubre de 2026, 10:00 am en Caracas). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CatalogoDto, ProductoDto } from "@l2/contracts";
import { stockStatus } from "@l2/domain-inventory";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-08T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxAdminElevado: Contexto;
let ctxSupervisor: Contexto;
let ctxCajera: Contexto;
let admin: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const ficha = (nombre: string, extra: Record<string, unknown> = {}) => ({ nombre, categoria: "Golosinas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "100", ...extra });
const catalogo = () => local.app.productos.leer(ctxAdmin);
const de = (c: CatalogoDto, nombre: string): ProductoDto => c.productos.find((p) => p.nombre === nombre)!;
const estadoDe = (p: ProductoDto) => stockStatus(p.existencia!, p.minimo, p.inventarioInicialEl !== null);
const unidad = (productId: string, n: number) => ({ productId, bultos: n, unidadesPorBulto: 1, costo: { por: "UNIDAD", minor: "40" } });
const inicial = (lineas: unknown[], enCero: string[] = []) => ({ idempotencyKey: randomUUID(), tipo: "INICIAL", lineas, ...(enCero.length > 0 ? { enCero } : {}) });
const arranqueDe = (productId: string) => local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockStart.findMany({ where: { productId } }));

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Inventario inicial");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxAdminElevado = await contextoElevado(local, await crearEquipo(local, "Oficina elevada"), { id: admin, nombre: "Abigail Karam", pin: "4826" });
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Depósito"), supervisor, "5937");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
});

after(async () => {
  await local.cerrar();
});

describe("el catálogo se da de alta en una hoja, sin cantidades", () => {
  test("cada uno nace con su ficha y su mínimo, sin inventario inicial: no agotado", async () => {
    const c = valor(
      await local.app.productos.altaEnLote(
        ctxAdmin,
        {
          productos: [
            ficha("Chupeta de fresa", { presentacion: "Unidad 12 g", minimo: 20, codigoBarras: "4006381333931" }),
            ficha("Gomitas", { taxCode: "EXENTA", precioMinor: "250" }),
            ficha("Jugo de naranja", { categoria: "Jugos de caja" }), // una categoría nueva entra en la lista
          ],
        },
        AHORA,
      ),
    );
    const chupeta = de(c, "Chupeta de fresa");
    assert.deepEqual(
      [chupeta.tipo, chupeta.existencia, chupeta.inventarioInicialEl, chupeta.minimo, chupeta.codigoBarras, chupeta.presentacion, chupeta.activo],
      ["PRODUCTO", 0, null, 20, "4006381333931", "Unidad 12 g", true],
    );
    assert.equal(estadoDe(chupeta), "SIN_INICIAL");
    assert.equal(de(c, "Gomitas").taxCode, "EXENTA");
    assert.ok(c.categorias.some((x) => x.nombre === "Jugos de caja"));
    // Cada producto deja su asiento, con su mínimo.
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "producto.crear", entityId: chupeta.id } }));
    assert.equal((asientos[0]?.after as { minimo?: number }).minimo, 20);
  });

  test("todos o ninguno: un nombre que ya existe deshace el lote y señala su fila", async () => {
    const r = await local.app.productos.altaEnLote(ctxAdmin, { productos: [ficha("Caramelos"), ficha("gomitas")] }, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.deepEqual(!r.ok && r.problemas?.[0]?.path, ["productos", 1, "nombre"]);
    assert.equal((await catalogo()).productos.some((p) => p.nombre === "Caramelos"), false, "la primera fila no quedó creada");
  });

  test("un código de barras ajeno o mal leído tampoco entra", async () => {
    const ajeno = await local.app.productos.altaEnLote(ctxAdmin, { productos: [ficha("Caramelos", { codigoBarras: "4006381333931" })] }, AHORA);
    assert.match(!ajeno.ok ? ajeno.mensaje : "", /Chupeta de fresa/);
    const torcido = await local.app.productos.altaEnLote(ctxAdmin, { productos: [ficha("Caramelos", { codigoBarras: "4006381333932" })] }, AHORA);
    assert.deepEqual(!torcido.ok && torcido.problemas?.[0]?.path, ["productos", 0, "codigoBarras"]);
  });

  test("la caja no da de alta, y el intento queda en la auditoría", async () => {
    const r = await local.app.productos.altaEnLote(ctxCajera, { productos: [ficha("Caramelos")] }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negado = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.count({ where: { action: "producto.crear", outcome: "NEGADO" } }));
    assert.ok(negado >= 1);
  });

  test("una hoja de 300 productos entra de una vez", async () => {
    const productos = Array.from({ length: 300 }, (_, i) => ficha(`Lote ${String(i + 1).padStart(3, "0")}`, { categoria: "Lote" }));
    const desde = performance.now();
    const c = valor(await local.app.productos.altaEnLote(ctxAdmin, { productos }, AHORA + MIN));
    const ms = performance.now() - desde;
    assert.equal(c.productos.filter((p) => p.categoria === "Lote" && p.inventarioInicialEl === null).length, 300);
    // La transacción tiene 5 s: con holgura, para un servidor más lento que el de pruebas.
    assert.ok(ms < 2500, `tardó ${Math.round(ms)} ms`);
  });
});

describe("el inventario inicial trae solo los que faltan", () => {
  test("lo contado arranca con su fecha; lo contado en cero queda agotado, no pendiente", async () => {
    const c = await catalogo();
    const chupeta = de(c, "Chupeta de fresa").id;
    const gomitas = de(c, "Gomitas").id;
    const e = valor(await local.app.entradas.registrar(ctxSupervisor, inicial([unidad(chupeta, 30)], [gomitas]), AHORA + 2 * MIN));
    assert.deepEqual(e.enCero, [{ productId: gomitas, nombre: "Gomitas" }]);
    const despues = await catalogo();
    assert.deepEqual([de(despues, "Chupeta de fresa").existencia, de(despues, "Chupeta de fresa").inventarioInicialEl], [30, new Date(AHORA + 2 * MIN).toISOString()]);
    assert.equal(estadoDe(de(despues, "Gomitas")), "AGOTADO");
    assert.equal(de(despues, "Gomitas").inventarioInicialEl, new Date(AHORA + 2 * MIN).toISOString());
    // El arranque cita su entrada y dice lo contado, también el cero.
    assert.deepEqual((await arranqueDe(gomitas)).map((a) => [a.quantity, a.entryId]), [[0, e.id]]);
    assert.deepEqual((await arranqueDe(chupeta)).map((a) => [a.quantity, a.entryId]), [[30, e.id]]);
    // La entrada lo cuenta en la auditoría y en la lista de entradas.
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "inventario.entrada", entityId: e.id } }));
    assert.deepEqual((asiento?.after as { enCero?: string[] }).enCero, ["Gomitas"]);
    assert.ok(valor(await local.app.entradas.leer(ctxSupervisor)).entradas.some((x) => x.id === e.id && x.enCero.length === 1));
  });

  test("lo que ya tiene su inventario inicial se corrige con un conteo, y nada de la entrada queda", async () => {
    const c = await catalogo();
    const chupeta = de(c, "Chupeta de fresa").id;
    const jugo = de(c, "Jugo de naranja").id;
    const r = await local.app.entradas.registrar(ctxSupervisor, inicial([unidad(jugo, 12), unidad(chupeta, 5)]), AHORA + 3 * MIN);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    assert.match(!r.ok ? r.mensaje : "", /«Chupeta de fresa» ya tiene inventario inicial: lo que falte o sobre se corrige con un conteo/);
    assert.deepEqual(!r.ok && r.problemas?.map((p) => [p.path, p.message]), [[["lineas", 1, "productId"], "YA_TIENE_INVENTARIO_INICIAL"]]);
    const enCero = await local.app.entradas.registrar(ctxSupervisor, inicial([], [de(c, "Gomitas").id]), AHORA + 3 * MIN);
    assert.deepEqual(!enCero.ok && enCero.problemas?.[0]?.path, ["enCero", 0]);
    // El jugo sigue pendiente: la entrada se deshizo entera.
    assert.equal(de(await catalogo(), "Jugo de naranja").inventarioInicialEl, null);
    assert.equal(de(await catalogo(), "Chupeta de fresa").existencia, 30);
  });

  test("un nuevo de la entrada nace y arranca en el mismo inventario inicial", async () => {
    const e = valor(
      await local.app.entradas.registrar(
        ctxAdminElevado,
        inicial([{ nuevo: { nombre: "Malta en lata", categoria: "Bebidas", taxCode: "GENERAL", precioMinor: "175" }, bultos: 6, unidadesPorBulto: 1, costo: { por: "UNIDAD", minor: "90" } }]),
        AHORA + 4 * MIN,
      ),
    );
    const malta = de(await catalogo(), "Malta en lata");
    assert.deepEqual([malta.existencia, malta.inventarioInicialEl], [6, new Date(AHORA + 4 * MIN).toISOString()]);
    assert.deepEqual((await arranqueDe(malta.id)).map((a) => a.entryId), [e.id]);
  });
});

describe("también lo arrancan una compra o un conteo", () => {
  test("una compra de algo pendiente es su arranque: ya tuvo existencia", async () => {
    const jugo = de(await catalogo(), "Jugo de naranja").id;
    const e = valor(await local.app.entradas.registrar(ctxSupervisor, { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [unidad(jugo, 24)] }, AHORA + 5 * MIN));
    assert.equal(de(await catalogo(), "Jugo de naranja").inventarioInicialEl, new Date(AHORA + 5 * MIN).toISOString());
    assert.deepEqual((await arranqueDe(jugo)).map((a) => [a.quantity, a.entryId]), [[24, e.id]]);
    // Otra compra no vuelve a arrancarlo.
    valor(await local.app.entradas.registrar(ctxSupervisor, { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [unidad(jugo, 6)] }, AHORA + 6 * MIN));
    assert.equal((await arranqueDe(jugo)).length, 1);
  });

  test("contarlo en el conteo es su inventario inicial, aunque se cuente en cero", async () => {
    const c = valor(await local.app.productos.altaEnLote(ctxAdmin, { productos: [ficha("Caramelos"), ficha("Turrón")] }, AHORA + 7 * MIN));
    const caramelos = de(c, "Caramelos").id;
    const turron = de(c, "Turrón").id;
    const conteo = valor(
      await local.app.salidas.conteo(
        ctxAdmin,
        { idempotencyKey: randomUUID(), lineas: [{ productId: caramelos, esperado: 0, contado: 0 }, { productId: turron, esperado: 0, contado: 8 }] },
        { autorizadorId: admin, pin: "4826", motivo: "Conteo de arranque" },
        AHORA + 8 * MIN,
      ),
    );
    const despues = await catalogo();
    assert.equal(estadoDe(de(despues, "Caramelos")), "AGOTADO");
    assert.deepEqual([de(despues, "Turrón").existencia, de(despues, "Turrón").inventarioInicialEl], [8, new Date(AHORA + 8 * MIN).toISOString()]);
    assert.deepEqual((await arranqueDe(caramelos)).map((a) => [a.quantity, a.adjustmentId]), [[0, conteo.id]]);
  });

  test("lo cargado con la versión anterior cuenta como arrancado, desde su primer movimiento (ADR-028)", async () => {
    const c = valor(await local.app.productos.altaEnLote(ctxAdmin, { productos: [ficha("Galleta de avena")] }, AHORA + 9 * MIN));
    const galleta = de(c, "Galleta de avena").id;
    // La versión anterior asienta la entrada y su movimiento, sin arranque.
    await local.base.conTenant(local.sistema.tenantId, async (tx) => {
      const entrada = await tx.stockEntry.create({
        data: { tenantId: local.sistema.tenantId, branchId: local.sistema.branchId, kind: "COMPRA", operationKey: randomUUID(), receivedAt: new Date(AHORA + 10 * MIN), createdByName: "Versión anterior" },
      });
      await tx.stockMovement.create({
        data: {
          tenantId: local.sistema.tenantId,
          branchId: local.sistema.branchId,
          productId: galleta,
          quantity: 10,
          kind: "ENTRADA",
          valueMinor: 400n,
          entryId: entrada.id,
          packs: 10,
          packSize: 1,
          at: new Date(AHORA + 10 * MIN),
          createdByName: "Versión anterior",
        },
      });
    });
    assert.equal(de(await catalogo(), "Galleta de avena").inventarioInicialEl, new Date(AHORA + 10 * MIN).toISOString());
    // Y el inventario inicial ya no la acepta.
    const r = await local.app.entradas.registrar(ctxSupervisor, inicial([unidad(galleta, 3)]), AHORA + 11 * MIN);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "YA_TIENE_INVENTARIO_INICIAL");
  });
});

describe("la puesta a punto cuenta los pendientes", () => {
  test("mientras falte uno, el punto sigue abierto y dice cuántos; contados todos, se tacha", async () => {
    const punto = async () => valor(await local.app.puestaAPunto.leer(ctxAdminElevado)).puntos.find((p) => p.id === "existencias")!;
    const antes = await punto();
    assert.equal(antes.hecho, false);
    assert.match(antes.detalle, /^300 productos sin inventario inicial de \d+: no se venden hasta contarlos$/);
    // Lo que no se va a vender se aparta: no cuenta como pendiente.
    const lote = (await catalogo()).productos.filter((p) => p.categoria === "Lote");
    for (const p of lote) valor(await local.app.productos.aplicar(ctxAdmin, { kind: "ACTIVAR", productId: p.id, activo: false }, AHORA + 12 * MIN));
    const despues = await punto();
    assert.equal(despues.hecho, true, despues.detalle);
    assert.match(despues.detalle, /todos tienen su inventario inicial/);
  });
});
