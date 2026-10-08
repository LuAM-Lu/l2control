/**
 * La cuenta de soporte contra l2control_test — T-17 (M-28, M-29).
 *
 * Una persona de Administración marcada como soporte no sale en «¿Quién entra?»: entra por «Acceso de soporte» con su
 * usuario y su PIN, desde un equipo aprobado y con el mismo bloqueo. Firma como «(soporte)», no cuenta como personal del
 * local, y en producción no abre turnos ni cobra; en staging sí. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { conectar, type Aplicacion, type Contexto } from "../index.ts";
import { CLAVE_DE_PRUEBA, URL_DE_PRUEBA, abrirLocalDePrueba, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { contextoDeSesion } from "./sesiones.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const fondos = { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
const MOTIVO = "Soporte técnico del sistema para el local";

let local: LocalDePrueba;
let staging: Aplicacion;
let ctxAbi: Contexto;
let equipo: string;
/** El equipo desde el que entra soporte: otro que el de Abigail, para no cerrarle la sesión (un equipo, una sesión). */
let equipoSoporte: string;
let abi: string;
let ines: string;
let sop: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const entrarSoporte = (usuario: string, pin: string, app: Aplicacion = local.app, dispositivo: string = equipoSoporte) =>
  app.sesiones.entrarSoporte({ dispositivo, usuario, pin, ip: null, ahora: Date.now() });

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Soporte");
  // La misma base, como la ve staging: ahí la cuenta de soporte sí opera (M-29).
  staging = await conectar(URL_APP, { claveCifrado: CLAVE_DE_PRUEBA, urlPublica: URL_DE_PRUEBA, soporteOpera: true });
  abi = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  ines = await crearPersona(local, { nombre: "Inés Prado", role: "ADMIN", pin: "6159" });
  sop = await crearPersona(local, { nombre: "Luis Soporte", role: "ADMIN", pin: "7384" });
  await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  equipo = await crearEquipo(local, "Oficina");
  equipoSoporte = await crearEquipo(local, "Equipo de soporte");
  ctxAbi = await contextoElevado(local, equipo, { id: abi, nombre: "Abigail Karam", pin: "4826" });
});

after(async () => {
  await staging.cerrar();
  await local.cerrar();
});

describe("marcar la cuenta de soporte (T-17)", () => {
  test("la administración la marca con su usuario: queda en su historia y deja de salir en «¿Quién entra?»", async () => {
    const r = valor(await local.app.equipo.cambiar(ctxAbi, { kind: "SOPORTE", userId: sop, usuario: "  Soporte.L2 ", reason: MOTIVO }));
    assert.equal(r.usuario.soporte, "soporte.l2", "en minúsculas y sin espacios");
    assert.equal(r.usuario.changes[0]?.kind, "SOPORTE");
    const lista = await local.app.sesiones.personas(equipo);
    assert.deepEqual(
      lista.map((p) => p.nombre),
      ["Abigail Karam", "Inés Prado", "Marisol Prieto"],
    );
  });

  test("nadie se marca a sí misma, el usuario es único y no se le cambia el rol con la marca puesta", async () => {
    const propio = await local.app.equipo.cambiar(ctxAbi, { kind: "SOPORTE", userId: abi, usuario: "abi.soporte", reason: MOTIVO });
    assert.equal(!propio.ok && propio.mensaje, "No puedes marcarte a ti misma como soporte: pide que lo haga otra persona.");
    const repetido = await local.app.equipo.cambiar(ctxAbi, { kind: "SOPORTE", userId: ines, usuario: "soporte.l2", reason: MOTIVO });
    assert.equal(!repetido.ok && repetido.mensaje, "El usuario «soporte.l2» ya es de otra persona.");
    const rol = await local.app.equipo.cambiar(ctxAbi, { kind: "ROL", userId: sop, role: "SUPERVISOR", reason: MOTIVO });
    assert.equal(!rol.ok && rol.mensaje, "Es la cuenta de soporte: quítale la marca antes de cambiarle el rol.");
  });
});

describe("«Acceso de soporte»", () => {
  test("entra con su usuario y su PIN; un usuario que no existe responde como un PIN errado", async () => {
    const r = await entrarSoporte("SOPORTE.L2", "7384");
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.sesion.nombre, "Luis Soporte");
    const nadie = await entrarSoporte("nadie.aqui", "7384");
    assert.equal(!nadie.ok && nadie.mensaje, "Usuario o PIN incorrectos.");
    const malo = await entrarSoporte("soporte.l2", "0000");
    assert.equal(!malo.ok && malo.mensaje.startsWith("Usuario o PIN incorrectos") || (!malo.ok && /intento|bloque/i.test(malo.mensaje)), true, JSON.stringify(malo));
  });

  test("solo desde un equipo aprobado", async () => {
    const pendiente = await crearEquipo(local, "Equipo sin aprobar", false);
    const r = await entrarSoporte("soporte.l2", "7384", local.app, pendiente);
    assert.equal(!r.ok && r.mensaje, "Este equipo no está autorizado para entrar.");
  });
});

describe("lo que hace y lo que no (M-29)", () => {
  test("firma como soporte; en producción no abre turno, en staging sí", async () => {
    const r = await entrarSoporte("soporte.l2", "7384");
    assert.ok(r.ok);
    const ctx = contextoDeSesion(r.sesion, null);
    const enProduccion = await local.app.turnos.abrir(ctx, fondos);
    assert.equal(!enProduccion.ok && enProduccion.mensaje, "La cuenta de soporte no abre turnos aquí: el turno es del personal del local.");
    const enStaging = valor(await staging.turnos.abrir(ctx, fondos));
    assert.equal(enStaging.abiertoPor.name, "Luis Soporte (soporte)");
  });

  test("no cuenta como personal del local: Inicio la ve como soporte y la puesta a punto no la cuenta", async () => {
    const sesiones = valor(await local.app.sesiones.enCurso(ctxAbi, Date.now()));
    assert.ok(sesiones.some((s) => s.userName === "Luis Soporte" && s.soporte));
    assert.ok(sesiones.some((s) => s.userName === "Abigail Karam" && !s.soporte));
    const directorio = valor(await local.app.equipo.directorio(ctxAbi));
    assert.deepEqual(
      directorio.users.filter((u) => u.soporte !== null).map((u) => u.fullName),
      ["Luis Soporte"],
    );
  });

  test("quitarle la marca la devuelve a la lista", async () => {
    valor(await local.app.equipo.cambiar(ctxAbi, { kind: "SOPORTE_FIN", userId: sop, reason: MOTIVO }));
    const lista = await local.app.sesiones.personas(equipo);
    assert.ok(lista.some((p) => p.nombre === "Luis Soporte"));
    const r = await entrarSoporte("soporte.l2", "7384");
    assert.equal(!r.ok && r.mensaje, "Usuario o PIN incorrectos.");
  });
});
