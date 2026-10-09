/**
 * La pausa por comida, contra l2control_test — B4-7 (M-27, P-14).
 *
 * Lo que fijan: la monitora pausa el reloj de un niño con el máximo de la sucursal (10 de fábrica, o el que
 * diga el ajuste); hay una sola pausa por visita, también si dos equipos la piden a la vez; se termina antes
 * solo si sigue en curso; el reintento no registra otra; la salida y el tiempo de más se cuentan sin la pausa;
 * permiso, estancias que ya salieron y aislamiento. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { EstanciaDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba, cedulaDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
/** Domingo 27 de septiembre de 2026, 10:00 am en Caracas. */
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const rechazo = (r: { ok: boolean }) => r as { ok: false; motivo: string; mensaje: string; problemas?: { message: string }[] };

let l: LocalDePrueba;
let otro: LocalDePrueba;
let monitora: Contexto;
let cocinero: Contexto;
let otraMonitora: Contexto;
let pulsera = 0;

/** Entra un niño con 1 hora en `ahora` y devuelve su estancia. */
async function entra(ahora = AHORA, local = l, ctx = monitora): Promise<EstanciaDto> {
  const r = valor(
    await local.app.parque.entrar(
      ctx,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "CUENTA_ABIERTA",
        entries: [{ wristbandCode: `PZ-${String(++pulsera).padStart(4, "0")}`, kid: {}, packageId: "pkg-60" }],
        guardian: { fullName: "Familia Pausa", contactReference: `0414-${String(3_000_000 + pulsera)}` }, guardianDocument: cedulaDePrueba(`0414-${String(3_000_000 + pulsera)}`),
      },
      ahora,
    ),
  );
  return r.sessions[0]!;
}
const pausa = (ctx: Contexto, sessionId: string, accion: "PAUSAR" | "REANUDAR", ahora: number, idempotencyKey = randomUUID(), local = l) =>
  local.app.parque.pausa(ctx, { idempotencyKey, sessionId, accion }, ahora);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba pausa");
  otro = await abrirLocalDePrueba(URL_APP, "Prueba pausa B");
  for (const local of [l, otro]) {
    valor(
      await local.app.tarifario.publicar(local.sistema, {
        packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
        policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
      }),
    );
  }
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const chef = await crearPersona(l, { nombre: "Chef Soto", role: "COCINA", pin: "9081" });
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  cocinero = await contextoDe(l, await crearEquipo(l, "Cocina"), chef, "9081");
  const rosa = await crearPersona(otro, { nombre: "Rosa Díaz", role: "MONITOR_PARQUE", pin: "6284" });
  otraMonitora = await contextoDe(otro, await crearEquipo(otro, "Entrada"), rosa, "6284");
});

after(async () => {
  await l.cerrar();
  await otro.cerrar();
});

