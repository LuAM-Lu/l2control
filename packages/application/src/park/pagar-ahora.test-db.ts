/**
 * Pagar el parque antes de salir, contra l2control_test — B4-19 (M-39, X-4).
 *
 * Lo que fijan: una familia en cuenta abierta con tiempo abierto paga en la caja a los 20 minutos (su tiempo pasa al
 * paquete elegido, desde que entró) y sale a los 50 sin pasar por la caja; otra que se pasa deja su tiempo de más en la
 * cola; la monitora la manda a la caja; sin paquete elegido, con la versión vieja o sin nada que pagar, no; y el
 * «Más tiempo» de un niño que pasó a un paquete se puede.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { TIEMPO_ABIERTO_ID, type FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { FACTURA_DE_PRUEBA, abrirLocalDePrueba, cedulaDePrueba, contextoDe, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-09-27T14:00:00.000Z");
const HOY = "2026-09-27";
const MIN = 60_000;
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

let l: LocalDePrueba;
let cajera: Contexto;
let monitora: Contexto;
let pulsera = 0;

/** Una familia que entra a las AHORA, con un niño en tiempo abierto (o con un paquete fijo). */
const entra = async (packageId = TIEMPO_ABIERTO_ID, paymentMode: "CUENTA_ABIERTA" | "PREPAGO" = "CUENTA_ABIERTA") => {
  const tel = `0414-${String(7_300_000 + ++pulsera)}`;
  return valor(
    await l.app.parque.entrar(
      monitora,
      {
        idempotencyKey: randomUUID(),
        paymentMode,
        entries: [{ wristbandCode: `PA-${String(pulsera).padStart(4, "0")}`, kid: {}, packageId }],
        guardian: { fullName: "Prueba Familia Pagar Antes", contactReference: tel },
        guardianDocument: cedulaDePrueba(tel),
      },
      AHORA,
    ),
  );
};
const pagarAhora = (ctx: Contexto, c: FamilyAccountDto, paquetes: { sessionId: string; paquete: string }[], ahora = AHORA + 20 * MIN) =>
  l.app.parque.pagarAhora(ctx, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, paquetes }, ahora);
const cobrar = (c: FamilyAccountDto, total: string, ahora: number) =>
  l.app.cuentas.cobrar(
    cajera,
    {
      idempotencyKey: randomUUID(),
      accountId: c.id,
      version: c.version,
      lineIds: c.lines.filter((x) => !x.paid && !x.movedTo && !x.cortesia && !x.anulacion).map((x) => x.id),
      total: usd(total),
      pagos: [{ method: "EFECTIVO_USD", amount: usd("1000") }],
      destinoSobra: "VUELTO",
      cliente: FACTURA_DE_PRUEBA,
    },
    ahora,
  );
const salir = (sessionId: string, ahora: number) =>
  l.app.parque.salir(monitora, { idempotencyKey: randomUUID(), sessionIds: [sessionId], disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } }, ahora);

