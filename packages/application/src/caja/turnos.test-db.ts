/**
 * El turno de caja en el servidor, contra l2control_test — B3-1, F4-01, I-06, ADR-009.
 *
 * Con reloj fijo: el día de negocio es el del local al abrir. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

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
    const r = await local.app.turnos.abrir(ctxCajera, fondo("2000", "150000"), NOCHE);
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
    const r = await local.app.turnos.abrir(ctxCajera, fondo("0", "0"), NOCHE + 60_000);
    assert.equal(!r.ok && r.motivo, "CONFLICTO");
  });

  test("dos aperturas a la vez en el mismo equipo dejan un solo turno", async () => {
    const [a, b] = await Promise.all([
      local.app.turnos.abrir(ctxCajeraOtroEquipo, fondo("0", "0"), NOCHE),
      local.app.turnos.abrir(ctxCajeraOtroEquipo, fondo("0", "0"), NOCHE),
    ]);
    assert.equal([a, b].filter((r) => r.ok).length, 1);
    assert.equal([a, b].filter((r) => !r.ok && r.motivo === "CONFLICTO").length, 1);
  });

  test("cero vale, negativo no, y hacen falta las dos monedas de la gaveta", async () => {
    const ctx = await contextoDe(local, await crearEquipo(local, "Caja 3"), ctxCajera.quien!.userId!, "7391");
    for (const malo of [fondo("-100", "0"), { fondos: fondo("0", "0").fondos.slice(0, 1) }]) {
      const r = await local.app.turnos.abrir(ctx, malo, NOCHE);
      assert.equal(!r.ok && r.motivo, "INVALIDO", JSON.stringify(malo));
    }
    assert.equal(await local.app.turnos.delEquipo(ctx), null);
  });

  test("el navegador no dice el equipo, la persona ni el día (ADR-017)", async () => {
    const ctx = await contextoDe(local, await crearEquipo(local, "Caja 4"), ctxCajera.quien!.userId!, "7391");
    for (const extra of [{ deviceId: ctxCajera.quien!.deviceId }, { abiertoPor: { id: "x", name: "Otra persona" } }, { businessDate: "2026-01-01" }]) {
      const r = await local.app.turnos.abrir(ctx, { ...fondo("0", "0"), ...extra }, NOCHE);
      assert.equal(!r.ok && r.motivo, "INVALIDO");
    }
  });

  test("la monitora no abre turno, el sistema sin equipo tampoco, y el intento se audita", async () => {
    const r = await local.app.turnos.abrir(ctxMonitora, fondo("0", "0"), NOCHE);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const sinEquipo = await local.app.turnos.abrir(local.sistema, fondo("0", "0"), NOCHE);
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
