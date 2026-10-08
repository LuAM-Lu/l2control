/**
 * El turno de caja en el servidor, contra l2control_test — B3-1, F4-01, I-06, ADR-009.
 *
 * Con reloj fijo: el día de negocio es el del local al abrir. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, contextoElevado, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 27 a las 11:30 pm en Caracas: ya es lunes 28 en UTC. */
const NOCHE = Date.parse("2026-09-28T03:30:00.000Z");

let local: LocalDePrueba;
let otro: LocalDePrueba;
let ctxCajera: Contexto;
let ctxCajeraOtroEquipo: Contexto;
let ctxMonitora: Contexto;

const fondo = (usd: string, bs: string) => ({
  fondos: [
    { currency: "USD", amount: { minor: usd, currency: "USD" } },
    { currency: "VES", amount: { minor: bs, currency: "VES" } },
  ],
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Turnos");
  otro = await abrirLocalDePrueba(URL_APP, "Turnos de otro");
  const cajera = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const monitora = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  ctxCajera = await contextoDe(local, await crearEquipo(local, "Caja mostrador"), cajera, "7391");
  ctxCajeraOtroEquipo = await contextoDe(local, await crearEquipo(local, "Caja taquilla"), cajera, "7391");
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Entrada"), monitora, "6284");
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("abrir el turno (F4-01)", () => {
  test("un equipo sin turno no tiene turno (y no se inventa uno)", async () => {
    assert.equal(await local.app.turnos.delEquipo(ctxCajera), null);
  });

  test("se abre con el fondo por moneda; equipo, persona, hora y día los pone el servidor", async () => {
    const r = await local.app.turnos.abrir(ctxCajera, fondo("2000", "150000"), undefined, NOCHE);
    assert.ok(r.ok, JSON.stringify(r));
    const t = r.valor;
    assert.equal(t.estado, "ABIERTO");
    assert.equal(t.punto, "Caja mostrador");
    assert.equal(t.abiertoPor.name, "Marisol Prieto");
    assert.equal(t.abiertoEn, new Date(NOCHE).toISOString());
    // ADR-009: el día de negocio es el del local (domingo 27), no el de UTC (lunes 28).
    assert.equal(t.businessDate, "2026-09-27");
    assert.deepEqual(
      t.fondos.map((f) => [f.currency, f.amount.minor]),
      [
        ["USD", "2000"],
        ["VES", "150000"],
      ],
    );
    assert.deepEqual(await local.app.turnos.delEquipo(ctxCajera), t);
  });

  test("un equipo no abre dos turnos (I-06)", async () => {
    const r = await local.app.turnos.abrir(ctxCajera, fondo("0", "0"), undefined, NOCHE + 60_000);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
  });

  test("dos aperturas a la vez en el mismo equipo dejan un solo turno", async () => {
    const [a, b] = await Promise.all([
      local.app.turnos.abrir(ctxCajeraOtroEquipo, fondo("0", "0"), undefined, NOCHE),
      local.app.turnos.abrir(ctxCajeraOtroEquipo, fondo("0", "0"), undefined, NOCHE),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal([a, b].filter((r) => !r.ok && r.motivo === "CONFLICTO").length, 1);
  });

  test("cero vale, negativo no, y hacen falta las dos monedas de la gaveta", async () => {
    const ctx = await contextoDe(local, await crearEquipo(local, "Caja 3"), ctxCajera.quien!.userId!, "7391");
    for (const malo of [fondo("-100", "0"), { fondos: fondo("0", "0").fondos.slice(0, 1) }]) {
      const r = await local.app.turnos.abrir(ctx, malo, undefined, NOCHE);
      assert.equal(!r.ok && r.motivo, "INVALIDO", JSON.stringify(malo));
    }
    assert.equal(await local.app.turnos.delEquipo(ctx), null);
  });

  test("el navegador no dice el equipo, la persona ni el día (ADR-017)", async () => {
    const ctx = await contextoDe(local, await crearEquipo(local, "Caja 4"), ctxCajera.quien!.userId!, "7391");
    for (const extra of [{ deviceId: ctxCajera.quien!.deviceId }, { abiertoPor: { id: "x", name: "Otra persona" } }, { businessDate: "2026-01-01" }]) {
      const r = await local.app.turnos.abrir(ctx, { ...fondo("0", "0"), ...extra }, undefined, NOCHE);
      assert.equal(!r.ok && r.motivo, "INVALIDO");
    }
  });

  test("la monitora no abre turno, el sistema sin equipo tampoco, y el intento se audita", async () => {
    const r = await local.app.turnos.abrir(ctxMonitora, fondo("0", "0"), undefined, NOCHE);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const sinEquipo = await local.app.turnos.abrir(local.sistema, fondo("0", "0"), undefined, NOCHE);
    assert.equal(!sinEquipo.ok && sinEquipo.motivo, "NO_PERMITIDO");
    const asientos = await local.app.auditoria.listar(local.sistema, { actorId: ctxMonitora.quien!.userId! });
    assert.ok(asientos.some((a) => a.action === "turno.abrir" && a.outcome === "NEGADO"));
  });

  test("la apertura queda en la auditoría con el fondo y el día", async () => {
    const t = (await local.app.turnos.delEquipo(ctxCajera))!;
    const [asiento] = (await local.app.auditoria.listar(local.sistema, { entityType: "cash_shift", entityId: t.id })).filter((a) => a.action === "turno.abrir");
    assert.deepEqual(asiento!.after, {
      punto: "Caja mostrador",
      businessDate: "2026-09-27",
      fondos: [
        { currency: "USD", amountMinor: "2000" },
        { currency: "VES", amountMinor: "150000" },
      ],
    });
  });

  test("Inicio ve los turnos abiertos de la sucursal; la monitora no", async () => {
    const abiertos = await local.app.turnos.abiertos(local.sistema);
    assert.deepEqual(abiertos.map((t) => t.punto).sort(), ["Caja mostrador", "Caja taquilla"]);
    assert.deepEqual(await local.app.turnos.abiertos(ctxMonitora), []);
  });

  test("otro local no ve el turno de este", async () => {
    assert.equal(await otro.app.turnos.delEquipo({ ...otro.sistema, quien: ctxCajera.quien! }), null);
  });
});

describe("el punto de cobro (B3-9, M-31)", () => {
  let admin: { id: string; nombre: string; pin: string };
  let supervisora: string;
  let ctxAdmin: Contexto;
  let equipoAdmin: string;
  let ctxFuera: Contexto;
  let fueraId: string;

  before(async () => {
    admin = { id: await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "5937" }), nombre: "Abigail Karam", pin: "5937" };
    supervisora = await crearPersona(local, { nombre: "Luisa Guerrero", role: "SUPERVISOR", pin: "4826" });
    equipoAdmin = await crearEquipo(local, "PC administración", true, false);
    ctxAdmin = await contextoElevado(local, equipoAdmin, admin);
    // La laptop de caja no enciende: la cajera abre en la tablet de la taquilla, que no es punto de cobro.
    ctxFuera = await contextoDe(local, await crearEquipo(local, "Tablet taquilla", true, false), ctxCajera.quien!.userId!, "7391");
    fueraId = ctxFuera.quien!.deviceId!;
  });

  const pin = (autorizadorId: string, p: string, motivo = "La laptop de caja no enciende") => ({ autorizadorId, pin: p, motivo });

  test("la apertura dice si este equipo es el punto de cobro y cuáles lo son", async () => {
    const aqui = await local.app.cortes.comprobarApertura(ctxFuera, NOCHE);
    assert.equal(aqui.puntoDeCobro.esEste, false);
    assert.ok(aqui.puntoDeCobro.puntos.includes("Caja mostrador"));
    assert.ok(!aqui.puntoDeCobro.puntos.includes("Tablet taquilla"));
    assert.equal((await local.app.cortes.comprobarApertura(ctxCajera, NOCHE)).puntoDeCobro.esEste, true);
  });

  test("fuera del punto, sin autorización no se abre; la de supervisión no vale y un PIN malo tampoco", async () => {
    const sin = await local.app.turnos.abrir(ctxFuera, fondo("0", "0"), undefined, NOCHE);
    assert.equal(!sin.ok && sin.mensaje, "Este equipo no es el punto de cobro: abrir el turno aquí pide el PIN de administración y un motivo.");
    const deSupervision = await local.app.turnos.abrir(ctxFuera, fondo("0", "0"), pin(supervisora, "4826"), NOCHE);
    assert.equal(!deSupervision.ok && deSupervision.mensaje, "Esa persona no puede autorizar esto.");
    // Un PIN que no es el suyo (el de la supervisora: nunca coincide con el fijo de la administración).
    const malo = await local.app.turnos.abrir(ctxFuera, fondo("0", "0"), pin(admin.id, "4826"), NOCHE);
    assert.equal(!malo.ok && malo.mensaje, "PIN de autorización incorrecto.");
    assert.equal(await local.app.turnos.delEquipo(ctxFuera), null);
  });

  test("con el PIN de administración y un motivo se abre: el turno lo dice y la auditoría dice quién autorizó", async () => {
    const t = valorDe(await local.app.turnos.abrir(ctxFuera, fondo("0", "0"), pin(admin.id, admin.pin), NOCHE));
    assert.deepEqual(t.fueraDelPunto, { autorizadoPor: "Abigail Karam", motivo: "La laptop de caja no enciende" });
    assert.equal(t.abiertoPor.name, "Marisol Prieto");
    assert.equal(t.punto, "Tablet taquilla");
    const [asiento] = (await local.app.auditoria.listar(local.sistema, { entityType: "cash_shift", entityId: t.id })).filter((a) => a.action === "turno.abrir");
    assert.equal(asiento!.authorizedBy, admin.id);
    assert.equal(asiento!.reason, "La laptop de caja no enciende");
    assert.deepEqual((asiento!.after as { fueraDelPunto?: unknown }).fueraDelPunto, { autorizadoPor: "Abigail Karam", motivo: "La laptop de caja no enciende" });
    // Inicio lo ve entre los abiertos, con su marca; el turno del punto de cobro, sin ella.
    const abiertos = await local.app.turnos.abiertos(local.sistema);
    assert.deepEqual(abiertos.find((x) => x.id === t.id)!.fueraDelPunto, t.fueraDelPunto);
    assert.equal(abiertos.find((x) => x.punto === "Caja mostrador")!.fueraDelPunto, null);
  });

  test("lo autorizado no se reescribe después de abrir (solo avanza)", async () => {
    const t = (await local.app.turnos.delEquipo(ctxFuera))!;
    await assert.rejects(
      local.base.conTenant(local.sistema.tenantId, (tx) => tx.cashShift.update({ where: { id: t.id }, data: { outsidePointReason: "Otro motivo" } })),
    );
  });

  test("administración, fuera del punto, confirma con su propio PIN", async () => {
    const ajeno = await local.app.turnos.abrir(ctxAdmin, fondo("0", "0"), pin(supervisora, "4826"), NOCHE);
    assert.equal(!ajeno.ok && ajeno.mensaje, "Confirma con tu propio PIN.");
    const t = valorDe(await local.app.turnos.abrir(ctxAdmin, fondo("0", "0"), pin(admin.id, admin.pin, "Cubro la caja mientras llega la laptop"), NOCHE));
    assert.deepEqual(t.fueraDelPunto, { autorizadoPor: "Abigail Karam", motivo: "Cubro la caja mientras llega la laptop" });
  });

  test("marcar el punto de cobro es de administración con la identidad confirmada, con su asiento", async () => {
    const orden = { kind: "PUNTO_DE_COBRO", deviceId: fueraId, puntoDeCobro: true, reason: "La tablet de la taquilla también cobra" };
    const cajera = await local.app.dispositivos.ordenar(ctxCajera, orden);
    assert.equal(!cajera.ok && cajera.motivo, "NO_PERMITIDO");
    const sinElevar = await contextoDe(local, equipoAdmin, admin.id, admin.pin);
    const r = await local.app.dispositivos.ordenar(sinElevar, orden);
    assert.equal(!r.ok && r.motivo, "ELEVACION_REQUERIDA");
    const d = valorDe(await local.app.dispositivos.ordenar(ctxAdmin, orden));
    assert.equal(d.puntoDeCobro, true);
    const otraVez = await local.app.dispositivos.ordenar(ctxAdmin, orden);
    assert.equal(!otraVez.ok && otraVez.mensaje, "Ese equipo ya es punto de cobro.");
    const asiento = (await local.app.auditoria.listar(local.sistema, { entityType: "device", entityId: fueraId })).find((a) => a.action === "dispositivo.punto_de_cobro" && a.reason === orden.reason);
    assert.deepEqual(asiento!.after, { label: "Tablet taquilla", puntoDeCobro: true });
    // Lo ya abierto no cambia: el turno sigue diciendo que se abrió fuera del punto.
    assert.notEqual((await local.app.turnos.delEquipo(ctxFuera))!.fueraDelPunto, null);
    assert.equal((await local.app.cortes.comprobarApertura(ctxFuera, NOCHE)).puntoDeCobro.esEste, true);
  });

  test("un equipo pendiente no es punto de cobro, y quitar la marca vuelve a pedir el PIN", async () => {
    const pendiente = (await crearEquipo(local, "Tablet nueva", false)).split(".")[1]!;
    const r = await local.app.dispositivos.ordenar(ctxAdmin, { kind: "PUNTO_DE_COBRO", deviceId: pendiente, puntoDeCobro: true, reason: "Antes de aprobarla" });
    assert.equal(!r.ok && r.mensaje, "Solo un equipo aprobado puede ser punto de cobro.");
    const quitar = valorDe(await local.app.dispositivos.ordenar(ctxAdmin, { kind: "PUNTO_DE_COBRO", deviceId: fueraId, puntoDeCobro: false, reason: "Volvió la laptop de caja" }));
    assert.equal(quitar.puntoDeCobro, false);
    assert.equal((await local.app.cortes.comprobarApertura(ctxFuera, NOCHE)).puntoDeCobro.esEste, false);
  });

  test("en producción, la cuenta de soporte no autoriza abrir fuera del punto ni sale en la lista", async () => {
    const soporte = await crearPersona(local, { nombre: "Luis Soporte", role: "ADMIN", pin: "8264" });
    await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.update({ where: { id: soporte }, data: { supportLogin: "luis.soporte" } }));
    const otraTablet = await contextoDe(local, await crearEquipo(local, "Tablet salón", true, false), ctxCajera.quien!.userId!, "7391");
    const r = await local.app.turnos.abrir(otraTablet, fondo("0", "0"), pin(soporte, "8264"), NOCHE);
    assert.equal(!r.ok && r.mensaje, "La cuenta de soporte no autoriza turnos aquí: lo autoriza administración del local.");
    const lista = await local.app.cuentas.autorizadores(otraTablet, "turno.abrirFueraDelPunto");
    assert.deepEqual(lista.map((a) => a.nombre), ["Abigail Karam"]);
  });

  test("la Puesta a punto pide un punto de cobro hasta que hay uno", async () => {
    const de = async (l: LocalDePrueba) => {
      const p = await l.app.puestaAPunto.leer(l.sistema);
      assert.ok(p.ok, JSON.stringify(p));
      return p.valor.puntos.find((x) => x.id === "punto_de_cobro")!;
    };
    const aqui = await de(local);
    assert.equal(aqui.hecho, true);
    assert.match(aqui.detalle, /como punto de cobro/);
    // Un local sin ningún equipo marcado (solo uno pendiente): falta, y bloquea abrir el turno sin administración.
    await crearEquipo(otro, "Laptop caja", false);
    const alla = await de(otro);
    assert.equal(alla.hecho, false);
    assert.equal(alla.bloquea, "Que la caja abra su turno sin administración");
  });
});

function valorDe<T>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T {
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor;
}
