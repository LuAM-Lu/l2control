/**
 * El acceso de verdad (F2-02, F2-03, F2-12, ADR-013/018) contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCKOUT_POLICY } from "@l2/domain-identity";
import { abrirLocalDePrueba, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { contextoDeSesion, SESION_INACTIVA_MS } from "./sesiones.ts";
import { leerCredencial } from "./credenciales.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let admin: string;
let cajera: string;
let equipo: string;
const T0 = Date.parse("2026-09-27T18:00:00.000Z");

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Acceso");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  await crearPersona(local, { nombre: "Ex empleado", role: "CAJERO", activa: false });
  await crearPersona(local, { nombre: "Sin PIN todavía", role: "MESERO", pin: null });
  await crearPersona(local, { nombre: "De la otra sede", role: "CAJERO", sucursales: [local.otraSucursal] });
  equipo = await crearEquipo(local, "Tablet caja");
});

after(() => local.cerrar());

const entrar = (userId: string, pin: string, ahora = T0, dispositivo = equipo) =>
  local.app.sesiones.entrar({ dispositivo, userId, pin, ip: "10.0.0.9", ahora });

describe("el dispositivo es el primer factor", () => {
  test("un equipo desconocido no ve a nadie y no deja entrar", async () => {
    assert.deepEqual(await local.app.sesiones.personas(undefined), []);
    const r = await entrar(cajera, "7391", T0, "no-es-una-credencial");
    assert.equal(r.ok, false);
  });

  test("un equipo pendiente tampoco, aunque el PIN sea correcto", async () => {
    const pendiente = await crearEquipo(local, "Tablet pendiente", false);
    assert.equal((await local.app.dispositivos.identificar(pendiente)).estado, "PENDIENTE");
    assert.deepEqual(await local.app.sesiones.personas(pendiente), []);
    assert.equal((await entrar(cajera, "7391", T0, pendiente)).ok, false);
  });

  test("una credencial con el secreto cambiado no es el equipo", async () => {
    const c = leerCredencial(equipo)!;
    const falsa = `${c.tenantId}.${c.id}.${"A".repeat(43)}`;
    assert.equal((await local.app.dispositivos.identificar(falsa)).estado, "DESCONOCIDO");
  });

  test("un equipo aprobado ofrece solo a las personas activas, con PIN, de su sucursal", async () => {
    const nombres = (await local.app.sesiones.personas(equipo)).map((p) => p.nombre);
    assert.deepEqual(nombres, ["Abigail Karam", "Marisol Prieto"]);
  });
});

describe("el PIN", () => {
  test("correcto: abre sesión, con su asiento", async () => {
    const r = await entrar(cajera, "7391");
    assert.ok(r.ok, JSON.stringify(r));
    const s = await local.app.sesiones.consultar(r.credencial, T0 + 1000);
    assert.equal(s?.nombre, "Marisol Prieto");
    assert.equal(s?.role, "CAJERO");
    assert.deepEqual(s?.actor.branchIds, [local.sistema.branchId]);
    const [asiento] = await local.app.auditoria.listar(local.sistema, { actorId: cajera });
    assert.equal(asiento?.action, "sesion.abrir");
  });

  test("se guarda con Argon2id y nunca en claro, ni en la auditoría", async () => {
    const u = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findUnique({ where: { id: cajera } }));
    assert.match(u!.pinHash!, /^\$argon2id\$/);
    const todo = JSON.stringify(await local.app.auditoria.listar(local.sistema, { limite: 500 }));
    assert.ok(!todo.includes("7391") && !todo.includes("4826"));
  });

  test("tres fallos se toleran; el cuarto bloquea, y bloqueada ni el PIN correcto entra", async () => {
    const libres = DEFAULT_LOCKOUT_POLICY.freeAttempts;
    for (let i = 1; i <= libres; i++) {
      const r = await entrar(admin, "0000", T0 + i);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.bloqueo?.bloqueado, i >= libres, `intento ${i}`);
    }
    const bloqueada = await entrar(admin, "4826", T0 + libres + 1);
    assert.equal(bloqueada.ok, false);
    if (!bloqueada.ok) assert.match(bloqueada.mensaje, /Espera/);

    const fallos = await local.app.auditoria.listar(local.sistema, { actorId: admin });
    assert.ok(fallos.filter((a) => a.action === "sesion.pin_fallido").length >= libres);
    assert.ok(fallos.some((a) => a.action === "sesion.bloqueada"));

    // Pasado el bloqueo, entra, y el contador vuelve a cero.
    const pasado = T0 + (DEFAULT_LOCKOUT_POLICY.backoffSeconds[0]! + 5) * 1000;
    const r = await entrar(admin, "4826", pasado);
    assert.ok(r.ok, JSON.stringify(r));
  });

  test("de baja, sin PIN o de otra sede: no entra, y el intento queda sin actor", async () => {
    const personas = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findMany());
    for (const nombre of ["Ex empleado", "Sin PIN todavía", "De la otra sede"]) {
      const u = personas.find((p) => p.fullName === nombre)!;
      assert.equal((await entrar(u.id, "2580")).ok, false, nombre);
    }
    assert.equal((await entrar("no-es-un-id", "2580")).ok, false);
  });

  test("lo que no es un PIN se rechaza sin tocar a nadie", async () => {
    const r = await entrar(cajera, "12ab");
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });
});

describe("la sesión vive en el servidor", () => {
  test("la actividad la mantiene viva; media hora sin ella, la mata", async () => {
    const r = await entrar(cajera, "7391", T0);
    assert.ok(r.ok);
    // Usarla justo antes del plazo la refresca: el plazo vuelve a contar desde ahí.
    const casi = T0 + SESION_INACTIVA_MS - 5_000;
    assert.ok(await local.app.sesiones.consultar(r.credencial, casi));
    assert.ok(await local.app.sesiones.consultar(r.credencial, casi + SESION_INACTIVA_MS - 5_000));
    // Y sin usarla durante más del plazo, muere, y no revive.
    const tarde = casi + 2 * SESION_INACTIVA_MS;
    assert.equal(await local.app.sesiones.consultar(r.credencial, tarde), null);
    assert.equal(await local.app.sesiones.consultar(r.credencial, tarde + 1), null);
  });

  test("entrar en el mismo equipo cierra la sesión anterior", async () => {
    const a = await entrar(cajera, "7391", T0);
    const b = await entrar(admin, "4826", T0 + 1);
    assert.ok(a.ok && b.ok);
    assert.equal(await local.app.sesiones.consultar(a.credencial, T0 + 2), null);
    assert.ok(await local.app.sesiones.consultar(b.credencial, T0 + 2));
  });

  test("salir la cierra de verdad", async () => {
    const r = await entrar(cajera, "7391", T0);
    assert.ok(r.ok);
    await local.app.sesiones.salir(r.credencial, "SALIDA", "10.0.0.9");
    assert.equal(await local.app.sesiones.consultar(r.credencial, T0 + 1), null);
  });

  test("una credencial de sesión con el tenant cambiado no encuentra nada", async () => {
    const r = await entrar(cajera, "7391", T0);
    assert.ok(r.ok);
    const c = leerCredencial(r.credencial)!;
    const otra = `${local.otraSucursal}.${c.id}.${c.secreto}`;
    assert.equal(await local.app.sesiones.consultar(otra, T0 + 1), null);
  });

  test("revocar el equipo cierra en el acto la sesión abierta en él (F2-02)", async () => {
    const tablet = await crearEquipo(local, "Tablet que se pierde");
    const r = await entrar(cajera, "7391", T0, tablet);
    assert.ok(r.ok);
    const ctxAdmin = await sesionDe(admin, "4826");
    const revocar = await local.app.dispositivos.ordenar(ctxAdmin, {
      kind: "REVOCAR",
      deviceId: leerCredencial(tablet)!.id,
      reason: "Se perdió en la limpieza de la tarde",
    });
    assert.ok(revocar.ok, JSON.stringify(revocar));
    assert.equal(await local.app.sesiones.consultar(r.credencial, T0 + 1), null);
    assert.deepEqual(await local.app.sesiones.personas(tablet), []);
  });
});

/** El contexto de operación de una persona que entra en el equipo principal. */
async function sesionDe(userId: string, pin: string) {
  const r = await entrar(userId, pin, Date.now());
  if (!r.ok) throw new Error(r.mensaje);
  return contextoDeSesion(r.sesion, "10.0.0.9");
}