before(async () => {
  l = await abrirLocalDePrueba(URL_APP, "Prueba pagar antes de salir");
  valor(
    await l.app.tarifario.publicar(l.sistema, {
      packages: [
        { id: "pkg-30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: usd("300"), active: true },
        { id: "pkg-60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true },
      ],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
  valor(await l.app.tasas.capturar(l.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IVA", code: "REDUCIDA", basisPoints: 800, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await l.app.impuestos.programar(l.sistema, cmd, AHORA - 10 * MIN));
  }
  const marisol = await crearPersona(l, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const ana = await crearPersona(l, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  cajera = await contextoDe(l, await crearEquipo(l, "Caja"), marisol, "7391");
  monitora = await contextoDe(l, await crearEquipo(l, "Entrada"), ana, "6284");
  valor(
    await l.app.turnos.abrir(
      cajera,
      { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] },
      undefined,
      AHORA - 30 * MIN,
    ),
  );
});

after(async () => {
  await l.cerrar();
});

describe("pagar el parque antes de salir (B4-19, M-39)", () => {
  test("en cuenta abierta paga en la caja a los 20 minutos y sale a los 50 sin pasar por la caja", async () => {
    const e = await entra();
    const nino = e.sessions[0]!;
    assert.equal(e.account.status, "ABIERTA");
    const pagada = valor(await pagarAhora(cajera, e.account, [{ sessionId: nino.id, paquete: "1 hora" }]));
    assert.equal(pagada.status, "POR_COBRAR");
    assert.deepEqual(
      pagada.lines.map((x) => [x.concept, x.amount.minor, x.paid]),
      [[`Paquete 1 hora · ${nino.wristbandCode}`, "500", false]],
    );
    const { cuenta } = valor(await cobrar(pagada, "580", AHORA + 21 * MIN));
    assert.equal(cuenta.status, "ABIERTA", "cobrada, con el niño todavía en la sala");

    // En la sala ya es un paquete de 1 hora desde que entró: le quedan 40 minutos.
    const sala = valor(await l.app.parque.sala(monitora, AHORA + 21 * MIN));
    const enSala = sala.sessions.find((s) => s.id === nino.id)!;
    assert.deepEqual([enSala.packageName, enSala.duration, enSala.pagadaAntes], ["1 hora", { kind: "fixed", minutes: 60 }, true]);

    const s = valor(await salir(nino.id, AHORA + 50 * MIN));
    assert.equal(s.account.status, "COBRADA", "sale sin pasar por la caja");
    assert.equal(s.lines[0]!.overdue.minor, "0");
  });

  test("otra que se pasa deja su tiempo de más en la cola; si sale antes, no se devuelve", async () => {
    const e = await entra();
    const pagada = valor(await pagarAhora(cajera, e.account, [{ sessionId: e.sessions[0]!.id, paquete: "30 minutos" }]));
    valor(await cobrar(pagada, "348", AHORA + 21 * MIN));
    const s = valor(await salir(e.sessions[0]!.id, AHORA + 50 * MIN));
    assert.equal(s.account.status, "POR_COBRAR");
    assert.deepEqual(
      s.account.lines.filter((x) => !x.paid).map((x) => [x.concept.split(" · ")[0], x.amount.minor]),
      [["Tiempo de más", "300"]], // un bloque de 30 min a su precio, sin tope (B4-22; con tope eran $ 2)
    );

    const antes = await entra();
    const otra = valor(await pagarAhora(cajera, antes.account, [{ sessionId: antes.sessions[0]!.id, paquete: "1 hora" }]));
    valor(await cobrar(otra, "580", AHORA + 21 * MIN));
    const corta = valor(await salir(antes.sessions[0]!.id, AHORA + 25 * MIN));
    assert.equal(corta.account.status, "COBRADA", "salió antes: no se devuelve ni se cobra más");
    assert.ok(corta.account.lines.every((x) => x.paid || x.porUso === undefined));
  });

  test("la monitora la manda a la caja; un paquete fijo en cuenta abierta va con su línea", async () => {
    const e = await entra();
    const enCola = valor(await pagarAhora(monitora, e.account, [{ sessionId: e.sessions[0]!.id, paquete: "1 hora" }]));
    const cola = valor(await l.app.cuentas.leer(cajera, AHORA + 20 * MIN)).cuentas.filter((c) => c.status === "POR_COBRAR").map((c) => c.id);
    assert.ok(cola.includes(enCola.id));

    const fijo = await entra("pkg-60");
    const r = valor(await pagarAhora(monitora, fijo.account, []));
    assert.equal(r.status, "POR_COBRAR");
    assert.deepEqual(r.lines.map((x) => x.amount.minor), ["500"]);
  });

  test("sin paquete elegido, con la versión vieja o sin nada que pagar, no; el «Más tiempo» de uno que pasó a un paquete, sí", async () => {
    const e = await entra();
    const sin = await pagarAhora(cajera, e.account, []);
    assert.equal(!sin.ok && sin.problemas?.[0]?.message, "FALTA_EL_PAQUETE");
    const raro = await pagarAhora(cajera, e.account, [{ sessionId: e.sessions[0]!.id, paquete: "Tiempo abierto" }]);
    assert.equal(!raro.ok && raro.problemas?.[0]?.message, "FALTA_EL_PAQUETE");
    const vieja = await pagarAhora(cajera, { ...e.account, version: e.account.version! + 5 }, [{ sessionId: e.sessions[0]!.id, paquete: "30 minutos" }]);
    assert.equal(!vieja.ok && vieja.motivo, "CONFLICTO");

    const pagada = valor(await pagarAhora(cajera, e.account, [{ sessionId: e.sessions[0]!.id, paquete: "30 minutos" }]));
    const { cuenta } = valor(await cobrar(pagada, "348", AHORA + 21 * MIN));
    const nada = await pagarAhora(cajera, cuenta, []);
    assert.equal(!nada.ok && nada.problemas?.[0]?.message, "NADA_QUE_PAGAR");

    const mas = valor(await l.app.parque.recargar(monitora, { idempotencyKey: randomUUID(), sessionId: e.sessions[0]!.id, packageId: "pkg-60" }, AHORA + 25 * MIN));
    assert.deepEqual(mas.session.duration, { kind: "fixed", minutes: 60 });
  });
});
