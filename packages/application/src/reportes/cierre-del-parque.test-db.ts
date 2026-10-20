/**
 * El cierre del parque contra l2control_test — B4-21 (M-40). Corre con `pnpm test:db`.
 *
 * El criterio: al cerrar el día, la monitora tiene en una hoja cada familia que pasó por el parque y cuadra sus pulseras y
 * sus medias. Sin montos.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, cedulaDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";
import { telefonoAMedias } from "./cierre-del-parque.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
// Un martes a las 2:00 pm en el local (America/Caracas).
const AHORA = Date.parse("2026-10-20T18:00:00.000Z");
const MIN = 60_000;

let local: LocalDePrueba;
let ctxMonitora: Contexto;
let ctxAdmin: Contexto;
let ctxMesero: Contexto;
let adminId: string;

const valor = <T>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  if (!r.ok) throw new Error(r.mensaje);
  return r.valor;
};
const usd = (minor: string) => ({ minor, currency: "USD" as const });

let telefono = 0;
async function entran(representante: string, ninos: readonly [string, string][]) {
  const tel = `0414-${String(5_550_000 + ++telefono)}`;
  return valor(
    await local.app.parque.entrar(
      ctxMonitora,
      {
        idempotencyKey: randomUUID(),
        paymentMode: "CUENTA_ABIERTA",
        entries: ninos.map(([nombre, pulsera]) => ({ wristbandCode: pulsera, kid: { name: nombre }, packageId: "pkg-60" })),
        guardian: { fullName: representante, contactReference: tel },
        guardianDocument: cedulaDePrueba(tel),
      },
      AHORA,
    ),
  ).sessions;
}
const salen = (sessionIds: string[], recogida: Record<string, unknown>, en: number) =>
  local.app.parque.salir(ctxMonitora, { idempotencyKey: randomUUID(), sessionIds, disposition: { kind: "CAJA" }, recogida }, en);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Cierre del parque");
  valor(
    await local.app.tarifario.publicar(local.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  const monitora = await crearPersona(local, { nombre: "Eglee Pérez", role: "MONITOR_PARQUE", pin: "1357" });
  const admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  adminId = admin;
  const mesero = await crearPersona(local, { nombre: "Emily Rojas", role: "MESERO", pin: "2468" });
  ctxMonitora = await contextoDe(local, await crearEquipo(local, "Teléfono de la monitora", true, false), monitora, "1357");
  ctxAdmin = await contextoDe(local, await crearEquipo(local, "Oficina"), admin, "4826");
  ctxMesero = await contextoDe(local, await crearEquipo(local, "Tablet", true, false), mesero, "2468");
});

after(async () => {
  await local.cerrar();
});

describe("el cierre del parque (B4-21)", () => {
  test("el teléfono va a medias", () => {
    assert.equal(telefonoAMedias("0414-1234567"), "0414-•••-4567");
    assert.equal(telefonoAMedias("+58 412 555 0142"), "0412-•••-0142");
  });

  test("lo ve quien atiende el parque, no el mesero", async () => {
    const r = await local.app.reportes.cierreDelParque(ctxMesero, AHORA);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
  });

  test("cada familia con sus niños, lo que pide atención y las pulseras; sin montos; la sala en cero para cerrar", async () => {
    const perez = await entran("Prueba María Pérez", [
      ["Prueba Sofía", "AK-7712"],
      ["Prueba Mateo", "AK-7713"],
    ]);
    const mendez = await entran("Prueba Carla Méndez", [["Prueba Valentina", "AK-7720"]]);
    const anulada = await entran("Prueba Luis Rojas", [["Prueba Lucas", "AK-7730"]]);

    // A media tarde: un corte del momento, con los cuatro en la sala.
    const enMedio = valor(await local.app.reportes.cierreDelParque(ctxMonitora, AHORA + 30 * MIN));
    assert.equal(enMedio.resumen.enSala, 4);

    valor(await local.app.parque.anularEntrada(ctxAdmin, { idempotencyKey: randomUUID(), sessionId: anulada[0]!.id, motivo: "Se pasó la pulsera equivocada" }, { autorizadorId: adminId, pin: "4826", motivo: "Entrada por error" }, AHORA + 5 * MIN));
    valor(await salen([mendez[0]!.id], { kind: "OTRA_PERSONA", nombre: "Prueba Rosa Díaz" }, AHORA + 60 * MIN));
    valor(await salen(perez.map((s) => s.id), { kind: "REPRESENTANTE" }, AHORA + 124 * MIN));

    const c = valor(await local.app.reportes.cierreDelParque(ctxMonitora, AHORA + 3 * 60 * MIN));
    assert.equal(c.dia, "2026-10-20");
    assert.equal(c.encabezado.generadoPor, "Eglee Pérez");
    assert.deepEqual([c.resumen.ninos, c.resumen.familias, c.resumen.enSala, c.resumen.pico?.ninos], [3, 2, 0, 3], "sin la anulada; la sala en cero");
    assert.equal(c.resumen.minutosPromedio, Math.round((124 + 124 + 60) / 3));

    const deLaFamilia = c.familias.find((f) => f.representante === "Prueba María Pérez")!;
    assert.match(deLaFamilia.telefono, /^0414-•••-\d{4}$/);
    const sofia = deLaFamilia.ninos.find((n) => n.nombre === "Prueba Sofía")!;
    assert.deepEqual([sofia.pulsera, sofia.paquete, sofia.minutos, sofia.deMas, sofia.recogio], ["AK-7712", "1 hora", 124, 64, { nombre: "Prueba María Pérez", otro: false }]);
    const valentina = c.familias.find((f) => f.representante === "Prueba Carla Méndez")!.ninos[0]!;
    assert.deepEqual([valentina.deMas, valentina.recogio], [null, { nombre: "Prueba Rosa Díaz", otro: true }]);
    assert.equal(c.familias.find((f) => f.representante === "Prueba Luis Rojas")!.ninos[0]!.anulada, true);

    assert.deepEqual(
      c.atencion.map((a) => [a.tipo, a.nino]),
      [
        ["ANULADA", "Prueba Lucas"],
        ["OTRA_PERSONA", "Prueba Valentina"],
      ],
    );
    assert.match(c.atencion[0]!.detalle, /Abigail Karam: Se pasó la pulsera equivocada/);
    // La pulsera de la anulada también se gastó.
    assert.deepEqual(c.pulseras, { usadas: 4, desde: "AK-7712", hasta: "AK-7730" });
    assert.deepEqual(c.medias, { pares: 0, quedan: null });
    // Sin montos: nada del cierre es dinero.
    assert.doesNotMatch(JSON.stringify(c), /"minor"|"currency"/);
  });
});
