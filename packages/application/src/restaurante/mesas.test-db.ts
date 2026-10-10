/**
 * Vincular pulseras a una mesa, contra l2control_test — F6-05, D2, B6-3.
 *
 * Lo que fijan: el paquete pendiente de una estancia pasa a la cuenta de la mesa (y la de la familia
 * se queda con el rastro de adónde fue); puede juntar niños de más de una familia en una llamada; un
 * niño ya vinculado no se ofrece para otra mesa ni se vincula dos veces; el reintento no mueve nada
 * otra vez; permiso, auditoría y aislamiento por tenant. Corre con `pnpm test:db`.
 *
 * Y desvincular (B6-15): lo que se debe del niño vuelve a su familia o pasa a otra mesa, y su salida va ahí; una familia
 * ya cerrada no lo recibe; el reintento no mueve nada otra vez; permiso, auditoría y aislamiento.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, planoDePrueba, sentarDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Viernes 2 de octubre de 2026, 1:00 pm en Caracas. */
const AHORA = Date.parse("2026-10-02T17:00:00.000Z");
const MIN = 60_000;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let otro: LocalDePrueba;
let mesero: Contexto;
let monitora: Contexto;
let cocinero: Contexto;
let otroMesero: Contexto;

const vincular = (ctx: Contexto, tableId: string, sessionIds: string[], ahora = AHORA, idempotencyKey = randomUUID()) =>
  l.app.mesas.vincular(ctx, { idempotencyKey, tableId, sessionIds }, ahora);
