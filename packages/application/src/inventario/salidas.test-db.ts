/**
 * Salidas con motivo y conteo físico contra l2control_test — B9-4, F8-07, §7.3.
 *
 * Con reloj fijo (domingo 27 de septiembre de 2026, 10:00 am en Caracas). Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxAdmin: Contexto;
let ctxSupervisor: Contexto;
let ctxCajera: Contexto;
let admin: string;
let supervisor: string;
const ids: Record<string, string> = {};

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const pinDe = (autorizadorId: string, pin: string) => ({ autorizadorId, pin, motivo: "Revisado en el depósito" });
const conPinDeAdmin = () => pinDe(admin, "4826");
const existencia = async (nombre: string) => (await local.app.productos.leer(ctxAdmin)).productos.find((p) => p.id === ids[nombre])!.existencia!;
const valorDe = async (nombre: string) =>
  (await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockMovement.aggregate({ where: { productId: ids[nombre]! }, _sum: { valueMinor: true } })))._sum.valueMinor ?? 0n;
const salida = (lineas: { nombre: string; cantidad: number }[], extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  motivo: "MERMA",
  lineas: lineas.map((l) => ({ productId: ids[l.nombre]!, cantidad: l.cantidad })),
  ...extra,
});
const conteo = async (lineas: { nombre: string; contado: number; esperado?: number }[]) => ({
  idempotencyKey: randomUUID(),
  lineas: await Promise.all(lineas.map(async (l) => ({ productId: ids[l.nombre]!, esperado: l.esperado ?? (await existencia(l.nombre)), contado: l.contado }))),
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Salidas");
  otro = await abrirLocalDePrueba(URL_APP, "Salidas de otro");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxSupervisor = await contextoDe(local, await crearEquipo(local, "Depósito"), supervisor, "5937");
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), cajera, "7391");
  for (const [nombre, tipo] of [["Refresco", "PRODUCTO"], ["Malta", "PRODUCTO"], ["Café", "PREPARADO"]] as const) {
    const c = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre, categoria: "Bebidas", taxCode: "GENERAL", tipo, precioMinor: "150" } }, AHORA - 5 * MIN));
    ids[nombre] = c.productos.find((p) => p.nombre === nombre)!.id;
  }
  // 48 refrescos a $ 0,50 y 12 maltas a $ 0,75.
  valor(
    await local.app.entradas.registrar(
      local.sistema,
      {
        idempotencyKey: randomUUID(),
        tipo: "COMPRA",
        lineas: [
          { productId: ids.Refresco!, bultos: 2, unidadesPorBulto: 24, costo: { por: "BULTO", minor: "1200" } },
          { productId: ids.Malta!, bultos: 1, unidadesPorBulto: 12, costo: { por: "BULTO", minor: "900" } },
        ],
      },
      AHORA - 2 * MIN,
    ),
  );
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("una salida con motivo (F8-07)", () => {
  test("administración saca con su PIN: el movimiento al costo, el motivo y quién autorizó", async () => {
    const s = valor(await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Refresco", cantidad: 2 }], { detalle: "Latas abolladas" }), conPinDeAdmin(), AHORA));
    assert.equal(s.tipo, "SALIDA");
    assert.equal(s.motivo, "MERMA");
    assert.equal(s.detalle, "Latas abolladas");
    assert.equal(s.autorizadoPor, "Abigail Karam");
    assert.deepEqual(
      s.lineas.map((l) => [l.nombre, l.cantidad, l.valor.minor]),
      [["Refresco", -2, "-100"]],
    );
    assert.equal(await existencia("Refresco"), 46);
    const asiento = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "inventario.salida", entityId: s.id } }));
    assert.equal(asiento?.authorizedBy, admin);
    assert.equal(asiento?.reason, "MERMA");
  });

  test("ningún ajuste sin su autorización: sin PIN, con el PIN de otro o autorizándose a sí mismo, no", async () => {
    const sinPin = await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Refresco", cantidad: 1 }]), undefined, AHORA);
    assert.equal(!sinPin.ok && sinPin.motivo, "NO_PERMITIDO");
    const pinMalo = await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Refresco", cantidad: 1 }]), pinDe(admin, "0000"), AHORA);
    assert.equal(pinMalo.ok, false);
    // D-AUT: supervisión no se autoriza a sí misma un ajuste de inventario.
    const propio = await local.app.salidas.salida(ctxSupervisor, salida([{ nombre: "Refresco", cantidad: 1 }]), pinDe(supervisor, "5937"), AHORA);
    assert.equal(!propio.ok && propio.motivo, "NO_PERMITIDO");
    assert.equal(await existencia("Refresco"), 46);
    // Con la de administración, sí.
    const ok = valor(await local.app.salidas.salida(ctxSupervisor, salida([{ nombre: "Refresco", cantidad: 1 }], { motivo: "CONSUMO_INTERNO" }), conPinDeAdmin(), AHORA));
    assert.equal(ok.por, "Luis Guerrero");
    assert.equal(ok.autorizadoPor, "Abigail Karam");
    assert.equal(await existencia("Refresco"), 45);
  });

  test("la caja no saca inventario, ni lo ve; quien quiso queda en la auditoría", async () => {
    const r = await local.app.salidas.salida(ctxCajera, salida([{ nombre: "Refresco", cantidad: 1 }]), conPinDeAdmin(), AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const leer = await local.app.salidas.leer(ctxCajera);
    assert.equal(!leer.ok && leer.motivo, "NO_PERMITIDO");
    const rechazo = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { action: "inventario.salida", outcome: { not: "HECHO" } } }));
    assert.ok(rechazo);
  });

  test("no sale más de lo que hay, ni lo que no lleva existencia", async () => {
    const mucho = await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Malta", cantidad: 13 }]), conPinDeAdmin(), AHORA);
    assert.deepEqual(!mucho.ok && mucho.problemas?.[0]?.path, ["lineas", 0, "cantidad"]);
    assert.match(!mucho.ok ? mucho.mensaje : "", /quedan 12/);
    const cafe = await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Café", cantidad: 1 }]), conPinDeAdmin(), AHORA);
    assert.equal(!cafe.ok && cafe.problemas?.[0]?.message, "SIN_CONTROL_DE_STOCK");
    assert.equal(await existencia("Malta"), 12);
  });

  test("un doble clic no saca dos veces", async () => {
    const cmd = salida([{ nombre: "Refresco", cantidad: 1 }], { motivo: "REGALO" });
    const a = valor(await local.app.salidas.salida(ctxAdmin, cmd, conPinDeAdmin(), AHORA));
    const b = valor(await local.app.salidas.salida(ctxAdmin, cmd, conPinDeAdmin(), AHORA));
    assert.equal(a.id, b.id);
    assert.equal(await existencia("Refresco"), 44);
  });
});

describe("el conteo físico deja la existencia igual a lo contado", () => {
  test("lo que falta sale y lo que sobra entra, al costo, con lo esperado y lo contado a la vista", async () => {
    const c = valor(await local.app.salidas.conteo(ctxAdmin, await conteo([{ nombre: "Refresco", contado: 40 }, { nombre: "Malta", contado: 14 }]), conPinDeAdmin(), AHORA));
    assert.equal(await existencia("Refresco"), 40);
    assert.equal(await existencia("Malta"), 14);
    const porNombre = new Map(c.lineas.map((l) => [l.nombre, l]));
    assert.deepEqual([porNombre.get("Refresco")!.esperado, porNombre.get("Refresco")!.contado, porNombre.get("Refresco")!.cantidad], [44, 40, -4]);
    assert.equal(porNombre.get("Refresco")!.valor.minor, "-200"); // 4 × $ 0,50
    assert.equal(porNombre.get("Malta")!.valor.minor, "150"); // 2 × $ 0,75
    assert.ok(valor(await local.app.salidas.leer(ctxSupervisor)).ajustes.some((x) => x.id === c.id));
  });

  test("un conteo que cuadra queda registrado sin mover nada", async () => {
    const c = valor(await local.app.salidas.conteo(ctxAdmin, await conteo([{ nombre: "Refresco", contado: 40 }]), conPinDeAdmin(), AHORA));
    assert.deepEqual([c.lineas[0]!.cantidad, c.valor.minor], [0, "0"]);
    assert.equal(await existencia("Refresco"), 40);
  });

  test("si la existencia cambió mientras se contaba, no se ajusta a ciegas", async () => {
    const r = await local.app.salidas.conteo(ctxAdmin, await conteo([{ nombre: "Refresco", contado: 30, esperado: 41 }]), conPinDeAdmin(), AHORA);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /ahora el sistema dice 40/);
    assert.equal(await existencia("Refresco"), 40);
  });

  test("lo que aparece sin existencia entra al costo de su última entrada; sin costo no se inventa", async () => {
    valor(await local.app.salidas.salida(ctxAdmin, salida([{ nombre: "Malta", cantidad: 14 }], { motivo: "DEVOLUCION_PROVEEDOR" }), conPinDeAdmin(), AHORA));
    assert.equal(await existencia("Malta"), 0);
    assert.equal(await valorDe("Malta"), 0n);
    valor(await local.app.salidas.conteo(ctxAdmin, await conteo([{ nombre: "Malta", contado: 3 }]), conPinDeAdmin(), AHORA));
    assert.equal(await valorDe("Malta"), 225n); // 3 × $ 0,75
  });

  test("cada sucursal ve lo suyo", async () => {
    assert.deepEqual(valor(await otro.app.salidas.leer(otro.sistema)).ajustes, []);
  });
});
