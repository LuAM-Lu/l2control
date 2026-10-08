/**
 * La instalación inicial con la base vacía (ADR-020, M-12, JORNADA §2) contra l2control_test.
 *
 * Cada prueba usa un tenant recién inventado: es exactamente una base sin ese local.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DEFAULT_LOCKOUT_POLICY } from "@l2/domain-identity";
import { borrarTenantsDePrueba } from "@l2/database/para-pruebas";
import { abrirBase, type Base } from "@l2/database";
import { conectar, contextoDeSesion, type Aplicacion } from "../index.ts";
import { CLAVE_DE_PRUEBA, LlaveDePrueba, URL_DE_PRUEBA, elevarConLlave } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let app: Aplicacion;
let base: Base;
const usados: string[] = [];

before(async () => {
  app = await conectar(URL_APP, { claveCifrado: CLAVE_DE_PRUEBA, urlPublica: URL_DE_PRUEBA });
  base = await abrirBase(URL_APP);
});
after(async () => {
  await borrarTenantsDePrueba(URL_APP, usados);
  await Promise.all([app.cerrar(), base.cerrar()]);
});

const lugarNuevo = () => {
  const lugar = { tenantId: randomUUID(), branchId: randomUUID() };
  usados.push(lugar.tenantId);
  return lugar;
};
const datos = (codigo: string, cambios: Record<string, unknown> = {}) => ({
  codigo,
  local: "Abby Kingdom",
  sucursal: "Principal",
  nombre: "Abigail Karam",
  contrasena: "parque de niños 2026",
  pin: "4826",
  ...cambios,
});
/** Los dos pasos de la pantalla: datos y llave. */
async function instalar(lugar: { tenantId: string; branchId: string }, codigo: string, llave: LlaveDePrueba, ahora = Date.now()) {
  const p = await app.instalacion.preparar({ lugar, datos: datos(codigo), ahora });
  if (!p.ok) return p;
  return app.instalacion.completar({
    lugar,
    datos: { codigo, desafioId: p.valor.desafioId, respuesta: llave.registrar(p.valor.opciones), etiqueta: "PC de la oficina", equipo: "PC de la oficina" },
    ip: "10.4.4.4",
    ahora,
  });
}

describe("el código de instalación", () => {
  test("con la base vacía el servidor emite un código; la base solo guarda su huella", async () => {
    const lugar = lugarNuevo();
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: false });
    const codigo = await app.instalacion.emitirCodigo(lugar, Date.now());
    assert.match(codigo!, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    const fila = await base.conTenant(lugar.tenantId, (tx) => tx.installation.findUnique({ where: { tenantId: lugar.tenantId } }));
    assert.match(fila!.codeHash!, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(fila).includes(codigo!.replace("-", "")));
  });

  test("cada arranque emite uno nuevo, y el anterior deja de valer", async () => {
    const lugar = lugarNuevo();
    const primero = await app.instalacion.emitirCodigo(lugar, Date.now());
    const segundo = await app.instalacion.emitirCodigo(lugar, Date.now());
    assert.notEqual(primero, segundo);
    const r = await app.instalacion.preparar({ lugar, datos: datos(primero!), ahora: Date.now() });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    assert.ok((await app.instalacion.preparar({ lugar, datos: datos(segundo!), ahora: Date.now() })).ok);
  });

  test("sin código emitido no hay instalación, y la pantalla dice dónde está", async () => {
    const lugar = lugarNuevo();
    const r = await app.instalacion.preparar({ lugar, datos: datos("K7F2Q-X9B3M"), ahora: Date.now() });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    if (!r.ok) assert.match(r.mensaje, /registro/);
  });

  test("un código equivocado se dice, y tras varios fallos se bloquea aunque llegue el bueno", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    for (let i = 0; i < DEFAULT_LOCKOUT_POLICY.freeAttempts; i++) {
      const r = await app.instalacion.preparar({ lugar, datos: datos("AAAAA-AAAAA"), ahora: ahora + i });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    }
    const bloqueado = await app.instalacion.preparar({ lugar, datos: datos(codigo!), ahora: ahora + 10 });
    assert.equal(bloqueado.ok, false);
    if (!bloqueado.ok) assert.equal(bloqueado.bloqueo?.bloqueado, true);
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: false });
  });

  test("se acepta como se copia de la consola: en minúsculas y sin guion", async () => {
    const lugar = lugarNuevo();
    const codigo = await app.instalacion.emitirCodigo(lugar, Date.now());
    const r = await app.instalacion.preparar({ lugar, datos: datos(codigo!.toLowerCase().replace("-", "")), ahora: Date.now() });
    assert.ok(r.ok, JSON.stringify(r));
  });
});