describe("pausar y reanudar", () => {
  test("pausa con el máximo de fábrica (10 min) y la sala lo dice", async () => {
    const s = await entra();
    const pausada = valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 20 * MIN));
    assert.deepEqual(pausada.pausa, { desde: new Date(AHORA + 20 * MIN).toISOString(), hasta: null, maxMin: 10 });
    const sala = valor(await l.app.parque.sala(monitora, AHORA + 22 * MIN));
    assert.equal(sala.sessions.find((x) => x.id === s.id)?.pausa?.maxMin, 10);
    const asiento = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.auditEntry.findFirst({ where: { entityId: s.id, action: "parque.pausar" } }));
    assert.ok(asiento, "queda en la auditoría");
  });

  test("una sola pausa por visita: la segunda se niega", async () => {
    const s = await entra();
    valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 10 * MIN));
    const otra = rechazo(await pausa(monitora, s.id, "PAUSAR", AHORA + 40 * MIN));
    assert.equal(otra.motivo, "CONFLICTO");
    assert.equal(otra.problemas?.[0]?.message, "YA_PAUSO");
  });

  test("dos equipos que pausan a la vez dejan una sola pausa", async () => {
    const s = await entra();
    const [a, b] = await Promise.all([pausa(monitora, s.id, "PAUSAR", AHORA + 5 * MIN), pausa(monitora, s.id, "PAUSAR", AHORA + 5 * MIN)]);
    assert.equal([a, b].filter((r) => r.ok).length, 1, JSON.stringify([a, b]));
    const filas = await l.base.conTenant(l.sistema.tenantId, (tx) => tx.parkSessionPause.count({ where: { sessionId: s.id } }));
    assert.equal(filas, 1);
  });

  test("el reintento con la misma clave devuelve la estancia sin registrar otra", async () => {
    const s = await entra();
    const clave = randomUUID();
    valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 15 * MIN, clave));
    const otra = valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 16 * MIN, clave));
    assert.equal(otra.pausa?.desde, new Date(AHORA + 15 * MIN).toISOString());
  });

  test("se termina antes del máximo; después ya no", async () => {
    const s = await entra();
    valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 20 * MIN));
    const reanudada = valor(await pausa(monitora, s.id, "REANUDAR", AHORA + 26 * MIN));
    assert.equal(reanudada.pausa?.hasta, new Date(AHORA + 26 * MIN).toISOString());
    const otra = rechazo(await pausa(monitora, s.id, "REANUDAR", AHORA + 27 * MIN));
    assert.equal(otra.problemas?.[0]?.message, "YA_TERMINO");
  });

  test("sin pausa no hay nada que reanudar, y pasado el máximo la pausa ya terminó sola", async () => {
    const s = await entra();
    assert.equal(rechazo(await pausa(monitora, s.id, "REANUDAR", AHORA + 5 * MIN)).problemas?.[0]?.message, "SIN_PAUSA");
    valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 10 * MIN));
    assert.equal(rechazo(await pausa(monitora, s.id, "REANUDAR", AHORA + 21 * MIN)).problemas?.[0]?.message, "YA_TERMINO");
  });

  test("el máximo es el del ajuste de la sucursal al pausar", async () => {
    const v = await l.app.ajustes.leer(l.sistema);
    valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, pausaMaximaMin: 5 } }));
    try {
      const s = await entra();
      assert.equal(valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 3 * MIN)).pausa?.maxMin, 5);
    } finally {
      const w = await l.app.ajustes.leer(l.sistema);
      valor(await l.app.ajustes.publicar(l.sistema, { versionBase: w.version, ajustes: { ...w.ajustes, pausaMaximaMin: 10 } }));
    }
  });
});

describe("la salida sin la pausa", () => {
  test("68 minutos dentro con 10 de pausa no pagan tiempo de más (1 hora y 5 de gracia)", async () => {
    const s = await entra();
    valor(await pausa(monitora, s.id, "PAUSAR", AHORA + 20 * MIN));
    const r = valor(
      await l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [s.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, AHORA + 68 * MIN),
    );
    const linea = r.lines.find((x) => x.sessionId === s.id)!;
    assert.equal(linea.overdue.minor, "0", JSON.stringify(linea));
  });

  test("sin pausa, los mismos 68 minutos sí pagan un bloque", async () => {
    const s = await entra();
    const r = valor(
      await l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [s.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, AHORA + 68 * MIN),
    );
    assert.equal(r.lines.find((x) => x.sessionId === s.id)!.overdue.minor, "150");
  });

  test("un niño que ya salió no se pausa", async () => {
    const s = await entra();
    valor(await l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [s.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, AHORA + 30 * MIN));
    assert.equal(rechazo(await pausa(monitora, s.id, "PAUSAR", AHORA + 31 * MIN)).motivo, "CONFLICTO");
  });
});

describe("permiso y aislamiento", () => {
  test("la cocina no pausa a nadie", async () => {
    const s = await entra();
    assert.equal(rechazo(await pausa(cocinero, s.id, "PAUSAR", AHORA + MIN)).motivo, "NO_PERMITIDO");
  });

  test("otro local no ve ni pausa las estancias de este", async () => {
    const s = await entra();
    assert.equal(rechazo(await pausa(otraMonitora, s.id, "PAUSAR", AHORA + MIN, randomUUID(), otro)).motivo, "NO_DISPONIBLE");
  });
});
