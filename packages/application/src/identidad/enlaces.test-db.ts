/**
 * Los enlaces de alta de credenciales (ADR-020, punto 4) contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  LlaveDePrueba,
  abrirLocalDePrueba,
  contextoDe,
  contextoElevado,
  crearEquipo,
  crearPersona,
  elevarConLlave,
  type LocalDePrueba,
} from "../para-pruebas.ts";
import type { Contexto } from "../contexto.ts";
import { ENLACE_MS } from "./enlaces.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let equipo: string;
let admin: string;
let segunda: string;
let cajera: string;
let ctxAdmin: Contexto;
const NUEVA = "frase larga de la segunda";

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Enlaces de alta");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  segunda = await crearPersona(local, { nombre: "Andrea Morales", role: "ADMIN", pin: "5937" });
  cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  equipo = await crearEquipo(local, "PC oficina");
  ctxAdmin = await contextoElevado(local, equipo, { id: admin, nombre: "Abigail Karam", pin: "4826" });
});

after(() => local.cerrar());

const secretoDe = (url: string) => url.split("#")[1]!;
async function nuevoEnlace(userId: string, kind: "ALTA" | "LLAVE", ahora = Date.now()) {
  const r = await local.app.enlaces.crear(ctxAdmin, { userId, kind }, ahora);
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
}
/** Los dos pasos de quien abre el enlace: contraseña y llave. */
async function completar(enlace: string, contrasena: string, llave: LlaveDePrueba, ahora = Date.now()) {
  const p = await local.app.enlaces.preparar({ enlace, datos: { contrasena }, ahora });
  if (!p.ok) return p;
  return local.app.enlaces.completar({
    enlace,
    datos: { desafioId: p.valor.desafioId, respuesta: llave.registrar(p.valor.opciones), etiqueta: "Teléfono" },
    ip: "10.3.3.3",
    ahora,
  });
}