describe("lo que se pide", () => {
  test("un PIN trivial, una contraseña corta o un nombre vacío no pasan, y no se crea nada", async () => {
    const lugar = lugarNuevo();
    const codigo = await app.instalacion.emitirCodigo(lugar, Date.now());
    for (const cambios of [{ pin: "1234" }, { pin: "0000" }, { contrasena: "corta" }, { nombre: " " }, { local: "" }, { role: "ADMIN" }]) {
      const r = await app.instalacion.preparar({ lugar, datos: datos(codigo!, cambios), ahora: Date.now() });
      assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO", JSON.stringify(cambios));
    }
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: false });
    const filas = await base.conTenant(lugar.tenantId, (tx) => tx.authChallenge.count());
    assert.equal(filas, 0);
  });

  test("entre los dos pasos no viaja ni se guarda la contraseña ni el PIN, solo su Argon2id", async () => {
    const lugar = lugarNuevo();
    const codigo = await app.instalacion.emitirCodigo(lugar, Date.now());
    const p = await app.instalacion.preparar({ lugar, datos: datos(codigo!), ahora: Date.now() });
    assert.ok(p.ok);
    const desafio = await base.conTenant(lugar.tenantId, (tx) => tx.authChallenge.findFirst());
    const texto = JSON.stringify(desafio) + JSON.stringify(p.valor);
    // El PIN, como valor (entre comillas): «4826» suelto sale a veces por azar dentro de un UUID o de un hash.
    assert.ok(!texto.includes("parque de niños 2026") && !texto.includes('"4826"'));
    assert.match(JSON.stringify(desafio!.payload), /argon2id/);
    assert.ok(!JSON.stringify(p.valor).includes("argon2id"), "al navegador no le llega ni el hash");
  });
});

