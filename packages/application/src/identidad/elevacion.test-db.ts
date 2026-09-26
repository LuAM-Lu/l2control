/**
 * La elevación con contraseña y TOTP (F2-04) contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { Secret, TOTP } from "otpauth";
import { DEFAULT_LOCKOUT_POLICY } from "@l2/domain-identity";
import { conectar } from "../index.ts";
import { abrirLocalDePrueba, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { ELEVACION_MS } from "./elevacion.ts";
import { contextoDeSesion } from "./sesiones.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let equipo: string;
let secreto: string;
const CONTRASEÑA = "una-contraseña-larga";

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Elevación");
  await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  equipo = await crearEquipo(local, "Tablet oficina");
  const c = await local.app.elevacion.credenciales(local.sistema, { nombre: "Abigail Karam", contrasena: CONTRASEÑA });
  assert.ok(c.ok);
  secreto = c.valor.secretoBase32;
});

after(() => local.cerrar());

const personas = async () => local.app.sesiones.personas(equipo);
async function entrarComo(nombre: string, pin: string, ahora: number) {
  const id = (await personas()).find((p) => p.nombre === nombre)!.id;
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId: id, pin, ip: null, ahora });
  assert.ok(r.ok, JSON.stringify(r));
  return r.credencial;
}
const codigo = (ahora: number) => new TOTP({ secret: Secret.fromBase32(secreto) }).generate({ timestamp: ahora });
const tarifario = {
  packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: "300", currency: "USD" }, active: true }],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
};

describe("dar credenciales", () => {
  test("la contraseña queda en Argon2id y el secreto TOTP cifrado; nada de eso en la auditoría", async () => {
    const u = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.findFirst({ where: { fullName: "Abigail Karam" } }));
    assert.match(u!.passwordHash!, /^\$argon2id\$/);
    assert.ok(u!.totpSecretEnc!.startsWith("v1.") && !u!.totpSecretEnc!.includes(secreto));
    const asientos = await local.app.auditoria.listar(local.sistema, { limite: 500 });
    const todo = JSON.stringify(asientos.map((a) => [a.before, a.after, a.reason]));
    assert.ok(!todo.includes(CONTRASEÑA) && !todo.includes(secreto));
  });

  test("solo el sistema las da, y exige una contraseña larga", async () => {
    const r = await local.app.elevacion.credenciales({ tenantId: local.sistema.tenantId, branchId: local.sistema.branchId }, { nombre: "Abigail Karam" });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const corta = await local.app.elevacion.credenciales(local.sistema, { nombre: "Luis Guerrero", contrasena: "corta" });
    assert.equal(corta.ok ? "ok" : corta.motivo, "INVALIDO");
  });

  test("devuelve la URI otpauth para el autenticador", async () => {
    const r = await local.app.elevacion.credenciales(local.sistema, { nombre: "Luis Guerrero" });
    assert.ok(r.ok);
    assert.match(r.valor.otpauth, /^otpauth:\/\/totp\/L2%20Control:Luis%20Guerrero\?/);
    assert.ok(r.valor.contrasena.length >= 12);
  });
});

describe("elevar", () => {
  test("con contraseña y código correctos, la sesión queda elevada 15 minutos", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const r = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, codigo: codigo(ahora), ip: null, ahora });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(Date.parse(r.valor.elevadaHasta), ahora + ELEVACION_MS);

    const s = await local.app.sesiones.consultar(cred, ahora + 1000);
    assert.ok((await local.app.tarifario.publicar(contextoDeSesion(s!, null), tarifario)).ok);
    // Pasado el plazo, la sesión sigue viva pero ya no elevada.
    const tarde = await local.app.sesiones.consultar(cred, ahora + ELEVACION_MS + 1000);
    assert.equal(tarde?.elevadaHasta, null);
    const r2 = await local.app.tarifario.publicar(contextoDeSesion(tarde!, null), tarifario);
    assert.equal(r2.ok ? "ok" : r2.motivo, "ELEVACION_REQUERIDA");
  });

  test("un código de otro momento, o una contraseña mala, no elevan; no se dice cuál falló", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const viejo = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, codigo: codigo(ahora - 10 * 60_000), ip: null, ahora });
    const mala = await local.app.elevacion.elevar({ sesion: cred, contrasena: "otra-cosa-cualquiera", codigo: codigo(ahora), ip: null, ahora });
    assert.equal(viejo.ok, false);
    assert.equal(mala.ok, false);
    if (!viejo.ok && !mala.ok) assert.equal(viejo.mensaje.startsWith("Contraseña o código"), mala.mensaje.startsWith("Contraseña o código"));
    // Se acierta después y el contador vuelve a cero.
    assert.ok((await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, codigo: codigo(ahora), ip: null, ahora })).ok);
  });

  test("los fallos seguidos bloquean, y el bloqueo vale también para el PIN", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    for (let i = 0; i < DEFAULT_LOCKOUT_POLICY.freeAttempts; i++) {
      await local.app.elevacion.elevar({ sesion: cred, contrasena: "no-es", codigo: "000000", ip: null, ahora: ahora + i });
    }
    const bloqueada = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, codigo: codigo(ahora), ip: null, ahora: ahora + 10 });
    assert.equal(bloqueada.ok, false);
    const id = (await personas()).find((p) => p.nombre === "Abigail Karam")!.id;
    const pin = await local.app.sesiones.entrar({ dispositivo: equipo, userId: id, pin: "4826", ip: null, ahora: ahora + 11 });
    assert.equal(pin.ok, false, "bloqueada para elevar, bloqueada para entrar");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: id });
    assert.ok(asientos.some((a) => a.action === "sesion.elevar_fallido"));
  });

  test("quien no tiene contraseña ni autenticador no puede elevar, y se le dice por qué", async () => {
    await crearPersona(local, { nombre: "Diego Salas", role: "COCINA", pin: "6048" });
    const ahora = Date.now() + 60 * 60_000;
    const r = await local.app.elevacion.elevar({ sesion: await entrarComo("Diego Salas", "6048", ahora), contrasena: CONTRASEÑA, codigo: codigo(ahora), ip: null, ahora });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    if (!r.ok) assert.match(r.mensaje, /Pídelos a administración/);
  });

  test("sin clave de cifrado en el servidor, la elevación no está disponible (fail-closed)", async () => {
    const sinClave = await conectar(URL_APP);
    try {
      const ahora = Date.now() + 2 * 60 * 60_000;
      const cred = await entrarComo("Abigail Karam", "4826", ahora);
      const r = await sinClave.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, codigo: codigo(ahora), ip: null, ahora });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    } finally {
      await sinClave.cerrar();
    }
  });

  test("ver los equipos también exige la elevación: es gestionar personas (F2-04)", async () => {
    const ahora = Date.now() + 3 * 60 * 60_000;
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const s = await local.app.sesiones.consultar(cred, ahora);
    const r = await local.app.dispositivos.listar(contextoDeSesion(s!, null));
    assert.equal(r.ok ? "ok" : r.motivo, "ELEVACION_REQUERIDA");
  });
});
