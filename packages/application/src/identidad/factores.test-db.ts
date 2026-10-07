/**
 * Confirmar identidad desde cualquier equipo (T-9, ADR-029) contra l2control_test: el equipo de
 * confianza, la app de autenticación (TOTP) y la llave opcional al instalar y en el alta.
 * Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { conectar, contextoDeSesion, type Aplicacion } from "../index.ts";
import { CLAVE_DE_PRUEBA, URL_DE_PRUEBA, abrirLocalDePrueba, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const CONTRASENA = "parque de niños 2026";
const PIN = "4826";

let local: LocalDePrueba;
let app: Aplicacion;
const instalados: string[] = [];

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Prueba factores");
  app = await conectar(URL_APP, { claveCifrado: CLAVE_DE_PRUEBA, urlPublica: URL_DE_PRUEBA });
});
after(async () => {
  await borrarTenantsDePrueba(URL_APP, instalados);
  await Promise.all([local.cerrar(), app.cerrar()]);
});

/** El código que daría la app en ese instante. */
const codigoDeApp = (secreto: string, ahora: number) => new TOTP({ secret: Secret.fromBase32(secreto), digits: 6, period: 30 }).generate({ timestamp: ahora });

/** Contraseña y códigos por un enlace de alta, SIN llave (ADR-029). Devuelve los códigos. */
async function altaSinLlave(userId: string, ahora = Date.now()): Promise<readonly string[]> {
  const e = await local.app.enlaces.crear(local.sistema, { userId, kind: "ALTA" }, ahora);
  assert.ok(e.ok, JSON.stringify(e));
  const enlace = e.valor.url.split("#")[1]!;
  const p = await local.app.enlaces.preparar({ enlace, datos: { contrasena: CONTRASENA }, ahora });
  assert.ok(p.ok, JSON.stringify(p));
  const c = await local.app.enlaces.completar({ enlace, datos: { desafioId: p.valor.desafioId }, ip: null, ahora });
  assert.ok(c.ok, JSON.stringify(c));
  return c.valor.codigos ?? [];
}

async function adminNueva(nombre: string) {
  const id = await crearPersona(local, { nombre, role: "ADMIN", pin: PIN });
  const codigos = await altaSinLlave(id);
  return { id, codigos };
}

const entrar = async (equipo: string, userId: string, ahora = Date.now()) => {
  const r = await local.app.sesiones.entrar({ dispositivo: equipo, userId, pin: PIN, ip: null, ahora });
  assert.ok(r.ok, JSON.stringify(r));
  return r.credencial;
};
const contexto = async (sesion: string, ahora = Date.now()) => contextoDeSesion((await local.app.sesiones.consultar(sesion, ahora))!, null);
const fallosDe = (userId: string) =>
  local.base.conTenant(local.sistema.tenantId, async (tx) => (await tx.staffUser.findUniqueOrThrow({ where: { id: userId } })).pinFailures);

