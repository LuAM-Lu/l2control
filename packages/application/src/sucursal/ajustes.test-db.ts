/**
 * Los ajustes de la sucursal en el servidor, contra l2control_test — B4-4, F5-08b.
 *
 * Valores de fábrica sin inventar datos, permiso con elevación, versión optimista, auditoría con su
 * evento en vivo, aislamiento, la zona que no se cambia con el local en marcha y que decide el día
 * de negocio, y las huérfanas con las horas del local. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AjustesSucursalDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import {
  abrirLocalDePrueba,
  contextoDe,
  contextoElevado,
  crearEquipo,
  crearPersona,
  familiaDePrueba,
  type LocalDePrueba,
} from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 27 de septiembre de 2026, 10:00 pm en Caracas; ya lunes 28 en Madrid (4:00 am). */
const NOCHE = Date.parse("2026-09-28T02:00:00.000Z");
const HORA = 3_600_000;
const FONDO_CERO = [
  { currency: "USD", amount: { minor: "0", currency: "USD" } },
  { currency: "VES", amount: { minor: "0", currency: "VES" } },
];

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let admin: Contexto;
let adminSinElevar: Contexto;
let cajera: Contexto;

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba ajustes");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba ajustes B");
  const abigail = await crearPersona(l, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  admin = await contextoElevado(l, await crearEquipo(l, "Oficina"), { id: abigail, nombre: "Abigail Karam", pin: "4826" });
  adminSinElevar = await contextoDe(l, await crearEquipo(l, "Oficina 2"), abigail, "4826");
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

const vigentes = (ctx: Contexto = l.sistema) => l.app.ajustes.leer(ctx);
const publicar = async (ctx: Contexto, cambio: Partial<AjustesSucursalDto>) => {
  const v = await vigentes(ctx);
  return l.app.ajustes.publicar(ctx, { versionBase: v.version, ajustes: { ...v.ajustes, ...cambio } });
};
const asientos = (local: LocalDePrueba) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.auditEntry.findMany({ where: { action: "sucursal.ajustar" }, orderBy: { occurredAt: "asc" } }));

describe("sin publicar, los valores de fábrica", () => {
  test("son los que usaba el código, con el nombre del local y sin datos inventados", async () => {
    const v = await vigentes();
    assert.equal(v.version, 0);
    assert.equal(v.publicadoEn, null);
    assert.equal(v.publicadoPor, null);
    assert.equal(v.ajustes.nombre, "Prueba ajustes");
    assert.equal(v.ajustes.rif, null);
    assert.equal(v.ajustes.direccionFiscal, null);
    assert.equal(v.ajustes.horario, null);
    assert.equal(v.ajustes.formatoHora, "12h");
    assert.equal(v.ajustes.zonaHoraria, "America/Caracas");
    assert.deepEqual(v.ajustes.maxRetenido, { minor: "5", currency: "USD" });
    assert.deepEqual(v.ajustes.umbralArqueo, { minor: "100", currency: "USD" });
    assert.equal(v.ajustes.horasHuerfana, 8);
  });
});

