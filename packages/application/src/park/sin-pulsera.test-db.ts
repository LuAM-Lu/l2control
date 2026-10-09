/**
 * Entrar sin pulsera, contra l2control_test — B4-8 (M-27, P-1).
 *
 * Lo que fijan: un niño que no tolera la pulsera entra marcado «sin pulsera» con su nombre; el servidor le da un
 * código reservado, correlativo por sucursal («SP-00001»), que va en su estancia y en su cuenta; sin nombre no
 * entra; una pulsera física con ese prefijo se rechaza (también al consultarla); la serie del local no se le
 * aplica; sale y cuenta en el aforo como cualquiera. Corre con `pnpm test:db`.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
let monitora: Contexto;
let telefono = 0;

type Nino = { wristbandCode?: string; sinPulsera?: true; nombre?: string };
const entrada = (ninos: Nino[]) => ({
  idempotencyKey: randomUUID(),
  paymentMode: "CUENTA_ABIERTA",
  entries: ninos.map((n) => ({
    ...(n.wristbandCode ? { wristbandCode: n.wristbandCode } : {}),
    ...(n.sinPulsera ? { sinPulsera: true } : {}),
    kid: n.nombre ? { name: n.nombre } : {},
    packageId: "pkg-60",
  })),
  guardian: { fullName: "Familia Sin Pulsera", contactReference: `0416-${String(4_000_000 + ++telefono)}` }, guardianDocument: cedulaDePrueba(`0416-${String(4_000_000 + ++telefono)}`),
});

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba sin pulsera");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [{ id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true }],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
});

after(async () => {
  await l.cerrar();
});

describe("entrar sin pulsera", () => {
  test("entra con su nombre y el servidor le da su código reservado, en la estancia y en la cuenta", async () => {
    const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true, nombre: "Matías" }]), AHORA));
    const s = r.sessions[0]!;
    assert.equal(s.wristbandCode, "SP-00001");
    assert.equal(s.kid.name, "Matías");
    assert.match(r.account.lines[0]!.concept, /SP-00001/);
  });

  test("los códigos siguen el correlativo, también con niños con pulsera en la misma entrada", async () => {
    const r = valor(
      await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true, nombre: "Sofía" }, { wristbandCode: "AK-8801" }, { sinPulsera: true, nombre: "Lucas" }]), AHORA + MIN),
    );
    assert.deepEqual(r.sessions.map((s) => s.wristbandCode).sort(), ["AK-8801", "SP-00002", "SP-00003"]);
  });

  test("sin nombre no entra: se le reconoce por él", async () => {
    const r = rechazo(await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true }]), AHORA));
    assert.equal(r.motivo, "INVALIDO");
  });

  test("una pulsera física con el prefijo reservado no entra, y al consultarla se dice por qué", async () => {
    const r = rechazo(await l.app.parque.entrar(monitora, entrada([{ wristbandCode: "SP-77777" }]), AHORA));
    assert.equal(r.problemas?.[0]?.message, "PULSERA_RESERVADA");
    const consulta = valor(await l.app.parque.pulsera(monitora, { codigo: "SP-77777" }));
    assert.equal(consulta.estado, "FUERA_DE_SERIE");
  });

  test("la serie del local no se aplica a un niño sin pulsera", async () => {
    const v = await l.app.ajustes.leer(l.sistema);
    valor(await l.app.ajustes.publicar(l.sistema, { versionBase: v.version, ajustes: { ...v.ajustes, pulseras: { prefijo: "AK-", longitud: 7 } } }));
    try {
      const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true, nombre: "Valentina" }]), AHORA + 2 * MIN));
      assert.equal(r.sessions[0]!.wristbandCode, "SP-00004");
    } finally {
      const w = await l.app.ajustes.leer(l.sistema);
      valor(await l.app.ajustes.publicar(l.sistema, { versionBase: w.version, ajustes: { ...w.ajustes, pulseras: { prefijo: null, longitud: null } } }));
    }
  });

  test("sale como cualquiera, y su código no se vuelve a dar", async () => {
    const r = valor(await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true, nombre: "Diego" }]), AHORA + 3 * MIN));
    const s = r.sessions[0]!;
    valor(await l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [s.id], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, AHORA + 30 * MIN));
    const otro = valor(await l.app.parque.entrar(monitora, entrada([{ sinPulsera: true, nombre: "Diego" }]), AHORA + 31 * MIN));
    assert.notEqual(otro.sessions[0]!.wristbandCode, s.wristbandCode);
  });

  test("cuenta en el aforo de la sala", async () => {
    const sala = valor(await l.app.parque.sala(monitora, AHORA + 32 * MIN));
    assert.ok(sala.sessions.some((x) => x.wristbandCode.startsWith("SP-")));
  });
});