describe("el equipo de confianza", () => {
  test("instalar sin llave deja el equipo de la instalación de confianza: en él basta la contraseña", async () => {
    const lugar = { tenantId: randomUUID(), branchId: randomUUID() };
    instalados.push(lugar.tenantId);
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    const datos = { codigo: codigo!, local: "Abby Kingdom", sucursal: "Principal", nombre: "Abigail Karam", contrasena: CONTRASENA, pin: PIN };
    const p = await app.instalacion.preparar({ lugar, datos, ahora });
    assert.ok(p.ok, JSON.stringify(p));
    const r = await app.instalacion.completar({ lugar, datos: { codigo: codigo!, desafioId: p.valor.desafioId, equipo: "PC de la oficina" }, ip: null, ahora });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.codigos.length, 10);

    const s = await app.sesiones.entrar({ dispositivo: r.valor.credencialEquipo, userId: r.valor.userId, pin: PIN, ip: null, ahora });
    assert.ok(s.ok);
    const o = await app.elevacion.opciones({ sesion: s.credencial, ahora });
    assert.ok(o.ok);
    assert.deepEqual({ ...o.valor }, { deConfianza: true, puedeConfiar: false, llaves: false, app: false, codigos: 10 });

    const mala = await app.elevacion.elevar({ sesion: s.credencial, contrasena: "otra cosa", factor: null, ip: null, ahora });
    assert.equal(mala.ok ? "ok" : mala.motivo, "NO_PERMITIDO");
    const buena = await app.elevacion.elevar({ sesion: s.credencial, contrasena: CONTRASENA, factor: null, ip: null, ahora });
    assert.ok(buena.ok, JSON.stringify(buena));
    assert.equal(buena.valor.deConfianza, true);
  });

  test("en otro equipo, sin factor no se confirma (ni cuenta como fallo); con un código y «confiar» pasa a serlo", async () => {
    const yo = await adminNueva("Luis Guerrero");
    const equipo = await crearEquipo(local, "PC de Luis");
    const ahora = Date.now();
    const cred = await entrar(equipo, yo.id, ahora);

    const sin = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASENA, factor: null, ip: null, ahora });
    assert.equal(sin.ok ? "ok" : sin.motivo, "INVALIDO");
    assert.equal(await fallosDe(yo.id), 0);
    const o = await local.app.elevacion.opciones({ sesion: cred, ahora });
    assert.ok(o.ok && o.valor.puedeConfiar && !o.valor.deConfianza);

    const con = await local.app.elevacion.elevar({ sesion: cred, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: yo.codigos[0]! }, confiar: true, ip: null, ahora });
    assert.ok(con.ok, JSON.stringify(con));
    assert.equal(con.valor.deConfianza, true);

    // Otra sesión en el mismo equipo: ya basta la contraseña.
    const otra = await entrar(equipo, yo.id, ahora + 1000);
    assert.ok((await local.app.elevacion.elevar({ sesion: otra, contrasena: CONTRASENA, factor: null, ip: null, ahora: ahora + 1000 })).ok);
  });

  test("la confianza es de esa persona: otra persona en el mismo equipo no la tiene", async () => {
    const luisa = await adminNueva("Luisa Prieto");
    const ana = await adminNueva("Ana Rojas");
    const equipo = await crearEquipo(local, "PC compartido");
    const ahora = Date.now();
    const s = await entrar(equipo, luisa.id, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: luisa.codigos[0]! }, confiar: true, ip: null, ahora })).ok);
    const deAna = await entrar(equipo, ana.id, ahora);
    const r = await local.app.elevacion.elevar({ sesion: deAna, contrasena: CONTRASENA, factor: null, ip: null, ahora });
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });

  test("retirar la confianza o revocar el equipo la quita, y queda en la auditoría", async () => {
    const yo = await adminNueva("Carla Benítez");
    const uno = await crearEquipo(local, "PC uno");
    const dos = await crearEquipo(local, "PC dos");
    const ahora = Date.now();
    for (const [equipo, codigo] of [
      [uno, yo.codigos[0]!],
      [dos, yo.codigos[1]!],
    ] as const) {
      const s = await entrar(equipo, yo.id, ahora);
      assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo }, confiar: true, ip: null, ahora })).ok);
    }
    const ctxUno = await contexto(await entrar(uno, yo.id, ahora), ahora);
    const sesionUno = await entrar(uno, yo.id, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: sesionUno, contrasena: CONTRASENA, factor: null, ip: null, ahora })).ok);
    const elevado = await contexto(sesionUno, ahora);
    const resumen = await local.app.enlaces.resumen(elevado);
    assert.ok(resumen.ok);
    const mias = resumen.valor.find((c) => c.userId === yo.id)!;
    assert.deepEqual(mias.equiposDeConfianza.map((e) => e.equipo).sort(), ["PC dos", "PC uno"]);

    // Sin la identidad confirmada no se toca.
    const sinElevar = await local.app.factores.retirarConfianza(ctxUno, { id: mias.equiposDeConfianza[0]!.id }, ahora);
    assert.equal(sinElevar.ok ? "ok" : sinElevar.motivo, "ELEVACION_REQUERIDA");

    const deDos = mias.equiposDeConfianza.find((e) => e.equipo === "PC dos")!;
    assert.ok((await local.app.factores.retirarConfianza(elevado, { id: deDos.id }, ahora)).ok);
    const s2 = await entrar(dos, yo.id, ahora + 1000);
    assert.equal(((await local.app.elevacion.elevar({ sesion: s2, contrasena: CONTRASENA, factor: null, ip: null, ahora: ahora + 1000 })) as { motivo?: string }).motivo, "INVALIDO");

    // Revocar el equipo: su confianza deja de contar sin tocarla.
    const deviceId = uno.split(".")[1]!;
    assert.ok((await local.app.dispositivos.ordenar(local.sistema, { kind: "REVOCAR", deviceId, reason: "Se lo llevaron" })).ok);
    const despues = await local.app.enlaces.resumen(local.sistema);
    assert.ok(despues.ok);
    assert.deepEqual(despues.valor.find((c) => c.userId === yo.id)!.equiposDeConfianza, []);

    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.auditEntry.findMany({ where: { action: "usuario.confianza", entityId: yo.id }, orderBy: { occurredAt: "asc" } }),
    );
    assert.equal(asientos.length, 3);
  });
});