describe("generar el enlace", () => {
  test("administración, con la sesión elevada, lo genera para otra persona: 24 h y el secreto fuera del servidor", async () => {
    const ahora = Date.now();
    const e = await nuevoEnlace(segunda, "ALTA", ahora);
    assert.equal(e.nombre, "Andrea Morales");
    assert.equal(Date.parse(e.caduca), ahora + ENLACE_MS);
    // El secreto va en el fragmento: el navegador no lo envía al pedir la página.
    assert.match(e.url, /^http:\/\/localhost:3000\/alta#[0-9a-f-]{36}\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const secreto = secretoDe(e.url).split(".")[2]!;
    const { tenantId } = local.sistema;
    const fila = await local.base.conTenant(tenantId, (tx) => tx.enrollmentLink.findFirst({ where: { userId: segunda }, orderBy: { createdAt: "desc" } }));
    assert.match(fila!.secretHash, /^[0-9a-f]{64}$/);
    const asientos = await local.app.auditoria.listar(local.sistema, { limite: 500 });
    assert.ok(asientos.some((a) => a.action === "usuario.enlace" && a.entityId === segunda));
    assert.ok(!JSON.stringify(asientos).includes(secreto) && !JSON.stringify(fila).includes(secreto));
  });

  test("sin elevar pide confirmar identidad, y quien no gestiona personas no puede", async () => {
    const sinElevar = await contextoDe(local, await crearEquipo(local, "PC 2"), segunda, "5937");
    const r = await local.app.enlaces.crear(sinElevar, { userId: admin, kind: "ALTA" }, Date.now());
    assert.equal(r.ok ? "ok" : r.motivo, "ELEVACION_REQUERIDA");
    const deCaja = await contextoDe(local, await crearEquipo(local, "Caja"), cajera, "7391");
    const r2 = await local.app.enlaces.crear(deCaja, { userId: cajera, kind: "ALTA" }, Date.now());
    assert.equal(r2.ok ? "ok" : r2.motivo, "NO_PERMITIDO");
    assert.equal((await local.app.enlaces.resumen(deCaja)).ok, false);
  });

  test("no se da a quien entra solo con PIN, ni a quien está de baja, ni otra llave a quien no tiene contraseña", async () => {
    const aCaja = await local.app.enlaces.crear(ctxAdmin, { userId: cajera, kind: "ALTA" }, Date.now());
    assert.equal(aCaja.ok ? "ok" : aCaja.motivo, "INVALIDO");
    const baja = await crearPersona(local, { nombre: "Carla Benítez", role: "ADMIN", activa: false });
    const aBaja = await local.app.enlaces.crear(ctxAdmin, { userId: baja, kind: "ALTA" }, Date.now());
    assert.equal(aBaja.ok ? "ok" : aBaja.motivo, "INVALIDO");
    const sinContrasena = await crearPersona(local, { nombre: "Sin Credenciales", role: "ADMIN" });
    const otraLlave = await local.app.enlaces.crear(ctxAdmin, { userId: sinContrasena, kind: "LLAVE" }, Date.now());
    assert.equal(otraLlave.ok ? "ok" : otraLlave.motivo, "INVALIDO");
    const deOtraSede = await crearPersona(local, { nombre: "De otra sede", role: "ADMIN", sucursales: [local.otraSucursal] });
    const fuera = await local.app.enlaces.crear(ctxAdmin, { userId: deOtraSede, kind: "ALTA" }, Date.now());
    assert.equal(fuera.ok ? "ok" : fuera.motivo, "NO_DISPONIBLE");
  });
});

describe("usar el enlace", () => {
  let llave: LlaveDePrueba;
  let codigos: readonly string[];

  test("quien lo abre ve de quién es; con contraseña y llave queda con sus diez códigos", async () => {
    const ahora = Date.now();
    const e = await nuevoEnlace(segunda, "ALTA", ahora);
    const enlace = secretoDe(e.url);
    assert.deepEqual(await local.app.enlaces.abrir(enlace, ahora), { nombre: "Andrea Morales", kind: "ALTA", caduca: e.caduca });

    llave = new LlaveDePrueba();
    const r = await completar(enlace, NUEVA, llave, ahora);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.codigos?.length, 10);
    assert.equal(new Set(r.valor.codigos).size, 10);
    for (const c of r.valor.codigos!) assert.match(c, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    codigos = r.valor.codigos!;

    // Ya puede confirmar identidad con lo que acaba de registrar.
    const s = await local.app.sesiones.entrar({ dispositivo: equipo, userId: segunda, pin: "5937", ip: null, ahora });
    assert.ok(s.ok);
    assert.ok((await elevarConLlave(local, s.credencial, { llave, contrasena: NUEVA }, ahora)).ok);
  });

  test("el enlace vale una sola vez, y generar otro revoca el anterior", async () => {
    const ahora = Date.now();
    const primero = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
    const segundo = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora + 1)).url);
    assert.equal(await local.app.enlaces.abrir(primero, ahora + 2), null);
    const viejo = await completar(primero, NUEVA, new LlaveDePrueba(), ahora + 2);
    assert.equal(viejo.ok ? "ok" : viejo.motivo, "NO_PERMITIDO");

    assert.ok((await completar(segundo, NUEVA, new LlaveDePrueba(), ahora + 2)).ok);
    assert.equal(await local.app.enlaces.abrir(segundo, ahora + 3), null);
    const otraVez = await completar(segundo, NUEVA, new LlaveDePrueba(), ahora + 3);
    assert.equal(otraVez.ok ? "ok" : otraVez.motivo, "NO_PERMITIDO");
  });

  test("a las 24 horas caduca; uno inventado o manipulado no dice nada", async () => {
    const ahora = Date.now();
    const enlace = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
    assert.notEqual(await local.app.enlaces.abrir(enlace, ahora + ENLACE_MS - 1), null);
    assert.equal(await local.app.enlaces.abrir(enlace, ahora + ENLACE_MS), null);
    const tarde = await completar(enlace, NUEVA, new LlaveDePrueba(), ahora + ENLACE_MS);
    assert.equal(tarde.ok ? "ok" : tarde.motivo, "NO_PERMITIDO");
    const [t, id] = enlace.split(".");
    for (const malo of [undefined, 42, "", "no-es-un-enlace", `${t}.${id}.${"x".repeat(43)}`]) {
      assert.equal(await local.app.enlaces.abrir(malo, ahora), null);
    }
  });

  test("LLAVE añade otra con la contraseña actual: no cambia la contraseña ni da códigos nuevos", async () => {
    const ahora = Date.now();
    const enlace = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
    const otra = new LlaveDePrueba();
    const r = await completar(enlace, NUEVA, otra, ahora);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.codigos, null);
    const s = await local.app.sesiones.entrar({ dispositivo: equipo, userId: segunda, pin: "5937", ip: null, ahora });
    assert.ok(s.ok);
    // Valen las dos llaves, y los códigos de antes siguen ahí.
    assert.ok((await elevarConLlave(local, s.credencial, { llave: otra, contrasena: NUEVA }, ahora)).ok);
    assert.ok((await elevarConLlave(local, s.credencial, { llave, contrasena: NUEVA }, ahora + 1)).ok);
    const con = await local.app.elevacion.elevar({ sesion: s.credencial, contrasena: NUEVA, factor: { tipo: "CODIGO", codigo: codigos[0]! }, ip: null, ahora: ahora + 2 });
    assert.ok(con.ok);
  });

  test("LLAVE con la contraseña errada no registra nada, y a la quinta el enlace deja de valer", async () => {
    const ahora = Date.now();
    const enlace = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
    for (let i = 0; i < 4; i++) {
      const r = await local.app.enlaces.preparar({ enlace, datos: { contrasena: `intento-${i}-de-adivinar` }, ahora });
      assert.equal(r.ok ? "ok" : r.mensaje, "Contraseña incorrecta.");
    }
    const quinta = await local.app.enlaces.preparar({ enlace, datos: { contrasena: "intento-final-de-adivinar" }, ahora });
    assert.equal(quinta.ok, false);
    const yaNo = await local.app.enlaces.preparar({ enlace, datos: { contrasena: NUEVA }, ahora });
    assert.equal(yaNo.ok ? "ok" : yaNo.motivo, "NO_PERMITIDO", "ni con la buena");
  });

  test("ALTA exige una contraseña larga, y una llave ya registrada no se registra dos veces", async () => {
    const ahora = Date.now();
    const enlace = secretoDe((await nuevoEnlace(segunda, "ALTA", ahora)).url);
    const corta = await local.app.enlaces.preparar({ enlace, datos: { contrasena: "corta" }, ahora });
    assert.equal(corta.ok ? "ok" : corta.motivo, "INVALIDO");
    const repetida = await completar(secretoDe((await nuevoEnlace(admin, "LLAVE", ahora)).url), "contraseña-de-prueba", llave, ahora);
    assert.equal(repetida.ok ? "ok" : repetida.motivo, "CONFLICTO");
  });

  test("el desafío de un enlace no sirve para otro, ni la respuesta de otra llave", async () => {
    const ahora = Date.now();
    const deAndrea = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
    const p = await local.app.enlaces.preparar({ enlace: deAndrea, datos: { contrasena: NUEVA }, ahora });
    assert.ok(p.ok);
    const deAbigail = secretoDe((await nuevoEnlace(admin, "LLAVE", ahora)).url);
    const cruzado = await local.app.enlaces.completar({
      enlace: deAbigail,
      datos: { desafioId: p.valor.desafioId, respuesta: new LlaveDePrueba().registrar(p.valor.opciones), etiqueta: "Ajena" },
      ip: null,
      ahora,
    });
    assert.equal(cruzado.ok ? "ok" : cruzado.motivo, "NO_PERMITIDO");
    // Y firmada para otro sitio, tampoco.
    const p2 = await local.app.enlaces.preparar({ enlace: deAndrea, datos: { contrasena: NUEVA }, ahora });
    assert.ok(p2.ok);
    const fuera = await local.app.enlaces.completar({
      enlace: deAndrea,
      datos: { desafioId: p2.valor.desafioId, respuesta: new LlaveDePrueba("https://otro.ejemplo.com").registrar(p2.valor.opciones), etiqueta: "Falsa" },
      ip: null,
      ahora,
    });
    assert.equal(fuera.ok ? "ok" : fuera.motivo, "NO_PERMITIDO");
  });

  test("ALTA sobre quien ya tenía REPONE: las llaves y los códigos de antes dejan de valer", async () => {
    const ahora = Date.now();
    const enlace = secretoDe((await nuevoEnlace(segunda, "ALTA", ahora)).url);
    const nuevaLlave = new LlaveDePrueba();
    const r = await completar(enlace, "otra frase larga distinta", nuevaLlave, ahora);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.codigos?.length, 10);

    const s = await local.app.sesiones.entrar({ dispositivo: equipo, userId: segunda, pin: "5937", ip: null, ahora });
    assert.ok(s.ok);
    const d = await local.app.elevacion.desafio({ sesion: s.credencial, ahora });
    assert.ok(d.ok);
    assert.deepEqual(d.valor.opciones.allowCredentials?.map((c) => c.id), [nuevaLlave.id], "solo la llave nueva");
    const conVieja = await local.app.elevacion.elevar({
      sesion: s.credencial,
      contrasena: "otra frase larga distinta",
      factor: { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: llave.firmar(d.valor.opciones) },
      ip: null,
      ahora,
    });
    assert.equal(conVieja.ok, false);
    const conCodigoViejo = await local.app.elevacion.elevar({ sesion: s.credencial, contrasena: "otra frase larga distinta", factor: { tipo: "CODIGO", codigo: codigos[1]! }, ip: null, ahora });
    assert.equal(conCodigoViejo.ok, false);
    // (Dos fallos seguidos: uno más y la persona quedaría bloqueada, como con el PIN.)
    assert.ok((await elevarConLlave(local, s.credencial, { llave: nuevaLlave, contrasena: "otra frase larga distinta" }, ahora)).ok);
    // Nada se borró: las llaves retiradas siguen en la base.
    const { tenantId } = local.sistema;
    const todas = await local.base.conTenant(tenantId, (tx) => tx.passkey.findMany({ where: { userId: segunda } }));
    assert.ok(todas.length >= 3 && todas.filter((l) => l.retiredAt === null).length === 1);
  });
});

