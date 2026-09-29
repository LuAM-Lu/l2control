/**
 * El tiempo real contra l2control_test (B5-1): el outbox lo escribe la base en la misma transacción
 * que la operación, el worker lo publica por sucursal y sin cruzar tenants, y el canal solo se abre
 * con un ticket bueno de una sesión viva. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Aviso } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { TEMAS_DE_ACCION, temasDe } from "./temas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;

let A: LocalDePrueba;
let B: LocalDePrueba;

const tarifario = (minor: string) => ({
  packages: [
    { id: "p60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: { minor, currency: "USD" }, active: true },
  ],
  policy: {
    graceMinutes: 5,
    penaltyBlockMinutes: 15,
    penaltyPricePerBlock: { minor: "150", currency: "USD" },
    warnBeforeMinutes: 10,
    capacityLimit: 30,
  },
});

/** Lo pendiente del outbox de un local, visto con su tenant. */
const pendientes = (l: LocalDePrueba) =>
  l.base.conTenant(l.sistema.tenantId, (tx) => tx.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { id: "asc" } }));

/** Publica todo lo pendiente y devuelve lo que se contó. */
async function despachar(l: LocalDePrueba): Promise<Aviso[]> {
  const avisos: Aviso[] = [];
  await l.app.tiempoReal.despachar(l.sistema.tenantId, (a) => void avisos.push(...a));
  return avisos;
}

before(async () => {
  A = await abrirLocalDePrueba(URL_APP, "Prueba tiempo real A");
  B = await abrirLocalDePrueba(URL_APP, "Prueba tiempo real B");
  // Lo que dejó la preparación (sucursal, etc.) no interesa aquí.
  await despachar(A);
  await despachar(B);
});

after(async () => {
  await A.cerrar();
  await B.cerrar();
});

describe("el outbox", () => {
  test("una operación hecha deja su evento en la misma transacción, con su sucursal y su acción", async () => {
    const r = await A.app.tarifario.publicar(A.sistema, tarifario("1000"));
    assert.ok(r.ok, JSON.stringify(r));
    const p = await pendientes(A);
    assert.equal(p.length, 1);
    assert.equal(p[0]!.action, "tarifario.publicar");
    assert.equal(p[0]!.branchId, A.sistema.branchId);
  });

  test("se publica agrupado por sucursal, como temas, y una sola vez", async () => {
    const avisos = await despachar(A);
    assert.deepEqual(avisos, [{ branchId: A.sistema.branchId, temas: ["tarifario"] }]);
    assert.equal((await pendientes(A)).length, 0);
    assert.deepEqual(await despachar(A), []);
  });

  test("una operación que se deshace no deja evento", async () => {
    await assert.rejects(
      A.base.conTenant(A.sistema.tenantId, async (tx) => {
        await tx.auditEntry.create({
          data: { tenantId: A.sistema.tenantId, branchId: A.sistema.branchId, action: "tarifario.publicar", outcome: "HECHO" },
        });
        throw new Error("la operación falla después de auditar");
      }),
    );
    assert.equal((await pendientes(A)).length, 0);
  });

  test("un rechazo (NEGADO) no cuenta nada: la operación no ocurrió", async () => {
    const cajera = await crearPersona(A, { nombre: "Cajera Outbox", role: "CAJERO", pin: "4321" });
    const ctx = await contextoDe(A, await crearEquipo(A, "Caja outbox"), cajera, "4321");
    await despachar(A);
    const r = await A.app.tarifario.publicar(ctx, tarifario("1200"));
    assert.equal(r.ok, false);
    assert.equal((await pendientes(A)).length, 0);
  });

  test("si publicar falla no se marca, y sale en la vuelta siguiente", async () => {
    await A.app.tarifario.publicar(A.sistema, tarifario("1100"));
    await assert.rejects(A.app.tiempoReal.despachar(A.sistema.tenantId, () => Promise.reject(new Error("Valkey caído"))));
    assert.equal((await pendientes(A)).length, 1);
    assert.deepEqual(await despachar(A), [{ branchId: A.sistema.branchId, temas: ["tarifario"] }]);
  });

  test("cada tenant despacha solo lo suyo (el de otro no lo ve ni lo marca)", async () => {
    await A.app.tarifario.publicar(A.sistema, tarifario("1300"));
    assert.deepEqual(await despachar(B), []);
    assert.equal((await pendientes(A)).length, 1);
    await despachar(A);
  });

  test("lo publicado no se reescribe ni se borra", async () => {
    await A.app.tarifario.publicar(A.sistema, tarifario("1400"));
    await despachar(A);
    await assert.rejects(
      A.base.conTenant(A.sistema.tenantId, (tx) => tx.outboxEvent.updateMany({ data: { publishedAt: new Date() } })),
      /ya está publicado/,
    );
    await assert.rejects(A.base.conTenant(A.sistema.tenantId, (tx) => tx.outboxEvent.deleteMany({})), /permission denied|permiso/i);
  });

  test("el aviso de la base llega al confirmar la transacción, con el tenant", async () => {
    const llegados: string[] = [];
    const dejar = await A.app.tiempoReal.escuchar((t) => llegados.push(t));
    try {
      await A.app.tarifario.publicar(A.sistema, tarifario("1500"));
      for (let i = 0; i < 50 && !llegados.includes(A.sistema.tenantId); i++) await new Promise((r) => setTimeout(r, 20));
      assert.ok(llegados.includes(A.sistema.tenantId), `llegaron: ${llegados.join(", ")}`);
    } finally {
      await dejar();
      await despachar(A);
    }
  });
});