describe("los permisos los decide el servidor con la matriz", () => {
  const tarifario = {
    packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: "300", currency: "USD" }, active: true }],
    policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
  };

  test("una cajera no publica precios, y el intento queda registrado", async () => {
    const ctx = await sesionDe(cajera, "7391");
    const r = await local.app.tarifario.publicar(ctx, tarifario);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const [asiento] = await local.app.auditoria.listar(local.sistema, { actorId: cajera });
    assert.equal(asiento?.action, "tarifario.publicar");
    assert.equal(asiento?.outcome, "NEGADO");
  });

  test("la administradora sí", async () => {
    const r = await local.app.tarifario.publicar(await sesionDe(admin, "4826"), tarifario);
    assert.ok(r.ok, JSON.stringify(r));
  });

  test("una cajera no aprueba ni revoca equipos", async () => {
    const pendiente = await crearEquipo(local, "Tablet que pide", false);
    const r = await local.app.dispositivos.ordenar(await sesionDe(cajera, "7391"), {
      kind: "APROBAR",
      deviceId: leerCredencial(pendiente)!.id,
      reason: "Quiero aprobarla yo misma",
    });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.dispositivos.identificar(pendiente)).estado, "PENDIENTE");
  });

  test("sin persona no hay permiso: un contexto vacío se niega", async () => {
    const r = await local.app.tarifario.publicar({ tenantId: local.sistema.tenantId, branchId: local.sistema.branchId }, tarifario);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });
});