const desvincular = (
  ctx: Contexto,
  desdeCuentaId: string,
  sessionId: string,
  destino: { kind: "FAMILIA" } | { kind: "MESA"; cuentaId: string },
  ahora = AHORA,
  idempotencyKey = randomUUID(),
) => l.app.mesas.desvincular(ctx, { idempotencyKey, desdeCuentaId, sessionId, destino }, ahora);
const salir = (sessionId: string, ahora: number) =>
  l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [sessionId], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, ahora);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba vincular pulseras");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba vincular pulseras B");
  const pedro = await crearPersona(l, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const chef = await crearPersona(l, { nombre: "Chef Soto", role: "COCINA", pin: "9081" });
  mesero = await contextoDe(l, await crearEquipo(l, "Salón"), pedro, "3175");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  cocinero = await contextoDe(l, await crearEquipo(l, "Cocina"), chef, "9081");
  const jesus = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "MESERO", pin: "3175" });
  otroMesero = await contextoDe(otro, await crearEquipo(otro, "Salón"), jesus, "3175");

  await planoDePrueba(l, 12);
  await planoDePrueba(otro);
  // Una mesa sin cuenta no la abre una pulsera (B6-9): las familias se sientan primero, como en el local.
  for (let i = 1; i <= 12; i++) await sentarDePrueba(l, mesero, `mesa-${i}`, AHORA - 10 * MIN);
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("vincular pulseras a una mesa", () => {
  test("mueve el paquete pendiente de la estancia a la cuenta de la mesa", async () => {
    const familia = await familiaDePrueba(l, monitora, AHORA, "CUENTA_ABIERTA");
    const sessionId = familia.sessionIds[0]!;
    const { mesa, familias } = valor(await vincular(mesero, "mesa-1", [sessionId]));

    assert.equal(mesa.kind, "MESA");
    assert.equal(mesa.tableId, "mesa-1");
    assert.deepEqual(mesa.sessionIds, [sessionId]);
    assert.equal(mesa.lines.length, 1);
    assert.equal(mesa.lines[0]!.amount.minor, "1000");
    assert.equal(mesa.lines[0]!.sessionId, sessionId);
    assert.equal(mesa.lines[0]!.movedTo, undefined);

    assert.equal(familias.length, 1);
    const fQueda = familias[0]!;
    assert.equal(fQueda.id, familia.id);
    assert.equal(fQueda.lines[0]!.movedTo, mesa.id);
    assert.equal(fQueda.status, "ABIERTA", "sigue abierta: el niño sigue jugando");

    const version = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.accountVersion.findFirst({ where: { accountId: mesa.id }, orderBy: { version: "desc" } }));
    assert.equal(version!.cause, "VINCULAR");
  });

  test("junta niños de más de una familia en la misma mesa, cada uno con lo suyo", async () => {
    const a = await familiaDePrueba(l, monitora, AHORA + MIN, "CUENTA_ABIERTA");
    const b = await familiaDePrueba(l, monitora, AHORA + MIN, "CUENTA_ABIERTA");
    const { mesa, familias } = valor(await vincular(mesero, "mesa-2", [a.sessionIds[0]!, b.sessionIds[0]!], AHORA + MIN));
    assert.equal(mesa.lines.length, 2);
    assert.equal(new Set(mesa.lines.map((x) => x.sessionId)).size, 2);
    assert.equal(familias.length, 2);
  });

  test("lo que ya se pidió en la mesa sigue en su cuenta: una sola, con todo junto (F6-05)", async () => {
    const c = await familiaDePrueba(l, monitora, AHORA + 2 * MIN, "CUENTA_ABIERTA");
    const primera = valor(await vincular(mesero, "mesa-3", [c.sessionIds[0]!], AHORA + 2 * MIN));
    const d = await familiaDePrueba(l, monitora, AHORA + 2 * MIN, "CUENTA_ABIERTA");
    const { mesa } = valor(await vincular(mesero, "mesa-3", [d.sessionIds[0]!], AHORA + 2 * MIN));
    assert.equal(mesa.id, primera.mesa.id);
    assert.equal(mesa.lines.length, 2, "las dos familias en la misma cuenta de la mesa");
  });

  test("una estancia no se vincula dos veces: ni a esta mesa, ni a otra", async () => {
    const e = await familiaDePrueba(l, monitora, AHORA + 3 * MIN, "CUENTA_ABIERTA");
    const sessionId = e.sessionIds[0]!;
    const { mesa } = valor(await vincular(mesero, "mesa-4", [sessionId], AHORA + 3 * MIN));
    const otraVez = await vincular(mesero, "mesa-4", [sessionId], AHORA + 3 * MIN);
    assert.equal(!otraVez.ok && otraVez.motivo, "CONFLICTO");
    assert.match(!otraVez.ok ? otraVez.mensaje : "", /ya está vinculada a esta mesa/);
    const otraMesa = await vincular(mesero, "mesa-5", [sessionId], AHORA + 3 * MIN);
    assert.equal(!otraMesa.ok && otraMesa.motivo, "CONFLICTO");
    assert.match(!otraMesa.ok ? otraMesa.mensaje : "", new RegExp(`ya está vinculada a la mesa ${mesa.tableLabel}`));
  });

  test("una estancia que ya salió no se vincula", async () => {
    const f = await familiaDePrueba(l, monitora, AHORA + 4 * MIN, "CUENTA_ABIERTA");
    const sessionId = f.sessionIds[0]!;
    const salida = await l.app.parque.salir(
      monitora,
      { idempotencyKey: randomUUID(), sessionIds: [sessionId], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } },
      AHORA + 5 * MIN,
    );
    assert.ok(salida.ok, JSON.stringify(salida));
    const r = await vincular(mesero, "mesa-6", [sessionId], AHORA + 5 * MIN);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
    assert.match(!r.ok ? r.mensaje : "", /ya salió del parque/);
  });

  test("reenviar la misma vinculación (se cortó la red) no mueve nada otra vez", async () => {
    const g = await familiaDePrueba(l, monitora, AHORA + 6 * MIN, "CUENTA_ABIERTA");
    const sessionId = g.sessionIds[0]!;
    const clave = randomUUID();
    const primera = valor(await vincular(mesero, "mesa-7", [sessionId], AHORA + 6 * MIN, clave));
    const otraVez = valor(await vincular(mesero, "mesa-7", [sessionId], AHORA + 6 * MIN, clave));
    assert.deepEqual(otraVez, primera);
    assert.equal(primera.mesa.lines.length, 1);
  });

  test("una mesa fuera del plano no recibe vinculaciones", async () => {
    const h = await familiaDePrueba(l, monitora, AHORA + 7 * MIN, "CUENTA_ABIERTA");
    const r = await vincular(mesero, "mesa-99", [h.sessionIds[0]!], AHORA + 7 * MIN);
    assert.equal(!r.ok && r.problemas?.[0]?.message, "MESA_FUERA_DEL_PLANO", JSON.stringify(r));
  });

  test("la cocina no vincula pulseras, y el intento queda en la auditoría", async () => {
    const i = await familiaDePrueba(l, monitora, AHORA + 8 * MIN, "CUENTA_ABIERTA");
    const r = await vincular(cocinero, "mesa-8", [i.sessionIds[0]!], AHORA + 8 * MIN);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = await l.app.auditoria.listar(l.sistema, { actorId: cocinero.quien!.userId! });
    assert.ok(negados.some((a) => a.action === "mesa.vincular" && a.outcome === "NEGADO"));
  });

  test("el asiento queda y el cambio sale en vivo: cuentas y sala", async () => {
    const j = await familiaDePrueba(l, monitora, AHORA + 9 * MIN, "CUENTA_ABIERTA");
    const { mesa } = valor(await vincular(mesero, "mesa-9", [j.sessionIds[0]!], AHORA + 9 * MIN));
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "account", entityId: mesa.id });
    assert.ok(asientos.some((a) => a.action === "mesa.vincular"));
    assert.deepEqual([...temasDe("mesa.vincular")].sort(), ["cuentas", "sala"]);
  });

  test("otro local no vincula estancias que no son suyas", async () => {
    const k = await familiaDePrueba(l, monitora, AHORA + 10 * MIN, "CUENTA_ABIERTA");
    const r = await otro.app.mesas.vincular(otroMesero, { idempotencyKey: randomUUID(), tableId: "mesa-1", sessionIds: [k.sessionIds[0]!] }, AHORA + 10 * MIN);
    assert.equal(!r.ok && r.motivo, "NO_DISPONIBLE");
  });
});

