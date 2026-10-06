/**
 * La elevación con contraseña y llave de acceso (F2-04, ADR-020) contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOCKOUT_POLICY } from "@l2/domain-identity";
import { conectar } from "../index.ts";
import {
  CLAVE_DE_PRUEBA,
  LlaveDePrueba,
  abrirLocalDePrueba,
  crearEquipo,
  crearPersona,
  darCredenciales,
  elevarConLlave,
  type CredencialesDePrueba,
  type LocalDePrueba,
} from "../para-pruebas.ts";
import { ELEVACION_MS } from "./elevacion.ts";
import { DESAFIO_MS } from "./llaves.ts";
import { contextoDeSesion } from "./sesiones.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let equipo: string;
let abigail: CredencialesDePrueba;
let luis: CredencialesDePrueba;
const CONTRASEÑA = "una-contraseña-larga";

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Elevación");
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  equipo = await crearEquipo(local, "Tablet oficina");
  abigail = await darCredenciales(local, admin, CONTRASEÑA);
  luis = await darCredenciales(local, supervisor, "otra-contraseña-larga");
});

after(() => local.cerrar());

const personas = async () => local.app.sesiones.personas(equipo);
async function entrarComo(nombre: string, pin: string, ahora: number) {
  const id = (await personas()).find((p) => p.nombre === nombre)!.id;
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId: id, pin, ip: null, ahora });
  assert.ok(r.ok, JSON.stringify(r));
  return r.credencial;
}
/** El segundo factor que mandaría la pantalla: la firma de `llave` sobre un desafío recién pedido. */
async function firma(sesion: string, llave: LlaveDePrueba, ahora: number) {
  const d = await local.app.elevacion.desafio({ sesion, ahora });
  assert.ok(d.ok, JSON.stringify(d));
  return { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: llave.firmar(d.valor.opciones) };
}
const tarifario = {
  packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: "300", currency: "USD" }, active: true }],
  policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
};

describe("lo que se guarda de las credenciales", () => {
  test("la contraseña queda en Argon2id, de la llave solo la clave pública y de los códigos su huella", async () => {
    const { tenantId } = local.sistema;
    const u = await local.base.conTenant(tenantId, (tx) => tx.staffUser.findFirst({ where: { fullName: "Abigail Karam" }, include: { passkeys: true, recoveryCodes: true } }));
    assert.match(u!.passwordHash!, /^\$argon2id\$/);
    assert.equal(u!.totpSecretEnc, null, "el TOTP se retiró: nadie lo escribe");
    assert.equal(u!.passkeys.length, 1);
    assert.equal(u!.passkeys[0]!.credentialId, abigail.llave.id);
    assert.equal(u!.recoveryCodes.length, 10);
    for (const c of u!.recoveryCodes) assert.match(c.codeHash, /^[0-9a-f]{64}$/);
    const todo =
      JSON.stringify(u, (_, v: unknown) => (typeof v === "bigint" ? String(v) : v)) +
      JSON.stringify(await local.app.auditoria.listar(local.sistema, { limite: 500 }));
    assert.ok(!todo.includes(CONTRASEÑA));
    for (const c of abigail.codigos) assert.ok(!todo.includes(c) && !todo.includes(c.replace("-", "")), "ningún código en claro");
  });
});