describe("la app de autenticación", () => {
  test("configurarla exige la identidad confirmada y queda en vigor con el primer código; el secreto no se guarda en claro", async () => {
    const yo = await adminNueva("Jesús Mendoza");
    const equipo = await crearEquipo(local, "PC de Jesús");
    const ahora = Date.now();
    const s = await entrar(equipo, yo.id, ahora);
    const sinElevar = await local.app.factores.iniciarApp(await contexto(s, ahora), ahora);
    assert.equal(sinElevar.ok ? "ok" : sinElevar.motivo, "ELEVACION_REQUERIDA");

    assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: yo.codigos[0]! }, ip: null, ahora })).ok);
    const ctx = await contexto(s, ahora);
    const nueva = await local.app.factores.iniciarApp(ctx, ahora);
    assert.ok(nueva.ok, JSON.stringify(nueva));
    assert.match(nueva.valor.otpauth, /^otpauth:\/\/totp\/L2%20Control:/);
    const guardada = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.totpCredential.findFirstOrThrow({ where: { userId: yo.id } }));
    assert.ok(!guardada.secretEnc.includes(nueva.valor.secreto));
    assert.equal(guardada.confirmedAt, null);

    const mal = await local.app.factores.confirmarApp(ctx, { codigo: "000000" === codigoDeApp(nueva.valor.secreto, ahora) ? "111111" : "000000" }, ahora);
    assert.equal(mal.ok ? "ok" : mal.motivo, "INVALIDO");
    assert.ok((await local.app.factores.confirmarApp(ctx, { codigo: codigoDeApp(nueva.valor.secreto, ahora) }, ahora)).ok);

    const o = await local.app.elevacion.opciones({ sesion: s, ahora });
    assert.ok(o.ok && o.valor.app);
  });

  test("con el código de la app se confirma en cualquier equipo, y el mismo código no vale dos veces", async () => {
    const yo = await adminNueva("Diego Salas");
    const equipo = await crearEquipo(local, "PC de Diego");
    const ahora = Date.now();
    const s = await entrar(equipo, yo.id, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: yo.codigos[0]! }, ip: null, ahora })).ok);
    const ctx = await contexto(s, ahora);
    const nueva = await local.app.factores.iniciarApp(ctx, ahora);
    assert.ok(nueva.ok);
    assert.ok((await local.app.factores.confirmarApp(ctx, { codigo: codigoDeApp(nueva.valor.secreto, ahora) }, ahora)).ok);

    // El código con que se confirmó ya está gastado.
    const otroEquipo = await crearEquipo(local, "Laptop prestada");
    const t1 = ahora + 30_000;
    const s2 = await entrar(otroEquipo, yo.id, t1);
    const repetido = await local.app.elevacion.elevar({ sesion: s2, contrasena: CONTRASENA, factor: { tipo: "APP", codigo: codigoDeApp(nueva.valor.secreto, ahora) }, ip: null, ahora: t1 });
    assert.equal(repetido.ok ? "ok" : repetido.motivo, "NO_PERMITIDO");

    const codigo = codigoDeApp(nueva.valor.secreto, t1);
    const ok = await local.app.elevacion.elevar({ sesion: s2, contrasena: CONTRASENA, factor: { tipo: "APP", codigo }, ip: null, ahora: t1 });
    assert.ok(ok.ok, JSON.stringify(ok));
    const otraVez = await local.app.elevacion.elevar({ sesion: s2, contrasena: CONTRASENA, factor: { tipo: "APP", codigo }, ip: null, ahora: t1 + 1000 });
    assert.equal(otraVez.ok ? "ok" : otraVez.motivo, "NO_PERMITIDO");
  });

  test("aprobar un equipo desde sí mismo acepta el código de la app, que dice de quién es", async () => {
    const yo = await adminNueva("Marisol Prieto");
    const equipo = await crearEquipo(local, "PC de Marisol");
    const ahora = Date.now();
    const s = await entrar(equipo, yo.id, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: yo.codigos[0]! }, ip: null, ahora })).ok);
    const ctx = await contexto(s, ahora);
    const nueva = await local.app.factores.iniciarApp(ctx, ahora);
    assert.ok(nueva.ok);
    assert.ok((await local.app.factores.confirmarApp(ctx, { codigo: codigoDeApp(nueva.valor.secreto, ahora) }, ahora)).ok);

    const pendiente = await crearEquipo(local, "Tableta nueva", false);
    const t1 = ahora + 30_000;
    const r = await local.app.elevacion.aprobarEquipo({ dispositivo: pendiente, contrasena: CONTRASENA, factor: { tipo: "APP", codigo: codigoDeApp(nueva.valor.secreto, t1) }, ip: null, ahora: t1 });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.aprobadoPor, "Marisol Prieto");
  });

  test("quitarla deja sus códigos sin valor, y reponer las credenciales retira la app y las confianzas", async () => {
    const yo = await adminNueva("Abigail Karam");
    const equipo = await crearEquipo(local, "PC de Abigail");
    const ahora = Date.now();
    const s = await entrar(equipo, yo.id, ahora);
    assert.ok((await local.app.elevacion.elevar({ sesion: s, contrasena: CONTRASENA, factor: { tipo: "CODIGO", codigo: yo.codigos[0]! }, confiar: true, ip: null, ahora })).ok);
    const ctx = await contexto(s, ahora);
    const nueva = await local.app.factores.iniciarApp(ctx, ahora);
    assert.ok(nueva.ok);
    assert.ok((await local.app.factores.confirmarApp(ctx, { codigo: codigoDeApp(nueva.valor.secreto, ahora) }, ahora)).ok);

    assert.ok((await local.app.factores.retirarApp(ctx, { userId: yo.id }, ahora)).ok);
    const t1 = ahora + 30_000;
    const s2 = await entrar(await crearEquipo(local, "Otra PC"), yo.id, t1);
    const sinApp = await local.app.elevacion.elevar({ sesion: s2, contrasena: CONTRASENA, factor: { tipo: "APP", codigo: codigoDeApp(nueva.valor.secreto, t1) }, ip: null, ahora: t1 });
    assert.equal(sinApp.ok ? "ok" : sinApp.motivo, "NO_PERMITIDO");

    // Otra app, y después el enlace de alta que repone todo.
    const otra = await local.app.factores.iniciarApp(ctx, t1);
    assert.ok(otra.ok);
    assert.ok((await local.app.factores.confirmarApp(ctx, { codigo: codigoDeApp(otra.valor.secreto, t1) }, t1)).ok);
    await altaSinLlave(yo.id, t1);
    const resumen = await local.app.enlaces.resumen(local.sistema);
    assert.ok(resumen.ok);
    const mias = resumen.valor.find((c) => c.userId === yo.id)!;
    assert.equal(mias.app, false);
    assert.deepEqual(mias.equiposDeConfianza, []);
  });
});