describe("publicar", () => {
  test("la cajera no puede, y el intento queda en la auditoría", async () => {
    const r = await publicar(cajera, { formatoHora: "24h" });
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO", JSON.stringify(r));
    const negados = (await asientos(l)).filter((a) => a.outcome === "NEGADO");
    assert.equal(negados.length, 1);
    assert.equal((await vigentes()).version, 0);
  });

  test("administración sin confirmar su identidad tiene que elevar (F2-04)", async () => {
    const r = await publicar(adminSinElevar, { formatoHora: "24h" });
    assert.equal(!r.ok && r.motivo, "ELEVACION_REQUERIDA", JSON.stringify(r));
  });

  test("administración elevada publica la versión 1, a su nombre, y es la que rige", async () => {
    const r = valor(await publicar(admin, { formatoHora: "24h", rif: "J-40123456-7", umbralArqueo: { minor: "50", currency: "USD" } }));
    assert.equal(r.version, 1);
    assert.equal(r.publicadoPor, "Abigail Karam");
    assert.ok(r.publicadoEn);
    const v = await vigentes();
    assert.equal(v.version, 1);
    assert.equal(v.ajustes.formatoHora, "24h");
    assert.equal(v.ajustes.rif, "J-40123456-7");
    assert.deepEqual(v.ajustes.umbralArqueo, { minor: "50", currency: "USD" });
  });

  test("el asiento dice lo que había y lo que queda, y el cambio sale en vivo con su tema", async () => {
    const hecho = (await asientos(l)).filter((a) => a.outcome === "HECHO").at(-1)!;
    const antes = hecho.before as { version: number; ajustes: AjustesSucursalDto };
    const despues = hecho.after as { version: number; ajustes: AjustesSucursalDto };
    assert.equal(antes.version, 0);
    assert.equal(antes.ajustes.formatoHora, "12h");
    assert.equal(despues.version, 1);
    assert.equal(despues.ajustes.formatoHora, "24h");
    const eventos = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.outboxEvent.findMany({ where: { action: "sucursal.ajustar" } }));
    assert.equal(eventos.length, 1);
    assert.ok(temasDe("sucursal.ajustar").includes("sucursal"));
  });

  test("sobre una versión que ya no es la vigente, CONFLICTO y no se guarda nada", async () => {
    const v = await vigentes();
    const r = await l.app.ajustes.publicar(admin, { versionBase: 0, ajustes: { ...v.ajustes, formatoHora: "12h" } });
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.equal((await vigentes()).version, 1);
  });

  test("el servidor revalida con el contrato: lo inválido vuelve con sus problemas", async () => {
    const v = await vigentes();
    const r = await l.app.ajustes.publicar(admin, { versionBase: 1, ajustes: { ...v.ajustes, horasHuerfana: 1, rif: "123" } });
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    const campos = !r.ok ? (r.problemas ?? []).map((p) => p.path.join(".")) : [];
    assert.ok(campos.includes("ajustes.horasHuerfana"), campos.join());
    assert.ok(campos.includes("ajustes.rif"), campos.join());
    assert.equal((await vigentes()).version, 1);
  });

  test("la sucursal no la declara el navegador: se publica en la de la sesión", async () => {
    const v = await vigentes();
    const r = valor(await l.app.ajustes.publicar(admin, { versionBase: 1, ajustes: { ...v.ajustes, branchId: l.otraSucursal, nombre: "Sede principal" } }));
    assert.equal(r.ajustes.nombre, "Sede principal");
    const deLaOtra = await l.app.ajustes.leer({ ...l.sistema, branchId: l.otraSucursal });
    assert.equal(deLaOtra.version, 0);
    assert.equal(deLaOtra.ajustes.nombre, "Prueba ajustes");
  });
});

describe("aislamiento", () => {
  test("otro local no ve los ajustes de este: sigue con los de fábrica", async () => {
    const v = await otro.app.ajustes.leer(otro.sistema);
    assert.equal(v.version, 0);
    assert.equal(v.ajustes.formatoHora, "12h");
    assert.deepEqual(await asientos(otro), []);
  });
});

describe("la zona horaria decide el día de negocio (ADR-009)", () => {
  test("con el local parado se cambia, y el turno que se abre después es del día de la zona nueva", async () => {
    valor(await publicar(admin, { zonaHoraria: "Europe/Madrid" }));
    // A las 10:00 pm del domingo en Caracas, en Madrid ya es lunes.
    const turno = valor(await l.app.turnos.abrir(cajera, { fondos: FONDO_CERO }, undefined, NOCHE));
    assert.equal(turno.businessDate, "2026-09-28");
  });

  test("con un turno abierto no se cambia (partiría su día en dos); otra cosa, sí", async () => {
    const r = await publicar(admin, { zonaHoraria: "America/Caracas" });
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /turnos abiertos/);
    assert.equal((await vigentes()).ajustes.zonaHoraria, "Europe/Madrid");
    valor(await publicar(admin, { formatoHora: "12h" }));
  });

  test("con niños en sala tampoco", async () => {
    await familiaDePrueba(otro, otro.sistema, NOCHE);
    const v = await otro.app.ajustes.leer(otro.sistema);
    const r = await otro.app.ajustes.publicar(otro.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, zonaHoraria: "Europe/Madrid" } });
    assert.equal(!r.ok && r.motivo, "CONFLICTO", JSON.stringify(r));
    assert.match(!r.ok ? r.mensaje : "", /niños en sala/);
    // Lo demás sí se publica, y sin persona queda a nombre de la consola del servidor.
    const hecho = valor(await otro.app.ajustes.publicar(otro.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, formatoHora: "24h" } }));
    assert.equal(hecho.publicadoPor, "Consola del servidor");
  });
});

describe("las huérfanas, con las horas del local (D9)", () => {
  test("con 3 horas, una estancia de 4 horas pasa a revisar; con 8, sigue en sala", async () => {
    const entrada = NOCHE - 20 * HORA; // domingo a las 2:00 am en Caracas: el mismo día que NOCHE - 16 h
    await familiaDePrueba(l, l.sistema, entrada);
    const a4h = entrada + 4 * HORA;
    const conOcho = valor(await l.app.parque.sala(l.sistema, a4h));
    assert.equal(conOcho.huerfanas.length, 0);
    assert.equal(conOcho.sessions.length, 1);

    valor(await publicar(admin, { horasHuerfana: 3 }));
    const conTres = valor(await l.app.parque.sala(l.sistema, a4h));
    assert.equal(conTres.sessions.length, 0);
    assert.equal(conTres.huerfanas.length, 1);
  });
});
