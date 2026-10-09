/**
 * Retirar un producto del catálogo, y devolverlo, contra l2control_test — B9-11 (M-34).
 *
 * Lo que fijan: retirar pide el PIN de administración y deja su asiento; con existencia, exige cómo sale y la saca en el
 * mismo paso, al costo; el catálogo lo marca retirado (y apartado) sin borrar su historia; devolverlo lo trae apartado;
 * un doble toque no retira dos veces; la caja no retira; la tabla es de solo agregar. Corre con `pnpm test:db`.
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
let ctxCajera: Contexto;
let admin: string;
const ids: Record<string, string> = {};

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const motivoDe = (r: { ok: boolean; motivo?: string; problemas?: readonly { message: string }[] | undefined }) => (r.ok ? "OK" : (r.problemas?.[0]?.message ?? r.motivo));
const conPinDeAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Creado por error en la carga" });
const producto = async (nombre: string) => (await local.app.productos.leer(ctxAdmin)).productos.find((p) => p.id === ids[nombre])!;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Retiro de productos");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  for (const [nombre, tipo] of [["Refresco duplicado", "PRODUCTO"], ["Torta de prueba", "PREPARADO"]] as const) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo, precioMinor: "150" } }, AHORA - 5 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  // 24 refrescos a $ 0,50 en su inventario inicial.
  valor(
    await local.app.entradas.registrar(
      local.sistema,
      { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId: ids["Refresco duplicado"]!, bultos: 1, unidadesPorBulto: 24, costo: { por: "BULTO", minor: "1200" } }] },
      AHORA - 2 * MIN,
    ),
  );
});

after(async () => {
  await local.cerrar();
});

describe("retirar un producto (B9-11)", () => {
  test("con existencia, pide cómo sale; con ella, la saca al costo en el mismo paso y queda retirado y apartado", async () => {
    const cmd = { idempotencyKey: randomUUID(), productId: ids["Refresco duplicado"]!, motivo: "Duplicado de la carga inicial" };
    assert.equal(motivoDe(await local.app.retiro.retirar(ctxAdmin, cmd, conPinDeAdmin(), AHORA)), "TIENE_EXISTENCIA");
    const hecho = valor(await local.app.retiro.retirar(ctxAdmin, { ...cmd, salida: "DEVOLUCION_PROVEEDOR" }, conPinDeAdmin(), AHORA));
    assert.equal(hecho.unidadesSacadas, 24);
    const p = await producto("Refresco duplicado");
    assert.equal(p.retirado, true);
    assert.equal(p.activo, false);
    assert.equal(p.existencia, 0);
    // Su historia queda: la entrada y la salida del retiro, con su valor al costo.
    const movs = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.findMany({ where: { productId: ids["Refresco duplicado"]! }, orderBy: { at: "asc" } }));
    assert.deepEqual(
      movs.map((m) => [m.kind, m.quantity, String(m.valueMinor)]),
      [
        ["ENTRADA", 24, "1200"],
        ["SALIDA", -24, "-1200"],
      ],
    );
    // Un doble toque devuelve lo mismo; retirarlo otra vez con otra clave, no.
    assert.equal(valor(await local.app.retiro.retirar(ctxAdmin, { ...cmd, salida: "DEVOLUCION_PROVEEDOR" }, conPinDeAdmin(), AHORA)).retirado, true);
    assert.equal(motivoDe(await local.app.retiro.retirar(ctxAdmin, { ...cmd, idempotencyKey: randomUUID() }, conPinDeAdmin(), AHORA)), "CONFLICTO");
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "producto.retirar", entityId: ids["Refresco duplicado"]! } }));
    assert.equal(asientos.length, 1);
  });

  test("sin existencia (un preparado), se retira sin salida; devolverlo lo trae apartado", async () => {
    const r = valor(await local.app.retiro.retirar(ctxAdmin, { idempotencyKey: randomUUID(), productId: ids["Torta de prueba"]!, motivo: "Ya no se hace" }, conPinDeAdmin(), AHORA));
    assert.equal(r.unidadesSacadas, 0);
    assert.equal((await producto("Torta de prueba")).retirado, true);
    valor(await local.app.retiro.devolver(ctxAdmin, { productId: ids["Torta de prueba"]!, motivo: "Vuelve en temporada" }, conPinDeAdmin(), AHORA + MIN));
    const p = await producto("Torta de prueba");
    assert.equal(p.retirado, false);
    assert.equal(p.activo, false, "vuelve apartado: se pone a la venta aparte");
    assert.equal(motivoDe(await local.app.retiro.devolver(ctxAdmin, { productId: ids["Torta de prueba"]!, motivo: "Otra vez" }, conPinDeAdmin(), AHORA + 2 * MIN)), "CONFLICTO");
  });

  test("la caja no retira; sin PIN tampoco; lo anotado no se corrige ni se borra", async () => {
    const cmd = { idempotencyKey: randomUUID(), productId: ids["Torta de prueba"]!, motivo: "Prueba de permisos" };
    assert.equal(motivoDe(await local.app.retiro.retirar(ctxCajera, cmd, undefined, AHORA)), "NO_PERMITIDO");
    assert.notEqual(motivoDe(await local.app.retiro.retirar(ctxAdmin, cmd, undefined, AHORA)), "OK");
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.productRetirement.updateMany({ data: { reason: "cambiado" } })));
    await assert.rejects(local.base.conTenant(local.sistema.tenantId, (tx) => tx.productRetirement.deleteMany({})));
  });
});