describe("los temas", () => {
  test("toda acción auditada tiene su fila (aunque sea vacía) y lo desconocido no invalida nada", () => {
    assert.deepEqual(temasDe("cuenta.cobrar"), ["cuentas", "ventas", "turno"]);
    assert.deepEqual(temasDe("parque.entrada"), ["sala", "cuentas"]);
    assert.deepEqual(temasDe("sesion.pin_fallido"), []);
    assert.deepEqual(temasDe("algo.inventado"), []);
    assert.ok(Object.keys(TEMAS_DE_ACCION).length > 60);
  });
});

describe("el ticket y el latido", () => {
  let sesion: { tenantId: string; branchId: string; sessionId: string; userId: string; deviceId: string };
  let credencial: string;

  before(async () => {
    const monitora = await crearPersona(A, { nombre: "Monitora Canal", role: "MONITOR_PARQUE", pin: "5678" });
    const equipo = await crearEquipo(A, "Teléfono canal");
    const r = await A.app.sesiones.entrar({ dispositivo: equipo, userId: monitora, pin: "5678", ip: null, ahora: Date.now() });
    assert.ok(r.ok);
    credencial = r.credencial;
    sesion = { tenantId: r.sesion.tenantId, branchId: r.sesion.branchId, sessionId: r.sesion.id, userId: r.sesion.userId, deviceId: r.sesion.deviceId };
  });

  test("un ticket bueno de una sesión viva abre el canal", async () => {
    const ahora = Date.now();
    const t = A.app.tiempoReal.ticket(sesion, ahora)!;
    assert.deepEqual(await A.app.tiempoReal.abrir(t, A.sistema.tenantId, ahora), sesion);
  });

  test("tocado, caducado o de otro tenant, no", async () => {
    const ahora = Date.now();
    const t = A.app.tiempoReal.ticket(sesion, ahora)!;
    const [cuerpo, sello] = t.split(".");
    const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo!, "base64url").toString()), b: B.sistema.branchId })).toString("base64url");
    assert.equal(await A.app.tiempoReal.abrir(`${otro}.${sello}`, A.sistema.tenantId, ahora), null);
    assert.equal(await A.app.tiempoReal.abrir(t, A.sistema.tenantId, ahora + 61_000), null);
    assert.equal(await A.app.tiempoReal.abrir(t, B.sistema.tenantId, ahora), null);
    assert.equal(await A.app.tiempoReal.abrir("basura", A.sistema.tenantId, ahora), null);
    assert.equal(await A.app.tiempoReal.abrir({ ticket: t }, A.sistema.tenantId, ahora), null);
    // Firmado para una sesión que no existe.
    const falso = A.app.tiempoReal.ticket({ ...sesion, sessionId: randomUUID() }, ahora)!;
    assert.equal(await A.app.tiempoReal.abrir(falso, A.sistema.tenantId, ahora), null);
  });

  test("el latido sostiene la sesión mientras el canal está abierto", async () => {
    const dentroDe = Date.now() + 5 * 60_000;
    const vivas = await A.app.tiempoReal.latido(A.sistema.tenantId, [sesion.sessionId, randomUUID()], dentroDe);
    assert.deepEqual([...vivas], [sesion.sessionId]);
    const s = await A.base.conTenant(A.sistema.tenantId, (tx) => tx.staffSession.findUniqueOrThrow({ where: { id: sesion.sessionId } }));
    assert.equal(s.lastSeenAt.getTime(), dentroDe);
  });

  test("Inicio sabe quién está en sesión y en qué equipo; la caja no lo pregunta", async () => {
    const dueña = await crearPersona(A, { nombre: "Dueña Canal", role: "ADMIN", pin: "1111" });
    const ctx = await contextoDe(A, await crearEquipo(A, "PC canal"), dueña, "1111");
    const r = await A.app.sesiones.enCurso(ctx, Date.now());
    assert.ok(r.ok, JSON.stringify(r));
    const monitora = r.valor.find((s) => s.userName === "Monitora Canal");
    assert.equal(monitora?.deviceLabel, "Teléfono canal");
    assert.equal(monitora?.role, "MONITOR_PARQUE");
    const cajera = await crearPersona(A, { nombre: "Cajera Curiosa", role: "CAJERO", pin: "2222" });
    const deCaja = await contextoDe(A, await crearEquipo(A, "Caja canal"), cajera, "2222");
    assert.equal((await A.app.sesiones.enCurso(deCaja, Date.now())).ok, false);
  });

  test("al salir, ni el ticket abre ni el latido la cuenta", async () => {
    const ahora = Date.now();
    const t = A.app.tiempoReal.ticket(sesion, ahora)!;
    await A.app.sesiones.salir(credencial, "SALIDA", null);
    assert.equal(await A.app.tiempoReal.abrir(t, A.sistema.tenantId, ahora), null);
    assert.equal((await A.app.tiempoReal.latido(A.sistema.tenantId, [sesion.sessionId], ahora)).size, 0);
  });
});