describe("instalar", () => {
  test("de la base vacía sale un local operativo: administración, llave, diez códigos y este equipo aprobado", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    const llave = new LlaveDePrueba();
    const r = await instalar(lugar, codigo!, llave, ahora);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.valor.nombre, "Abigail Karam");
    assert.equal(r.valor.codigos.length, 10);
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: true });

    // Sin tocar la consola: el equipo ya está aprobado y la persona entra con su PIN…
    assert.equal((await app.dispositivos.identificar(r.valor.credencialEquipo)).estado, "APROBADO");
    const s = await app.sesiones.entrar({ dispositivo: r.valor.credencialEquipo, userId: r.valor.userId, pin: "4826", ip: null, ahora });
    assert.ok(s.ok, JSON.stringify(s));
    assert.equal(s.sesion.role, "ADMIN");
    // …confirma identidad con la contraseña y la llave que acaba de registrar…
    const d = await app.elevacion.desafio({ sesion: s.credencial, ahora });
    assert.ok(d.ok);
    const e = await app.elevacion.elevar({
      sesion: s.credencial,
      contrasena: "parque de niños 2026",
      factor: { tipo: "LLAVE", desafioId: d.valor.desafioId, respuesta: llave.firmar(d.valor.opciones) },
      ip: null,
      ahora,
    });
    assert.ok(e.ok, JSON.stringify(e));
    // …y ya gestiona el local: da de alta a otra persona.
    const ctx = contextoDeSesion((await app.sesiones.consultar(s.credencial, ahora))!, null);
    const alta = await app.equipo.cambiar(ctx, { kind: "ALTA", fullName: "Marisol Prieto", role: "CAJERO", branchIds: [lugar.branchId], reason: "Primera cajera del local" });
    assert.ok(alta.ok, JSON.stringify(alta));

    // El local nace con sus medios de pago, y todo quedó en la auditoría sin ningún secreto.
    const sistema = { ...lugar, sistema: true as const };
    const medios = await app.medios.leer(sistema);
    assert.ok(medios.ok);
    const asientos = await app.auditoria.listar(sistema, { limite: 100 });
    for (const accion of ["instalacion.completar", "usuario.alta", "usuario.llave", "dispositivo.aprobar"]) {
      assert.ok(asientos.some((a) => a.action === accion), accion);
    }
    const texto = JSON.stringify(asientos);
    assert.ok(!texto.includes("parque de niños 2026") && !texto.includes(codigo!.replace("-", "")));
    for (const c of r.valor.codigos) assert.ok(!texto.includes(c));
  });

  test("hecha la instalación, la pantalla deja de existir: ni con el mismo código ni con uno nuevo", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    assert.ok((await instalar(lugar, codigo!, new LlaveDePrueba(), ahora)).ok);

    assert.equal(await app.instalacion.emitirCodigo(lugar, ahora + 1), null, "ya no se emiten códigos");
    const otra = await app.instalacion.preparar({ lugar, datos: datos(codigo!, { nombre: "Intruso Oportunista" }), ahora: ahora + 1 });
    assert.equal(otra.ok ? "ok" : otra.motivo, "NO_PERMITIDO");
    const personas = await base.conTenant(lugar.tenantId, (tx) => tx.staffUser.count());
    assert.equal(personas, 1);
    // La base tampoco deja deshacer la constancia, ni siquiera a la aplicación.
    await assert.rejects(base.conTenant(lugar.tenantId, (tx) => tx.installation.update({ where: { tenantId: lugar.tenantId }, data: { completedAt: null, completedByName: null, codeHash: "0".repeat(64), issuedAt: new Date() } })));
    await assert.rejects(base.conTenant(lugar.tenantId, (tx) => tx.installation.delete({ where: { tenantId: lugar.tenantId } })));
  });

  test("un local que ya existía (sembrado o de antes de este paso) cuenta como instalado", async () => {
    const lugar = lugarNuevo();
    await app.sucursal.asegurar({ ...lugar, sistema: true }, { tenant: "Local de antes", sucursal: "Principal" });
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: true });
    assert.equal(await app.instalacion.emitirCodigo(lugar, Date.now()), null);
    const r = await app.instalacion.preparar({ lugar, datos: datos("K7F2Q-X9B3M"), ahora: Date.now() });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("sin la llave no se sigue: una respuesta falsa, de otro sitio o repetida no instala nada", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    const p = await app.instalacion.preparar({ lugar, datos: datos(codigo!), ahora });
    assert.ok(p.ok);
    const completar = (respuesta: unknown, desafioId = p.valor.desafioId) =>
      app.instalacion.completar({ lugar, datos: { codigo, desafioId, respuesta, etiqueta: "PC", equipo: "PC oficina" }, ip: null, ahora });

    const deOtroSitio = await completar(new LlaveDePrueba("https://otro.ejemplo.com").registrar(p.valor.opciones));
    assert.equal(deOtroSitio.ok ? "ok" : deOtroSitio.motivo, "NO_PERMITIDO");
    // El desafío se gastó con el intento: la respuesta buena ya no vale, hay que volver al primer paso.
    const tarde = await completar(new LlaveDePrueba().registrar(p.valor.opciones));
    assert.equal(tarde.ok ? "ok" : tarde.motivo, "NO_PERMITIDO");
    const inventado = await completar({ id: "x", response: {} }, randomUUID());
    assert.equal(inventado.ok ? "ok" : inventado.motivo, "NO_PERMITIDO");
    assert.deepEqual(await app.instalacion.estado(lugar), { instalado: false });
    assert.equal(await base.conTenant(lugar.tenantId, (tx) => tx.staffUser.count()), 0);
    // Empezando de nuevo, se instala.
    assert.ok((await instalar(lugar, codigo!, new LlaveDePrueba(), ahora + 1)).ok);
  });

  test("dos instalaciones a la vez: una gana y la otra se niega", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    const pasos = await Promise.all([0, 1].map(() => app.instalacion.preparar({ lugar, datos: datos(codigo!), ahora })));
    const respuestas = await Promise.allSettled(
      pasos.map((p) => {
        assert.ok(p.ok);
        return app.instalacion.completar({
          lugar,
          datos: { codigo, desafioId: p.valor.desafioId, respuesta: new LlaveDePrueba().registrar(p.valor.opciones), etiqueta: "PC", equipo: "PC oficina" },
          ip: null,
          ahora,
        });
      }),
    );
    const hechas = respuestas.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    assert.equal(hechas, 1);
    assert.equal(await base.conTenant(lugar.tenantId, (tx) => tx.staffUser.count()), 1);
    assert.equal(await base.conTenant(lugar.tenantId, (tx) => tx.device.count()), 1);
  });

  test("sin la dirección pública configurada, no se instala (fail-closed)", async () => {
    const sin = await conectar(URL_APP, { claveCifrado: CLAVE_DE_PRUEBA });
    try {
      const lugar = lugarNuevo();
      const codigo = await sin.instalacion.emitirCodigo(lugar, Date.now());
      const r = await sin.instalacion.preparar({ lugar, datos: datos(codigo!), ahora: Date.now() });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_DISPONIBLE");
    } finally {
      await sin.cerrar();
    }
  });
});

