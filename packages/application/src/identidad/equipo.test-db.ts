/**
 * Personas, excepciones, accesos y autorización (B1-5: F2-05, F2-08, F2-10, F2-11, F2-13)
 * contra l2control_test.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import type { Contexto } from "../contexto.ts";
import { exigirPermisoOAutorizacion } from "./autorizacion.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
let local: LocalDePrueba;
let equipo: string;
let admin: string, supervisor: string, cajera: string, mesero: string;
let ctxAdmin: Contexto;

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Equipo");
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  supervisor = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  mesero = await crearPersona(local, { nombre: "Jesús Mendoza", role: "MESERO", pin: "6048" });
  equipo = await crearEquipo(local, "Tablet oficina");
  ctxAdmin = await contextoElevado(local, equipo, { id: admin, nombre: "Abigail Karam", pin: "4826" });
});

after(() => local.cerrar());

const razon = "Motivo de prueba suficientemente largo";

describe("el directorio", () => {
  test("exige gestionar personas con la sesión elevada", async () => {
    const sinElevar = await local.app.equipo.directorio(await contextoDe(local, equipo, admin, "4826"));
    assert.equal(sinElevar.ok ? "ok" : sinElevar.motivo, "ELEVACION_REQUERIDA");
    const r = await local.app.equipo.directorio(ctxAdmin);
    assert.ok(r.ok);
    assert.deepEqual(r.valor.users.map((u) => u.fullName).sort(), ["Abigail Karam", "Jesús Mendoza", "Luis Guerrero", "Marisol Prieto"]);
  });
});

describe("alta con PIN temporal", () => {
  let nueva: string;
  let temporal: string;

  test("da un PIN temporal de 4 cifras, una sola vez", async () => {
    const r = await local.app.equipo.cambiar(ctxAdmin, { kind: "ALTA", fullName: "Ana Rojas", role: "MONITOR_PARQUE", branchIds: [local.sistema.branchId], reason: razon });
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(r.valor.pinTemporal ?? "", /^\d{4}$/);
    assert.equal(r.valor.usuario.changes[0]?.kind, "ALTA");
    nueva = r.valor.usuario.id;
    temporal = r.valor.pinTemporal!;
  });

  test("con el temporal no hay sesión hasta elegir uno propio, y uno trivial no vale", async () => {
    const entrar = (pinNuevo?: string) =>
      local.app.sesiones.entrar({ dispositivo: equipo, userId: nueva, pin: temporal, pinNuevo, ip: null, ahora: Date.now() });
    const r1 = await entrar();
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.equal(r1.debeElegirPin, true);
    const r2 = await entrar("1234");
    assert.equal(r2.ok, false);
    // El temporal es aleatorio: el propio tiene que ser otro (una vez de cada miles coincidían y el CI caía).
    const r3 = await entrar(temporal === "8163" ? "5927" : "8163");
    assert.ok(r3.ok, JSON.stringify(r3));
    // El temporal ya no abre nada.
    const r4 = await local.app.sesiones.entrar({ dispositivo: equipo, userId: nueva, pin: temporal, ip: null, ahora: Date.now() });
    assert.equal(r4.ok, false);
  });

  test("no se da acceso a una sucursal que quien da el alta no gestiona", async () => {
    const r = await local.app.equipo.cambiar(ctxAdmin, { kind: "ALTA", fullName: "Otra Sede", role: "CAJERO", branchIds: [local.otraSucursal], reason: razon });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });
});

describe("las cinco puertas, en el servidor", () => {
  test("una cajera no gestiona personas, y el intento queda registrado", async () => {
    const r = await local.app.equipo.cambiar(await contextoDe(local, equipo, cajera, "7391"), { kind: "BAJA", userId: mesero, reason: razon });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
    const [asiento] = await local.app.auditoria.listar(local.sistema, { actorId: cajera });
    assert.equal(asiento?.action, "usuario.baja");
    assert.equal(asiento?.outcome, "NEGADO");
  });

  test("nadie se da de baja ni se cambia el rol a sí mismo", async () => {
    const baja = await local.app.equipo.cambiar(ctxAdmin, { kind: "BAJA", userId: admin, reason: razon });
    const rol = await local.app.equipo.cambiar(ctxAdmin, { kind: "ROL", userId: admin, role: "SUPERVISOR", reason: razon });
    assert.equal(baja.ok, false);
    assert.equal(rol.ok, false);
  });

  test("un cambio de rol guarda de dónde venía", async () => {
    const r = await local.app.equipo.cambiar(ctxAdmin, { kind: "ROL", userId: mesero, role: "CAJERO", reason: razon });
    assert.ok(r.ok, JSON.stringify(r));
    const cambio = r.valor.usuario.changes[0];
    assert.equal(cambio?.kind, "ROL");
    if (cambio?.kind === "ROL") assert.deepEqual([cambio.from, cambio.to], ["MESERO", "CAJERO"]);
  });

  test("la baja cierra en el acto la sesión abierta de esa persona (F2-10)", async () => {
    const otroEquipo = await crearEquipo(local, "Tablet caja");
    const r = await local.app.sesiones.entrar({ dispositivo: otroEquipo, userId: mesero, pin: "6048", ip: null, ahora: Date.now() });
    assert.ok(r.ok);
    const baja = await local.app.equipo.cambiar(ctxAdmin, { kind: "BAJA", userId: mesero, reason: razon });
    assert.ok(baja.ok, JSON.stringify(baja));
    assert.equal(await local.app.sesiones.consultar(r.credencial, Date.now()), null);
    assert.deepEqual((await local.app.sesiones.personas(otroEquipo)).map((p) => p.nombre).includes("Jesús Mendoza"), false);
    // Reingreso: vuelve, y su historia tiene las dos cosas.
    const vuelve = await local.app.equipo.cambiar(ctxAdmin, { kind: "REINGRESO", userId: mesero, reason: razon });
    assert.ok(vuelve.ok);
    assert.deepEqual(vuelve.valor.usuario.changes.slice(0, 2).map((c) => c.kind), ["REINGRESO", "BAJA"]);
  });

  test("reponer el PIN deja inservible el anterior", async () => {
    let r = await local.app.equipo.cambiar(ctxAdmin, { kind: "PIN", userId: cajera, reason: razon });
    // La cajera vuelve a su 7391: si el temporal (aleatorio) salió justo ese, se repone otra vez.
    while (r.ok && r.valor.pinTemporal === "7391") r = await local.app.equipo.cambiar(ctxAdmin, { kind: "PIN", userId: cajera, reason: razon });
    assert.ok(r.ok);
    const viejo = await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: "7391", ip: null, ahora: Date.now() });
    assert.equal(viejo.ok, false);
    const nuevo = await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: r.valor.pinTemporal!, pinNuevo: "7391", ip: null, ahora: Date.now() });
    assert.ok(nuevo.ok, JSON.stringify(nuevo));
  });
});

describe("excepciones sobre el rol (DEC-15)", () => {
  test("conceder a la cajera confirmar la tasa se refleja en su actor", async () => {
    const r = await local.app.equipo.excepcion(ctxAdmin, { effect: "GRANT", userId: cajera, action: "tasa.confirmar", permission: "PERMITIDO", reason: "Abre los sábados antes que la supervisión" });
    assert.ok(r.ok, JSON.stringify(r));
    const sesion = await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: "7391", ip: null, ahora: Date.now() });
    assert.ok(sesion.ok);
    assert.equal(sesion.sesion.actor.grants?.["tasa.confirmar"], "PERMITIDO");
  });

  test("las llaves de la casa no se regalan por excepción, ni una se concede a sí misma", async () => {
    const llave = await local.app.equipo.excepcion(ctxAdmin, { effect: "GRANT", userId: supervisor, action: "usuarios.gestionar", permission: "PERMITIDO", reason: razon });
    assert.equal(llave.ok ? "ok" : llave.motivo, "NO_PERMITIDO");
    const propia = await local.app.equipo.excepcion(ctxAdmin, { effect: "REVOKE", userId: admin, action: "camaras.ver", reason: razon });
    assert.equal(propia.ok ? "ok" : propia.motivo, "NO_PERMITIDO");
  });

  test("una acción que no existe se rechaza", async () => {
    const r = await local.app.equipo.excepcion(ctxAdmin, { effect: "REVOKE", userId: cajera, action: "caja.robar", reason: razon });
    assert.equal(r.ok ? "ok" : r.motivo, "INVALIDO");
  });
});

describe("ajustes de la sucursal sobre la matriz (F2-13)", () => {
  test("ajustar y retirar una celda cambia lo que alcanza el rol", async () => {
    const a = await local.app.accesos.ordenar(ctxAdmin, { kind: "AJUSTAR", branchId: local.sistema.branchId, role: "CAJERO", action: "reportes.verSucursal", permission: "PERMITIDO", reason: razon });
    assert.ok(a.ok, JSON.stringify(a));
    const conAjuste = await local.app.sesiones.entrar({ dispositivo: equipo, userId: cajera, pin: "7391", ip: null, ahora: Date.now() });
    assert.ok(conAjuste.ok);
    assert.equal(conAjuste.sesion.actor.roleAdjustments?.["reportes.verSucursal"], "PERMITIDO");

    const r = await local.app.accesos.ordenar(ctxAdmin, { kind: "RETIRAR", branchId: local.sistema.branchId, role: "CAJERO", action: "reportes.verSucursal", reason: razon });
    assert.ok(r.ok);
    assert.equal(r.valor.adjustments.length, 0);
  });

  test("la fila de administración y las llaves de la casa son suelo intocable", async () => {
    for (const [role, action] of [["ADMIN", "cobro.anular"], ["SUPERVISOR", "usuarios.gestionar"]] as const) {
      const r = await local.app.accesos.ordenar(ctxAdmin, { kind: "AJUSTAR", branchId: local.sistema.branchId, role, action, permission: "DENEGADO", reason: razon });
      assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO", `${role} ${action}`);
    }
  });

  test("no se ajusta otra sucursal", async () => {
    const r = await local.app.accesos.ordenar(ctxAdmin, { kind: "AJUSTAR", branchId: local.otraSucursal, role: "CAJERO", action: "reportes.verSucursal", permission: "PERMITIDO", reason: razon });
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });
});

describe("la autorización de un 🔐 (F2-08)", () => {
  const cortesia = async (aut: unknown) => {
    const ctx = await contextoDe(local, equipo, cajera, "7391");
    return local.base.conTenant(ctx.tenantId, (tx) => exigirPermisoOAutorizacion(tx, ctx, "cuenta.cortesia", aut));
  };

  test("sin autorización, lo que la requiere se niega", async () => {
    const r = await cortesia(undefined);
    assert.equal(r.ok ? "ok" : r.motivo, "NO_PERMITIDO");
  });

  test("con el PIN del supervisor, se concede y queda registrado a su nombre", async () => {
    const r = await cortesia({ autorizadorId: supervisor, pin: "5937", motivo: "Cumpleaños del niño" });
    assert.ok(r.ok, JSON.stringify(r));
    if (r.ok) assert.equal(r.autorizadoPor, supervisor);
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: cajera });
    const concedida = asientos.find((a) => a.action === "autorizacion.conceder");
    assert.equal(concedida?.authorizedBy, supervisor);
    assert.equal(concedida?.reason, "Cumpleaños del niño");
  });

  test("un PIN equivocado, o alguien que no puede autorizar, se niegan y quedan registrados", async () => {
    const malo = await cortesia({ autorizadorId: supervisor, pin: "0000", motivo: "Cumpleaños" });
    const mesera = await cortesia({ autorizadorId: mesero, pin: "6048", motivo: "Cumpleaños" });
    assert.equal(malo.ok, false);
    assert.equal(mesera.ok, false);
    const negadas = (await local.app.auditoria.listar(local.sistema, { actorId: cajera })).filter((a) => a.action === "autorizacion.negar");
    assert.ok(negadas.length >= 2);
  });

  test("lo que ya está permitido no pide autorización; lo denegado, nadie lo abre", async () => {
    const ctx = await contextoDe(local, equipo, cajera, "7391");
    const cobrar = await local.base.conTenant(ctx.tenantId, (tx) => exigirPermisoOAutorizacion(tx, ctx, "documento.emitir", undefined));
    assert.ok(cobrar.ok);
    const anularEnCocina = await local.base.conTenant(ctx.tenantId, (tx) =>
      exigirPermisoOAutorizacion(tx, ctx, "kds.cambiarEstado", { autorizadorId: supervisor, pin: "5937", motivo: "Prueba" }),
    );
    assert.equal(anularEnCocina.ok ? "ok" : anularEnCocina.motivo, "NO_PERMITIDO");
  });
});
