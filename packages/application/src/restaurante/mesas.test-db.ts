/**
 * Vincular pulseras a una mesa, contra l2control_test — F6-05, D2, B6-3.
 *
 * Lo que fijan: el paquete pendiente de una estancia pasa a la cuenta de la mesa (y la de la familia
 * se queda con el rastro de adónde fue); puede juntar niños de más de una familia en una llamada; un
 * niño ya vinculado no se ofrece para otra mesa ni se vincula dos veces; el reintento no mueve nada
 * otra vez; permiso, auditoría y aislamiento por tenant. Corre con `pnpm test:db`.
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
