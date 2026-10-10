/**
 * Dividir por ítems, contra l2control_test — B3-20 (M-37).
 *
 * Lo que fijan: partir un ítem deja la línea con su importe y nacen sus partes, el céntimo a la primera; lo de cada
 * persona pasa a su cuenta y se cobra con el cobro de siempre (sin pedir «Factura a»); unir de nuevo devuelve lo que no
 * se cobró y deja lo cobrado; los rechazos (persona 1 vacía, ítem que no se debe, versión vieja, partes iguales); el
 * reintento; permiso, auditoría, el aviso en vivo y el aislamiento por tenant.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, FACTURA_DE_PRUEBA, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T16:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let marisol: Contexto;
let cocina: Contexto;
let otraCajera: Contexto;
let agua: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const lineaDeAgua = (id = randomUUID()) => ({ id, concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: agua, taxCode: "GENERAL" });
/** Una venta del mostrador en la cola con tres aguas: a1, a2 y a3. */
const conTresAguas = async () => {
  const ids = { a1: randomUUID(), a2: randomUUID(), a3: randomUUID() };
  const c = valor(
    await local.app.cuentas.guardar(
      marisol,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mesa del fondo",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(AHORA).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [lineaDeAgua(ids.a1), lineaDeAgua(ids.a2), lineaDeAgua(ids.a3)],
        },
      },
      AHORA,
    ),
  );
  return { c, ...ids };
};
const cobrar = (c: FamilyAccountDto, totalMinor: string, conCliente = false) =>
  local.app.cuentas.cobrar(
    marisol,
    {
      idempotencyKey: randomUUID(),
      accountId: c.id,
      version: c.version,
      lineIds: c.lines.filter((l) => !l.paid && !l.movedTo && !l.partida).map((l) => l.id),
      total: usd(totalMinor),
      pagos: [{ method: "EFECTIVO_USD", amount: usd(totalMinor) }],
      destinoSobra: "VUELTO",
      ...(conCliente ? { cliente: FACTURA_DE_PRUEBA } : {}),
    },
    AHORA + MIN,
  );
const dividir = (ctx: Contexto, c: FamilyAccountDto, personas: string[][], idempotencyKey = randomUUID()) =>
  local.app.dividir.dividir(ctx, { idempotencyKey, accountId: c.id, version: c.version, personas: personas.map((lineIds) => ({ lineIds })) }, AHORA);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Dividir por ítems");
  otro = await abrirLocalDePrueba(URL_APP, "Dividir por ítems de otro");
  const a = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const k = await crearPersona(local, { nombre: "Rosa Mata", role: "COCINA", pin: "8462" });
  marisol = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "7391");
  cocina = await contextoDe(local, await crearEquipo(local, "Cocina"), k, "8462");
  const c = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "CAJERO", pin: "7391" });
  otraCajera = await contextoDe(otro, await crearEquipo(otro, "Caja 1"), c, "7391");

  const FONDO = { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await local.app.turnos.abrir(marisol, FONDO, undefined, AHORA - 2 * MIN));
  valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN));
  // El IGTF, al 0 % como en el local (V-13).
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 10 * MIN));
  }
  const catalogo = valor(
    await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre: "Agua mineral", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PREPARADO", precioMinor: "100" } }, AHORA - 5 * MIN),
  );
  agua = catalogo.productos.find((p) => p.nombre === "Agua mineral")!.id;
});

after(async () => {
  await Promise.all([local.cerrar(), otro.cerrar()]);
});

