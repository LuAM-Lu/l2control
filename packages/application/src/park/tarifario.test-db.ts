/**
 * El tarifario en el servidor, de punta a punta contra l2control_test: contrato, versión,
 * aislamiento y conflicto. Corre con `pnpm test:db` (necesita `pnpm infra:up`).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { conectar, type Aplicacion, type Contexto } from "../index.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let app: Aplicacion;
// Contexto de sistema: aquí se prueba el tarifario, no los permisos (eso, en identidad).
const A: Contexto = { tenantId: randomUUID(), branchId: randomUUID(), sistema: true };
const B: Contexto = { tenantId: randomUUID(), branchId: randomUUID(), sistema: true };

const paquete = (id: string, nombre: string, minutos: number | null, minor: string) => ({
  id,
  name: nombre,
  mode: minutos === null ? "POSTPAGO" : "PREPAGO",
  duration: minutos === null ? { kind: "openEnded" } : { kind: "fixed", minutes: minutos },
  price: { minor, currency: "USD" },
  active: true,
});
const tarifario = (precio30: string) => ({
  packages: [paquete("p30", "30 minutos", 30, precio30), paquete("libre", "Pase libre", null, "1200")],
  policy: {
    graceMinutes: 5,
    penaltyBlockMinutes: 15,
    penaltyPricePerBlock: { minor: "150", currency: "USD" },
    warnBeforeMinutes: 10,
    capacityLimit: 30,
  },
});

before(async () => {
  app = await conectar(URL_APP);
  await app.sucursal.asegurar(A, { tenant: "Prueba A", sucursal: "Principal" });
  await app.sucursal.asegurar(B, { tenant: "Prueba B", sucursal: "Principal" });
});

after(async () => {
  await borrarTenantsDePrueba(URL_APP, [A.tenantId, B.tenantId]);
  await app.cerrar();
});

describe("publicar y leer", () => {
  test("una sucursal que nunca publicó no tiene tarifario (y no se inventa uno)", async () => {
    assert.equal(await app.tarifario.leer(A), null);
  });

  test("la primera publicación es la versión 1 y es la que se lee", async () => {
    const r = await app.tarifario.publicar(A, tarifario("300"));
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.version, 1);
    const vigente = await app.tarifario.leer(A);
    assert.equal(vigente?.version, 1);
    assert.equal(vigente?.tarifario.packages[0]?.price.minor, "300");
  });

  test("publicar otra vez crea la versión 2 y la 1 sigue intacta debajo", async () => {
    const r = await app.tarifario.publicar(A, tarifario("350"));
    assert.ok(r.ok);
    assert.equal(r.valor.version, 2);
    assert.equal((await app.tarifario.leer(A))?.tarifario.packages[0]?.price.minor, "350");
  });

  test("el dinero viaja como texto en unidades menores, sin punto flotante", async () => {
    const vigente = await app.tarifario.leer(A);
    assert.equal(typeof vigente?.tarifario.policy.penaltyPricePerBlock.minor, "string");
  });
});

describe("el servidor revalida con el contrato", () => {
  test("un tarifario inválido se rechaza con sus problemas y no se guarda nada", async () => {
    const antes = await app.tarifario.leer(A);
    const malo = { ...tarifario("0"), policy: { ...tarifario("300").policy, warnBeforeMinutes: 45 } };
    const r = await app.tarifario.publicar(A, malo);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.motivo, "INVALIDO");
    const mensajes = r.problemas?.map((p) => p.message).join(" | ") ?? "";
    assert.match(mensajes, /precio mayor que cero/);
    assert.match(mensajes, /tiene que ser menor que el paquete más corto/);
    assert.equal((await app.tarifario.leer(A))?.version, antes?.version);
  });

  test("lo que no es un tarifario se rechaza igual (no confía en el navegador)", async () => {
    for (const basura of [null, "tarifario", { packages: "todos" }, { __proto__: { admin: true } }]) {
      const r = await app.tarifario.publicar(A, basura);
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
    }
  });
});

describe("aislamiento", () => {
  test("cada tenant ve solo su tarifario", async () => {
    await app.tarifario.publicar(B, tarifario("999"));
    assert.equal((await app.tarifario.leer(B))?.tarifario.packages[0]?.price.minor, "999");
    assert.equal((await app.tarifario.leer(A))?.tarifario.packages[0]?.price.minor, "350");
  });

  test("A no puede publicar en la sucursal de B", async () => {
    const r = await app.tarifario.publicar({ tenantId: A.tenantId, branchId: B.branchId, sistema: true }, tarifario("1"));
    assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    assert.equal((await app.tarifario.leer(B))?.tarifario.packages[0]?.price.minor, "999");
  });

  test("A tampoco puede leer el tarifario de B citando su sucursal", async () => {
    assert.equal(await app.tarifario.leer({ tenantId: A.tenantId, branchId: B.branchId, sistema: true }), null);
  });
});

describe("dos personas publican a la vez", () => {
  test("no se pisan: una gana y la otra recibe CONFLICTO, nunca dos versiones iguales", async () => {
    const resultados = await Promise.all(
      Array.from({ length: 5 }, (_, i) => app.tarifario.publicar(A, tarifario(String(400 + i)))),
    );
    const ganadoras = resultados.filter((r) => r.ok);
    const conflictos = resultados.filter((r) => !r.ok && r.motivo === "CONFLICTO");
    assert.ok(ganadoras.length >= 1, "al menos una tiene que entrar");
    assert.equal(ganadoras.length + conflictos.length, 5, JSON.stringify(resultados));
    const versiones = ganadoras.map((r) => (r.ok ? r.valor.version : 0));
    assert.equal(new Set(versiones).size, versiones.length, "versiones repetidas");
  });
});

describe("el historial de versiones (T-7)", () => {
  test("de la más nueva a la más vieja, con quién la publicó y qué cambió", async () => {
    const C: Contexto = { tenantId: randomUUID(), branchId: randomUUID(), sistema: true };
    await app.sucursal.asegurar(C, { tenant: "Prueba C", sucursal: "Principal" });
    try {
      assert.deepEqual(await app.tarifario.versiones(C, {}), { ok: true, valor: { versiones: [], total: 0, pagina: 1 } });
      assert.ok((await app.tarifario.publicar(C, tarifario("300"))).ok);
      const segundo = tarifario("350");
      segundo.packages.push({ ...paquete("p60", "1 hora", 60, "500") });
      segundo.policy.capacityLimit = 25;
      assert.ok((await app.tarifario.publicar(C, segundo)).ok);
      const tercero = structuredClone(segundo);
      tercero.packages[2]!.active = false;
      assert.ok((await app.tarifario.publicar(C, tercero)).ok);

      const r = await app.tarifario.versiones(C, { porPagina: 10 });
      assert.ok(r.ok, JSON.stringify(r));
      assert.deepEqual(r.valor.versiones.map((v) => v.version), [3, 2, 1]);
      assert.equal(r.valor.versiones[2]!.publicadoPor, "Consola del servidor");
      assert.deepEqual(r.valor.versiones[2]!.cambios, ["Primera publicación: 2 paquetes a la venta"]);
      assert.ok(r.valor.versiones[1]!.cambios.some((c) => c.startsWith("Nuevo paquete «1 hora»")));
      assert.ok(r.valor.versiones[1]!.cambios.some((c) => c.startsWith("«30 minutos»:")));
      assert.ok(r.valor.versiones[1]!.cambios.includes("Aforo: 30 → 25 niños"));
      assert.deepEqual(r.valor.versiones[0]!.cambios, ["«1 hora» se retiró de la venta"]);
      assert.equal(r.valor.versiones[0]!.aLaVenta, 2);

      const p2 = await app.tarifario.versiones(C, { porPagina: 10, pagina: 5 });
      assert.ok(p2.ok && p2.valor.pagina === 1);
      // Cada sucursal ve las suyas.
      const deA = await app.tarifario.versiones({ tenantId: C.tenantId, branchId: A.branchId, sistema: true }, {});
      assert.ok(deA.ok && deA.valor.total === 0);
    } finally {
      await borrarTenantsDePrueba(URL_APP, [C.tenantId]);
    }
  });
});