describe("desvincular una pulsera (B6-15, M-37)", () => {
  const T = AHORA + 20 * MIN;

  test("vuelve a su familia con lo que se debe; ya no está en la mesa y su salida va a su familia", async () => {
    const familia = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const sessionId = familia.sessionIds[0]!;
    const { mesa } = valor(await vincular(mesero, "mesa-10", [sessionId], T));
    const { desde, destino } = valor(await desvincular(mesero, mesa.id, sessionId, { kind: "FAMILIA" }, T + MIN));

    assert.equal(desde.id, mesa.id);
    assert.deepEqual(desde.sessionIds, []);
    assert.equal(desde.lines[0]!.movedTo, familia.id, "en la mesa queda el rastro de adónde fue");
    assert.equal(destino.id, familia.id);
    const vuelta = destino.lines.filter((x) => x.sessionId === sessionId && !x.movedTo);
    assert.deepEqual(vuelta.map((x) => [x.amount.minor, x.paid]), [["1000", false]]);
    assert.equal(destino.status, "ABIERTA", "el niño sigue jugando");
    const causas = await l.base.conTenant(l.sistema.tenantId, (tx) =>
      tx.accountVersion.findMany({ where: { accountId: { in: [mesa.id, familia.id] } }, orderBy: { version: "desc" }, distinct: ["accountId"], select: { cause: true } }),
    );
    assert.deepEqual(causas.map((c) => c.cause), ["DESVINCULAR", "DESVINCULAR"]);

    // Ya no está vinculado: sale por la caja de su familia, y se puede vincular otra vez.
    const s = await salir(sessionId, T + 2 * MIN);
    assert.ok(s.ok, JSON.stringify(s));
    assert.equal(s.valor.account.id, familia.id);
    assert.equal(s.valor.account.status, "POR_COBRAR");
  });

  test("pasa a otra mesa con lo que se debe, y su salida va a esa mesa", async () => {
    const a = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const b = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const { mesa: once } = valor(await vincular(mesero, "mesa-11", [b.sessionIds[0]!], T));
    const sessionId = a.sessionIds[0]!;
    const { mesa: diez } = valor(await vincular(mesero, "mesa-10", [sessionId], T));
    const { desde, destino } = valor(await desvincular(mesero, diez.id, sessionId, { kind: "MESA", cuentaId: once.id }, T + MIN));
    assert.ok(!desde.sessionIds.includes(sessionId));
    assert.equal(destino.id, once.id);
    assert.ok(destino.sessionIds.includes(sessionId), "ahora está vinculado a la otra mesa");
    assert.equal(destino.lines.filter((x) => x.sessionId === sessionId).length, 1);

    // Otra vez a la mesa de antes, no: ya no está ahí.
    const otraVez = await desvincular(mesero, diez.id, sessionId, { kind: "FAMILIA" }, T + MIN);
    assert.equal(!otraVez.ok && otraVez.problemas?.[0]?.message, "NO_VINCULADO", JSON.stringify(otraVez));

    // Su salida va sola a la otra mesa, aunque la pantalla diga la caja.
    const s = await l.app.parque.salir(
      monitora,
      { idempotencyKey: randomUUID(), sessionIds: [sessionId], disposition: { kind: "MESA", tableId: "mesa-10" }, recogida: { kind: "REPRESENTANTE" } },
      T + 2 * MIN,
    );
    assert.equal(!s.ok && s.motivo, "CONFLICTO", "va a la mesa a la que se pasó, no a la de antes");
    assert.ok((await salir(sessionId, T + 2 * MIN)).ok);
  });

  test("un niño que ya salió, con su tiempo en la mesa: su familia ya cerró, pero otra mesa sí lo recibe", async () => {
    const f = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const sessionId = f.sessionIds[0]!;
    const { mesa } = valor(await vincular(mesero, "mesa-12", [sessionId], T));
    assert.ok((await salir(sessionId, T + 30 * MIN)).ok);
    const aSuFamilia = await desvincular(mesero, mesa.id, sessionId, { kind: "FAMILIA" }, T + 31 * MIN);
    assert.equal(!aSuFamilia.ok && aSuFamilia.problemas?.[0]?.message, "FAMILIA_CERRADA", JSON.stringify(aSuFamilia));
    const { mesa: once } = valor(await vincular(mesero, "mesa-11", [(await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA")).sessionIds[0]!], T));
    const { destino } = valor(await desvincular(mesero, mesa.id, sessionId, { kind: "MESA", cuentaId: once.id }, T + 31 * MIN));
    assert.equal(destino.lines.filter((x) => x.sessionId === sessionId).length, 1);
    assert.equal(!(await desvincular(mesero, mesa.id, sessionId, { kind: "MESA", cuentaId: mesa.id }, T + 31 * MIN)).ok, true);
  });

  test("reenviar el mismo desvincular (se cortó la red) no mueve nada otra vez", async () => {
    const f = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const sessionId = f.sessionIds[0]!;
    const { mesa } = valor(await vincular(mesero, "mesa-10", [sessionId], T));
    const clave = randomUUID();
    const primera = valor(await desvincular(mesero, mesa.id, sessionId, { kind: "FAMILIA" }, T + MIN, clave));
    const otraVez = valor(await desvincular(mesero, mesa.id, sessionId, { kind: "FAMILIA" }, T + MIN, clave));
    assert.deepEqual(otraVez, primera);
  });

  test("la cocina no desvincula, queda en la auditoría; el asiento queda y sale en vivo; otro local, nada", async () => {
    const f = await familiaDePrueba(l, monitora, T, "CUENTA_ABIERTA");
    const sessionId = f.sessionIds[0]!;
    const { mesa } = valor(await vincular(mesero, "mesa-10", [sessionId], T));
    const r = await desvincular(cocinero, mesa.id, sessionId, { kind: "FAMILIA" }, T + MIN);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = await l.app.auditoria.listar(l.sistema, { actorId: cocinero.quien!.userId! });
    assert.ok(negados.some((a) => a.action === "mesa.desvincular" && a.outcome === "NEGADO"));

    const deOtro = await otro.app.mesas.desvincular(otroMesero, { idempotencyKey: randomUUID(), desdeCuentaId: mesa.id, sessionId, destino: { kind: "FAMILIA" } }, T + MIN);
    assert.equal(!deOtro.ok && deOtro.motivo, "NO_DISPONIBLE");

    valor(await desvincular(monitora, mesa.id, sessionId, { kind: "FAMILIA" }, T + MIN));
    const asientos = await l.app.auditoria.listar(l.sistema, { entityType: "account", entityId: mesa.id });
    assert.ok(asientos.some((a) => a.action === "mesa.desvincular"));
    assert.deepEqual([...temasDe("mesa.desvincular")].sort(), ["cuentas", "sala"]);
  });
});

describe("por limpiar, en la base (B6-14)", () => {
  test("una mesa cerrada queda por limpiar hasta que alguien la deja limpia; sentarse y volver a cerrar, otra vez", async () => {
    const t = AHORA + 60 * MIN;
    const sentada = await sentarDePrueba(otro, otroMesero, "mesa-1", t);
    assert.deepEqual(valor(await otro.app.mesas.porLimpiar(otroMesero, t)).mesas, [], "con su cuenta abierta, no");
    const liberar = async (c: { id: string; version?: number | undefined }, en: number) =>
      valor(await otro.app.cuentas.liberarMesa(otroMesero, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version! }, en));
    await liberar(sentada, t + MIN);
    const por = valor(await otro.app.mesas.porLimpiar(otroMesero, t + 2 * MIN)).mesas;
    assert.deepEqual(por.map((m) => m.tableId), ["mesa-1"]);
    const limpia = valor(await otro.app.mesas.marcarLimpia(otroMesero, { tableId: "mesa-1" }, t + 3 * MIN));
    assert.deepEqual(limpia.mesas, []);
    // Marcarla otra vez no hace nada.
    valor(await otro.app.mesas.marcarLimpia(otroMesero, { tableId: "mesa-1" }, t + 3 * MIN));
    const asientos = await otro.app.auditoria.listar(otro.sistema, { entityType: "dining_table", entityId: "mesa-1" });
    assert.equal(asientos.filter((a) => a.action === "mesa.limpia").length, 1);
    assert.deepEqual([...temasDe("mesa.limpia")], ["mesas"]);

    const otraVez = await sentarDePrueba(otro, otroMesero, "mesa-1", t + 4 * MIN);
    await liberar(otraVez, t + 5 * MIN);
    assert.deepEqual(valor(await otro.app.mesas.porLimpiar(otroMesero, t + 6 * MIN)).mesas.map((m) => m.tableId), ["mesa-1"]);
  });

  test("quien no atiende el salón no las ve", async () => {
    const r = await l.app.mesas.porLimpiar(monitora, AHORA);
    assert.equal(r.ok, false);
  });
});
