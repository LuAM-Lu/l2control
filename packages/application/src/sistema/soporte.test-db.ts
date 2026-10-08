/**
 * Reportar un problema, contra l2control_test — T-11 (M-27, P-4, D-SOP).
 *
 * Lo que fijan: quién, su rol y el equipo los pone el servidor; la captura se guarda aparte y solo si es una imagen; los
 * reportes del mismo error se agrupan y quien reporta ve cómo va; cada uno ve los suyos y la bandeja es de quien atiende
 * el soporte; el estado es el último paso de la historia, que nada borra; el aviso por correo se reintenta con espera y
 * se deja tras unos fallos. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { INTENTOS_DE_AVISO } from "./soporte.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-07T14:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

/** Un JPEG mínimo (la cabecera basta para reconocerlo) y algo que no es una imagen. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]).toString("base64");
const NO_IMAGEN = Buffer.from("esto no es una imagen").toString("base64");

let l: LocalDePrueba;
let cajera: Contexto;
let monitora: Contexto;
let admin: Contexto;

const reporte = (extra: Record<string, unknown> = {}) => ({
  texto: "No me deja cobrar en bolívares",
  ruta: "/caja",
  version: "0.71.0",
  errores: ["Sin tasa confirmada del día no se puede cobrar en esa moneda"],
  ...extra,
});

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba soporte");
  const caja = await crearEquipo(l, "Laptop caja");
  const telefono = await crearEquipo(l, "Teléfono monitora");
  cajera = await contextoDe(l, caja, await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" }), "7391");
  monitora = await contextoDe(l, telefono, await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" }), "6284");
  const oficina = await crearEquipo(l, "PC oficina");
  admin = await contextoDe(l, oficina, await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" }), "4826");
});

after(async () => {
  await l.cerrar();
});

describe("reportar", () => {
  test("quién, su rol y el equipo los pone el servidor; la captura va aparte y la ven quien lo envió y el soporte", async () => {
    const r = valor(await l.app.soporte.reportar(cajera, reporte({ captura: { tipo: "image/jpeg", base64: JPEG } }), AHORA));
    assert.equal(r.reporte.numero, 1);
    assert.deepEqual(r.reporte.quien, { nombre: "Marisol Prieto", rol: "CAJERO" });
    assert.equal(r.reporte.equipo, "Laptop caja");
    assert.equal(r.reporte.estado, "NUEVO");
    assert.equal(r.reporte.aviso, "PENDIENTE");
    assert.equal(r.reporte.conCaptura, true);
    assert.equal(r.conocido, null);
    const c = valor(await l.app.soporte.captura(cajera, r.reporte.id));
    assert.equal(c.tipo, "image/jpeg");
    assert.equal(Buffer.from(c.bytes).toString("base64"), JPEG);
    assert.ok(valor(await l.app.soporte.captura(admin, r.reporte.id)).bytes.length > 0);
    const ajena = await l.app.soporte.captura(monitora, r.reporte.id);
    assert.equal(!ajena.ok && ajena.motivo, "NO_PERMITIDO");
    // El asiento dice qué y dónde, sin lo que contó la persona.
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "support_report", entityId: r.reporte.id });
    assert.deepEqual(asientos.map((a) => a.action), ["soporte.reportar"]);
    assert.ok(!JSON.stringify(asientos).includes("bolívares"));
  });

  test("lo que no es una imagen no se guarda, y un reporte sin texto ni sesión tampoco", async () => {
    const mala = await l.app.soporte.reportar(cajera, reporte({ captura: { tipo: "image/png", base64: NO_IMAGEN } }), AHORA);
    assert.equal(!mala.ok && mala.motivo, "INVALIDO");
    const corto = await l.app.soporte.reportar(cajera, reporte({ texto: "no" }), AHORA);
    assert.equal(!corto.ok && corto.motivo, "INVALIDO");
    const conConsulta = await l.app.soporte.reportar(cajera, reporte({ ruta: "/caja?cuenta=123" }), AHORA);
    assert.equal(!conConsulta.ok && conConsulta.motivo, "INVALIDO");
    const sinSesion = await l.app.soporte.reportar({ tenantId: l.sistema.tenantId, branchId: l.sistema.branchId }, reporte(), AHORA);
    assert.equal(!sinSesion.ok && sinSesion.motivo, "NO_PERMITIDO");
    const mios = valor(await l.app.soporte.mios(cajera)).reportes;
    assert.equal(mios.length, 1);
  });

  test("el mismo error, con otra cifra, se agrupa: quien lo reporta ve que ya se conoce y cómo va", async () => {
    const primero = valor(await l.app.soporte.bandeja(admin)).reportes.at(-1)!;
    valor(await l.app.soporte.estado(admin, { reporteId: primero.id, estado: "EN_CURSO", nota: "Revisando la tasa" }, AHORA + MIN));
    const otro = valor(
      await l.app.soporte.reportar(monitora, reporte({ texto: "Tampoco cobra", errores: ["Sin tasa confirmada del día no se puede cobrar en esa moneda"] }), AHORA + 2 * MIN),
    );
    assert.deepEqual(otro.conocido, { antes: 1, estado: "EN_CURSO", resueltoEn: null });
    assert.equal(otro.reporte.iguales, 1);
    // Otro error, otro grupo.
    const distinto = valor(await l.app.soporte.reportar(monitora, reporte({ texto: "La pulsera no lee", errores: ["Código no reconocido: AK-0142"] }), AHORA + 3 * MIN));
    assert.equal(distinto.conocido, null);
    const conCifra = valor(await l.app.soporte.reportar(cajera, reporte({ texto: "Otra vez", errores: ["Código no reconocido: AK-0977"] }), AHORA + 4 * MIN));
    assert.equal(conCifra.conocido?.antes, 1);
  });
});

describe("la bandeja y los estados", () => {
  test("cada quien ve los suyos; la bandeja es de quien atiende el soporte", async () => {
    const deMonitora = valor(await l.app.soporte.mios(monitora)).reportes;
    assert.ok(deMonitora.length >= 2 && deMonitora.every((r) => r.quien.nombre === "Ana Rojas"));
    const bandeja = await l.app.soporte.bandeja(cajera);
    assert.equal(!bandeja.ok && bandeja.motivo, "NO_PERMITIDO");
    const todos = valor(await l.app.soporte.bandeja(admin)).reportes;
    assert.deepEqual(todos.map((r) => r.numero), [...todos.map((r) => r.numero)].sort((a, b) => b - a));
  });

  test("el estado es el último paso de la historia; resuelto dice en qué versión, y nada se borra", async () => {
    const primero = valor(await l.app.soporte.bandeja(admin)).reportes.at(-1)!;
    const resuelto = valor(await l.app.soporte.estado(admin, { reporteId: primero.id, estado: "RESUELTO", version: "0.72.0" }, AHORA + 10 * MIN));
    assert.equal(resuelto.estado, "RESUELTO");
    assert.equal(resuelto.resueltoEn, "0.72.0");
    assert.deepEqual(resuelto.historia.map((h) => [h.estado, h.por]), [["EN_CURSO", "Abigail Karam"], ["RESUELTO", "Abigail Karam"]]);
    // Quien lo envió lo ve en «Mis reportes».
    assert.equal(valor(await l.app.soporte.mios(cajera)).reportes.find((r) => r.id === primero.id)?.resueltoEn, "0.72.0");
    // Quien no atiende el soporte no cambia nada.
    const cajeraCambia = await l.app.soporte.estado(cajera, { reporteId: primero.id, estado: "VISTO" }, AHORA);
    assert.equal(!cajeraCambia.ok && cajeraCambia.motivo, "NO_PERMITIDO");
    // Resuelto exige su versión.
    const sinVersion = await l.app.soporte.estado(admin, { reporteId: primero.id, estado: "RESUELTO" }, AHORA);
    assert.equal(!sinVersion.ok && sinVersion.motivo, "INVALIDO");
    // La base no deja corregir ni borrar la historia.
    await assert.rejects(l.base.conTenant(l.sistema.tenantId, (tx) => tx.supportReportStatus.deleteMany({ where: { reportId: primero.id } })));
  });
});

describe("el aviso por correo", () => {
  test("espera los que no se avisaron; uno enviado sale de la lista; un fallo se reintenta con espera y se deja tras varios", async () => {
    const pendientes = await l.app.soporte.porAvisar(l.sistema, AHORA + 20 * MIN);
    assert.ok(pendientes.length >= 4);
    const [a, b] = pendientes;
    // Lo que va al correo: el número, la versión y la pantalla; nada del texto.
    assert.deepEqual(Object.keys(a!).sort(), ["codigoError", "id", "iguales", "intentos", "numero", "ruta", "version"]);
    await l.app.soporte.anotarAviso(l.sistema, a!.id, true, null, AHORA + 20 * MIN);
    await l.app.soporte.anotarAviso(l.sistema, b!.id, false, "El servidor de correo no respondió", AHORA + 20 * MIN);
    const despues = await l.app.soporte.porAvisar(l.sistema, AHORA + 21 * MIN);
    assert.ok(!despues.some((p) => p.id === a!.id));
    assert.ok(!despues.some((p) => p.id === b!.id), "recién fallado, espera");
    assert.ok((await l.app.soporte.porAvisar(l.sistema, AHORA + 31 * MIN)).some((p) => p.id === b!.id), "pasados 10 minutos, se reintenta");
    for (let i = 1; i < INTENTOS_DE_AVISO; i++) await l.app.soporte.anotarAviso(l.sistema, b!.id, false, "Sigue sin responder", AHORA + (40 + i) * MIN);
    assert.ok(!(await l.app.soporte.porAvisar(l.sistema, AHORA + 10_000 * MIN)).some((p) => p.id === b!.id), "tras varios fallos se deja");
    const enBandeja = valor(await l.app.soporte.bandeja(admin)).reportes;
    assert.equal(enBandeja.find((r) => r.id === a!.id)?.aviso, "ENVIADO");
    assert.equal(enBandeja.find((r) => r.id === b!.id)?.aviso, "FALLO");
  });
});