describe("dividir por ítems (B3-20)", () => {
  test("partir un agua entre dos y pasar lo de la persona 2 a su cuenta; cada una se cobra con el cobro de siempre", async () => {
    const { c, a2, a3 } = await conTresAguas();
    const partida = valor(await local.app.dividir.partir(marisol, { idempotencyKey: randomUUID(), accountId: c.id, version: c.version, lineId: a3, partes: 2 }, AHORA)).cuenta;
    const partes = partida.lines.filter((l) => l.parteDe?.lineId === a3);
    assert.deepEqual(partes.map((l) => [l.amount.minor, l.concept]), [["50", "Agua mineral (1/2)"], ["50", "Agua mineral (2/2)"]]);
    assert.deepEqual(partida.lines.find((l) => l.id === a3)!.partida, { en: 2 });

    const { cuenta, personas } = valor(await dividir(marisol, partida, [[a2, partes[1]!.id]]));
    assert.equal(personas.length, 1);
    const p2 = personas[0]!;
    assert.equal(p2.kind, "MOSTRADOR");
    assert.deepEqual(p2.divididaDe, { cuentaId: c.id, orderNumber: c.orderNumber, persona: 2 });
    assert.equal(p2.family, "Mesa del fondo · Persona 2");
    assert.equal(p2.status, "POR_COBRAR");
    assert.deepEqual(p2.lines.map((l) => [l.amount.minor, l.vieneDe?.orderNumber]), [["100", c.orderNumber], ["50", c.orderNumber]]);
    assert.deepEqual(cuenta.lines.filter((l) => !l.paid && !l.movedTo && !l.partida).map((l) => l.amount.minor), ["100", "50"]);

    // La persona 2 se cobra sin «Factura a»; la cuenta, como cualquier venta del mostrador.
    assert.equal(valor(await cobrar(p2, "174")).cuenta.status, "COBRADA");
    assert.equal(valor(await cobrar(cuenta, "174", true)).cuenta.status, "COBRADA");
  });

  test("unir de nuevo devuelve lo que no se cobró; lo cobrado se queda cobrado", async () => {
    const { c, a2, a3 } = await conTresAguas();
    const { cuenta, personas } = valor(await dividir(marisol, c, [[a2], [a3]]));
    const [p2, p3] = personas;
    valor(await cobrar(p2!, "116"));
    const unida = valor(await local.app.dividir.unir(marisol, { idempotencyKey: randomUUID(), accountId: cuenta.id }, AHORA + 2 * MIN));
    assert.equal(unida.personas.length, 1);
    assert.equal(unida.personas[0]!.id, p3!.id);
    assert.equal(unida.personas[0]!.status, "COBRADA");
    assert.deepEqual(unida.personas[0]!.juntadaEn, { cuentaId: c.id, orderNumber: c.orderNumber });
    const pendientes = unida.cuenta.lines.filter((l) => !l.paid && !l.movedTo);
    assert.equal(pendientes.length, 2, "a1 y el agua de la persona 3, de vuelta");
    assert.ok(pendientes.every((l) => l.vieneDe === undefined), "vuelve sin el origen de la división");
    const otraVez = await local.app.dividir.unir(marisol, { idempotencyKey: randomUUID(), accountId: cuenta.id }, AHORA + 3 * MIN);
    assert.match(!otraVez.ok ? otraVez.mensaje : "", /No queda nada que unir/);
  });

  test("no se divide: la persona 1 sin nada, un ítem que ya no se debe, una versión vieja o una cuenta en partes iguales", async () => {
    const { c, a1, a2, a3 } = await conTresAguas();
    const vacia = await dividir(marisol, c, [[a1, a2, a3]]);
    assert.equal(!vacia.ok && vacia.problemas?.[0]?.message, "PERSONA_1_VACIA");
    const fantasma = await dividir(marisol, c, [[randomUUID()]]);
    assert.equal(!fantasma.ok && fantasma.problemas?.[0]?.message, "ITEM_QUE_NO_SE_DEBE");
    const vieja = await dividir(marisol, { ...c, version: c.version! + 1 }, [[a1]]);
    assert.match(!vieja.ok ? vieja.mensaje : "", /Otro equipo cambió/);
    const enPartes = valor(await local.app.cuentas.guardar(marisol, { cuenta: { ...c, split: { parts: 2, paid: 0 } } }, AHORA));
    const r = await dividir(marisol, enPartes, [[a1]]);
    assert.match(!r.ok ? r.mensaje : "", /partes iguales/);
  });

  test("reenviar lo mismo no divide otra vez; la cocina no divide; otro local, nada; el asiento queda y sale en vivo", async () => {
    const { c, a2 } = await conTresAguas();
    const clave = randomUUID();
    const primera = valor(await dividir(marisol, c, [[a2]], clave));
    const otraVez = valor(await dividir(marisol, c, [[a2]], clave));
    assert.deepEqual(otraVez, primera);

    const { c: d, a1 } = await conTresAguas();
    const r = await dividir(cocina, d, [[a1]]);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = await local.app.auditoria.listar(local.sistema, { actorId: cocina.quien!.userId! });
    assert.ok(negados.some((x) => x.action === "cuenta.dividir" && x.outcome === "NEGADO"));
    const deOtro = await otro.app.dividir.dividir(otraCajera, { idempotencyKey: randomUUID(), accountId: d.id, version: d.version, personas: [{ lineIds: [a1] }] }, AHORA);
    assert.equal(!deOtro.ok && deOtro.motivo, "NO_DISPONIBLE");

    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: c.id });
    assert.ok(asientos.some((x) => x.action === "cuenta.dividir"));
    for (const t of ["cuenta.partir", "cuenta.dividir", "cuenta.unir"] as const) assert.deepEqual([...temasDe(t)], ["cuentas"]);
  });
});