describe("elevar", () => {
  test("con la contraseña y la llave, la sesión queda elevada 15 minutos", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const r = await elevarConLlave(local, cred, abigail, ahora);
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

  test("el desafío solo ofrece las llaves de quien tiene la sesión, y no revela nada más", async () => {
    const ahora = Date.now();
    const d = await local.app.elevacion.desafio({ sesion: await entrarComo("Abigail Karam", "4826", ahora), ahora });
    assert.ok(d.ok);
    assert.deepEqual(d.valor.opciones.allowCredentials?.map((c) => c.id), [abigail.llave.id]);
    assert.equal(d.valor.opciones.rpId, "localhost");
  });

  test("una contraseña mala, o la llave de otra persona, no elevan; no se dice cuál falló", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const mala = await local.app.elevacion.elevar({ sesion: cred, contrasena: "otra-cosa-cualquiera", factor: await firma(cred, abigail.llave, ahora), ip: null, ahora });
    const ajena = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: await firma(cred, luis.llave, ahora), ip: null, ahora });
    assert.equal(mala.ok, false);
    assert.equal(ajena.ok, false);
    if (!mala.ok && !ajena.ok) assert.equal(mala.mensaje, ajena.mensaje);
    // Se acierta después y el contador vuelve a cero.
    assert.ok((await elevarConLlave(local, cred, abigail, ahora)).ok);
  });

  test("una firma no se repite: el desafío es de un solo uso y caduca", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const factor = await firma(cred, abigail.llave, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor, ip: null, ahora })).ok);
    const repetida = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor, ip: null, ahora: ahora + 1 });
    assert.equal(repetida.ok, false, "la misma firma, capturada, no vuelve a valer");

    const vieja = await firma(cred, abigail.llave, ahora);
    const tarde = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: vieja, ip: null, ahora: ahora + DESAFIO_MS + 1 });
    assert.equal(tarde.ok, false, "un desafío caducado no se responde");
    assert.ok((await elevarConLlave(local, cred, abigail, ahora + DESAFIO_MS + 2)).ok);
  });

  test("una llave que firma para otra dirección no vale: una página falsa no puede pedirla", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Luis Guerrero", "5937", ahora);
    const d = await local.app.elevacion.desafio({ sesion: cred, ahora });
    assert.ok(d.ok);
    // Una llave que firma en otro origen y se presenta con el identificador de la de Luis.
    const falsa = new LlaveDePrueba("https://l2-control.ejemplo.net");
    const r = await local.app.elevacion.elevar({
      sesion: cred,
      contrasena: luis.contrasena,
      factor: { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: { ...falsa.firmar(d.valor.opciones), id: luis.llave.id, rawId: luis.llave.id } },
      ip: null,
      ahora,
    });
    assert.equal(r.ok, false);
    assert.ok((await elevarConLlave(local, cred, luis, ahora)).ok);
  });

  test("un contador que retrocede delata una llave copiada, y no eleva", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Luis Guerrero", "5937", ahora);
    assert.ok((await elevarConLlave(local, cred, luis, ahora)).ok);
    const antes = luis.llave.contador;
    luis.llave.contador = 0; // la copia no sabe cuántas veces firmó el original
    const r = await elevarConLlave(local, cred, luis, ahora + 1);
    assert.equal(r.ok, false);
    luis.llave.contador = antes;
    assert.ok((await elevarConLlave(local, cred, luis, ahora + 2)).ok);
  });

  test("un código de recuperación eleva una vez; el mismo, dos veces, no", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    const codigo = abigail.codigos[1]!;
    const r = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: { tipo: "CODIGO", codigo }, ip: null, ahora });
    assert.ok(r.ok, JSON.stringify(r));
    const otra = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: { tipo: "CODIGO", codigo }, ip: null, ahora: ahora + 1 });
    assert.equal(otra.ok, false);
    // El código de otra persona tampoco.
    const ajeno = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: { tipo: "CODIGO", codigo: luis.codigos[0]! }, ip: null, ahora: ahora + 2 });
    assert.equal(ajeno.ok, false);
    assert.ok((await elevarConLlave(local, cred, abigail, ahora + 3)).ok, "y el contador vuelve a cero al acertar");
    const id = (await personas()).find((p) => p.nombre === "Abigail Karam")!.id;
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: id });
    assert.ok(asientos.some((a) => a.action === "usuario.codigo_recuperacion"));
  });

  test("sin contraseña, sin factor o con un factor mal formado, se dice qué falta y no cuenta como fallo", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    for (const factor of [undefined, null, {}, { tipo: "CODIGO", codigo: "corto" }, { tipo: "LLAVE", desafioId: "x" }, { tipo: "TOTP", codigo: "123456" }]) {
      const r = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor, ip: null, ahora });
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO", JSON.stringify(factor));
    }
    const sin = await local.app.elevacion.elevar({ sesion: cred, contrasena: "", factor: { tipo: "CODIGO", codigo: abigail.codigos[2]! }, ip: null, ahora });
    assert.equal(sin.ok ? "ok" : sin.motivo, "INVALIDO");
    assert.ok((await elevarConLlave(local, cred, abigail, ahora)).ok);
  });

  test("los fallos seguidos bloquean, y el bloqueo vale también para el PIN", async () => {
    const ahora = Date.now();
    const cred = await entrarComo("Abigail Karam", "4826", ahora);
    for (let i = 0; i < DEFAULT_LOCKOUT_POLICY.freeAttempts; i++) {
      await local.app.elevacion.elevar({ sesion: cred, contrasena: "no-es", factor: await firma(cred, abigail.llave, ahora + i), ip: null, ahora: ahora + i });
    }
    const bloqueada = await elevarConLlave(local, cred, abigail, ahora + 10);
    assert.equal(bloqueada.ok, false);
    const id = (await personas()).find((p) => p.nombre === "Abigail Karam")!.id;
    const pin = await local.app.sesiones.entrar({ dispositivo: equipo, userId: id, pin: "4826", ip: null, ahora: ahora + 11 });
    assert.equal(pin.ok, false, "bloqueada para elevar, bloqueada para entrar");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: id });
    assert.ok(asientos.some((a) => a.action === "sesion.elevar_fallido"));
  });

  test("quien no tiene contraseña ni llave no puede elevar, y se le dice a quién pedirlas", async () => {
    await crearPersona(local, { nombre: "Diego Salas", role: "COCINA", pin: "6048" });
    const ahora = Date.now() + 60 * 60_000;
    const cred = await entrarComo("Diego Salas", "6048", ahora);
    const d = await local.app.elevacion.desafio({ sesion: cred, ahora });
    assert.equal(d.ok ? "ok" : d.motivo, "NO_DISPONIBLE");
    const r = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASEÑA, factor: { tipo: "CODIGO", codigo: abigail.codigos[3]! }, ip: null, ahora });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    if (!r.ok) assert.match(r.mensaje, /enlace de alta/);
  });

  test("sin la dirección pública en el servidor, la elevación no está disponible (fail-closed)", async () => {
    const sinDireccion = await conectar(URL_APP, { claveCifrado: CLAVE_DE_PRUEBA });
    try {
      const ahora = Date.now() + 2 * 60 * 60_000;
      const cred = await entrarComo("Luis Guerrero", "5937", ahora);
      const d = await sinDireccion.elevacion.desafio({ sesion: cred, ahora });
      assert.equal(d.ok ? "ok" : d.motivo, "NO_DISPONIBLE");
      const r = await sinDireccion.elevacion.elevar({ sesion: cred, contrasena: luis.contrasena, factor: { tipo: "CODIGO", codigo: luis.codigos[1]! }, ip: null, ahora });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    } finally {
      await sinDireccion.cerrar();
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