describe("la puesta a punto", () => {
  test("recién instalado, casi todo falta; se tacha sola cuando el dato existe", async () => {
    const lugar = lugarNuevo();
    const ahora = Date.now();
    const codigo = await app.instalacion.emitirCodigo(lugar, ahora);
    const llave = new LlaveDePrueba();
    const r = await instalar(lugar, codigo!, llave, ahora);
    assert.ok(r.ok);
    const s = await app.sesiones.entrar({ dispositivo: r.valor.credencialEquipo, userId: r.valor.userId, pin: "4826", ip: null, ahora });
    assert.ok(s.ok);
    // Verla no pide confirmar identidad: no enseña nada que no sea «falta esto».
    const ctx = contextoDeSesion(s.sesion, null);
    const antes = await app.puestaAPunto.leer(ctx);
    assert.ok(antes.ok, JSON.stringify(antes));
    assert.equal(antes.valor.puntos.length, 14);
    const de = (v: typeof antes.valor, id: string) => v.puntos.find((p) => p.id === id)!;
    // «medios» también: el USDT nace encendido, pero no es un medio con datos del local.
    // Instalado con llave, ya confirma fuera de su equipo de confianza: ese punto nace hecho.
    assert.equal(de(antes.valor, "otros_equipos").hecho, true);
    for (const id of ["personas", "equipos", "tarifas", "impuestos", "tasa", "medios", "catalogo", "impresoras", "carta_y_plano", "segunda_administracion"]) {
      assert.equal(de(antes.valor, id).hecho, false, id);
    }
    assert.equal(de(antes.valor, "tarifas").bloquea, "La entrada al parque");
    assert.equal(de(antes.valor, "feriados").bloquea, null);
    assert.ok(antes.valor.pendientesQueBloquean >= 7);

    // Se publica el tarifario y se da de alta a alguien: los dos puntos se tachan solos.
    const elevada = await elevarConLlave({ app }, s.credencial, { llave, contrasena: "parque de niños 2026" }, ahora);
    assert.ok(elevada.ok, JSON.stringify(elevada));
    const admin = contextoDeSesion((await app.sesiones.consultar(s.credencial, ahora))!, null);
    const tarifario = {
      packages: [{ id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: { minor: "300", currency: "USD" }, active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: { minor: "150", currency: "USD" }, warnBeforeMinutes: 10, capacityLimit: 30 },
    };
    assert.ok((await app.tarifario.publicar(admin, tarifario)).ok);
    const alta = await app.equipo.cambiar(admin, { kind: "ALTA", fullName: "Marisol Prieto", role: "CAJERO", branchIds: [lugar.branchId], reason: "Primera cajera del local" });
    assert.ok(alta.ok);
    const despues = await app.puestaAPunto.leer(admin);
    assert.ok(despues.ok);
    assert.equal(de(despues.valor, "tarifas").hecho, true);
    assert.equal(de(despues.valor, "personas").hecho, true);
    assert.equal(despues.valor.pendientesQueBloquean, antes.valor.pendientesQueBloquean - 2);

    // La cajera no la ve: no puede arreglar nada de la lista.
    const temporal = alta.valor.pinTemporal!;
    // El temporal es aleatorio: el propio tiene que ser otro.
    const caja = await app.sesiones.entrar({ dispositivo: r.valor.credencialEquipo, userId: alta.valor.usuario.id, pin: temporal, pinNuevo: temporal === "7391" ? "5927" : "7391", ip: null, ahora: ahora + 5 });
    assert.ok(caja.ok, JSON.stringify(caja));
    const negada = await app.puestaAPunto.leer(contextoDeSesion(caja.sesion, null));
    assert.equal(negada.ok ? "ok" : negada.motivo, "NO_PERMITIDO");

    // Un recomendable se deja para después (y se retoma); lo que bloquea, no (T-8b).
    const conFeriados = await app.puestaAPunto.posponer(admin, { id: "feriados", paraDespues: true }, ahora + 10);
    assert.ok(conFeriados.ok, JSON.stringify(conFeriados));
    assert.equal(de(conFeriados.valor, "feriados").paraDespues?.por, "Abigail Karam");
    assert.equal(conFeriados.valor.pendientesQueBloquean, despues.valor.pendientesQueBloquean);
    const otraVez = await app.puestaAPunto.posponer(admin, { id: "feriados", paraDespues: true }, ahora + 11);
    assert.ok(otraVez.ok, "dejarlo para después dos veces no duplica nada");
    const bloqueante = await app.puestaAPunto.posponer(admin, { id: "impuestos", paraDespues: true }, ahora + 12);
    assert.equal(bloqueante.ok ? "ok" : bloqueante.motivo, "INVALIDO");
    const retomado = await app.puestaAPunto.posponer(admin, { id: "feriados", paraDespues: false }, ahora + 13);
    assert.ok(retomado.ok);
    assert.equal(de(retomado.valor, "feriados").paraDespues, null);
    const cajaNo = await app.puestaAPunto.posponer(contextoDeSesion(caja.sesion, null), { id: "feriados", paraDespues: true }, ahora + 14);
    assert.equal(cajaNo.ok ? "ok" : cajaNo.motivo, "NO_PERMITIDO");
  });
});
