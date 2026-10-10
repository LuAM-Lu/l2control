/**
 * El informe del parque, contra l2control_test — B11-6 (M-37, U-4).
 *
 * Lo que fijan: los niños del periodo por día y por hora de entrada, con el aforo pico; el dinero del tiempo donde
 * terminó (paquetes, recargas y tiempo de más); las que salieron antes de tiempo; y las excepciones (sin pulsera,
 * recogido por otra persona). Lo pide quien ve la sucursal.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, cedulaDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
// Viernes 9 de octubre de 2026, 2:00 pm en Caracas.
const AHORA = Date.parse("2026-10-09T18:00:00.000Z");
const DIA = "2026-10-09";
const MIN = 60_000;

let local: LocalDePrueba;
let monitora: Contexto;
let supervisora: Contexto;
let telefono = 0;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const entrar = async (ninos: { nombre: string; sinPulsera?: true }[], ahora: number) => {
  const t = `0416-${String(5_000_000 + ++telefono)}`;
  return valor(
    await local.app.parque.entrar(
      monitora,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "CUENTA_ABIERTA",
        entries: ninos.map((n, i) => ({ ...(n.sinPulsera ? { sinPulsera: true } : { wristbandCode: `PRUEBA-PQ-${telefono}-${i}` }), kid: { name: n.nombre }, packageId: "pkg-60" })),
        guardian: { fullName: `Prueba Familia ${telefono}`, contactReference: t },
        guardianDocument: cedulaDePrueba(t),
      },
      ahora,
    ),
  );
};
const salir = (sessionIds: string[], ahora: number, extra: Record<string, unknown> = {}) =>
  local.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds, disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" }, ...extra }, ahora);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "El informe del parque");
  valor(
    await local.app.tarifario.publicar(local.sistema, {
      packages: [
        { id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true },
        { id: "pkg-120", name: "2 horas", mode: "PREPAGO", duration: { kind: "fixed", minutes: 120 }, price: usd("800"), active: true },
      ],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  const ana = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const luisa = await crearPersona(local, { nombre: "Luisa Mora", role: "SUPERVISOR", pin: "5937" });
  monitora = await contextoDe(local, await crearEquipo(local, "Entrada", true, false), ana, "6284");
  supervisora = await contextoDe(local, await crearEquipo(local, "Oficina", true, false), luisa, "5937");

  // 2:00 pm: dos hermanos (uno sin pulsera); 2:30 pm, una niña que sube a 2 horas (60 min más, $ 3,00).
  const a = await entrar([{ nombre: "Pedro" }, { nombre: "Matías", sinPulsera: true }], AHORA);
  const b = await entrar([{ nombre: "Sofía" }], AHORA + 30 * MIN);
  valor(await local.app.parque.recargar(monitora, { idempotencyKey: randomUUID(), sessionId: b.sessions[0]!.id, packageId: "pkg-120" }, AHORA + 40 * MIN));
  // Pedro sale a las 3:30 pm: 90 min de 60, con 5 de gracia → 2 bloques de tiempo de más ($ 3,00). Lo recoge su tía.
  valor(await salir([a.sessions[0]!.id], AHORA + 90 * MIN, { recogida: { kind: "OTRA_PERSONA", nombre: "Rosa Díaz (tía)" } }));
  // Matías sale a los 20 min: antes de tiempo.
  valor(await salir([a.sessions[1]!.id], AHORA + 20 * MIN));
});

after(async () => {
  await local.cerrar();
});

describe("el informe del parque (B11-6)", () => {
  test("niños por día y por hora, el aforo pico y el dinero del tiempo", async () => {
    const i = valor(await local.app.reportes.parque(supervisora, { desde: DIA, hasta: DIA }, AHORA + 2 * 60 * MIN));
    assert.equal(i.resumen.ninos, 3);
    assert.deepEqual(i.resumen.pico && i.resumen.pico.ninos, 2, "a las 2:30 pm Matías ya salió: Pedro y Sofía");
    assert.equal(i.resumen.aforo, 30);
    assert.deepEqual(i.porDia.map((d) => [d.dia, d.ninos]), [[DIA, 3]]);
    assert.deepEqual(i.porHora, [{ hora: 14, ninos: 3 }]);
    assert.deepEqual(i.dinero.paquetes, { cantidad: 3, monto: usd("1500") });
    assert.equal(i.dinero.recargas.cantidad, 1);
    assert.equal(i.dinero.recargas.minutos, 60);
    assert.deepEqual(i.dinero.recargas.monto, usd("300"));
    assert.deepEqual(i.dinero.tiempoDeMas, { cantidad: 1, monto: usd("300") });
    assert.equal(i.resumen.dinero.minor, String(1500 + Number(i.dinero.recargas.monto.minor) + 300));
    assert.deepEqual(i.dinero.porPaquete.map((p) => [p.paquete, p.ninos]), [["1 hora", 3]]);
  });

  test("las estancias y las excepciones", async () => {
    const i = valor(await local.app.reportes.parque(supervisora, { desde: DIA, hasta: DIA }, AHORA + 2 * 60 * MIN));
    assert.equal(i.estancias.salieron, 2);
    assert.equal(i.estancias.enSala, 1);
    assert.equal(i.estancias.antesDeTiempo, 1, "Matías");
    assert.equal(i.resumen.minutosPromedio, 55, "90 y 20 minutos");
    assert.deepEqual(
      i.excepciones.map((e) => [e.tipo, e.nino]),
      [
        ["SIN_PULSERA", "Matías"],
        ["RECOGIDO_POR_OTRO", "Pedro"],
      ],
    );
    assert.match(i.excepciones[1]!.detalle, /Rosa Díaz/);
  });

  test("otro periodo no trae nada; y lo pide quien ve la sucursal", async () => {
    const vacio = valor(await local.app.reportes.parque(supervisora, { desde: "2026-10-01", hasta: "2026-10-08" }, AHORA + 2 * 60 * MIN));
    assert.equal(vacio.resumen.ninos, 0);
    assert.equal(vacio.resumen.pico, null);
    const r = await local.app.reportes.parque(monitora, { desde: DIA, hasta: DIA }, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });
});