describe("lo que ve Panel → Personas", () => {
  test("quién tiene contraseña, cuántas llaves y códigos, y su enlace pendiente; ningún secreto", async () => {
    const ahora = Date.now();
    const sin = await crearPersona(local, { nombre: "Recién Llegada", role: "ADMIN" });
    await nuevoEnlace(sin, "ALTA", ahora);
    const r = await local.app.enlaces.resumen(ctxAdmin);
    assert.ok(r.ok, JSON.stringify(r));
    const de = (id: string) => r.valor.find((p) => p.userId === id)!;
    assert.equal(de(admin).tieneContrasena, true);
    assert.equal(de(admin).llaves.length, 1);
    assert.equal(de(admin).llaves[0]!.etiqueta, "Llave de prueba");
    assert.equal(de(admin).codigosRestantes, 10);
    assert.equal(de(segunda).llaves.length, 1);
    assert.equal(de(sin).tieneContrasena, false);
    assert.equal(de(sin).enlacePendiente?.kind, "ALTA");
    assert.equal(de(cajera).lasNecesita, false);
    assert.equal(de(admin).lasNecesita, true);
    const texto = JSON.stringify(r.valor);
    assert.ok(!texto.includes("argon2") && !texto.includes("secret") && !texto.includes("publicKey"));
  });
});

describe("aislamiento", () => {
  test("un enlace de un local no existe para otro", async () => {
    const otro = await abrirLocalDePrueba(URL_APP, "Enlaces — otro local");
    try {
      const ahora = Date.now();
      const enlace = secretoDe((await nuevoEnlace(segunda, "LLAVE", ahora)).url);
      const [, id, secreto] = enlace.split(".");
      const cruzado = `${otro.sistema.tenantId}.${id}.${secreto}`;
      assert.equal(await otro.app.enlaces.abrir(cruzado, ahora), null);
      const r = await otro.app.enlaces.crear(otro.sistema, { userId: segunda, kind: "ALTA" }, ahora);
      assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    } finally {
      await otro.cerrar();
    }
  });
});
