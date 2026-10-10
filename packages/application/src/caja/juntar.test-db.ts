/**
 * Cobrar juntas, contra l2control_test — B3-16 (M-37).
 *
 * Lo que fijan: lo pendiente de las otras pasa a la que queda con de dónde vino, y se cobra una vez; las otras quedan
 * juntadas y fuera de la cola; el reintento no mueve nada otra vez; una versión vieja, una cuenta cerrada o el cobro en
 * curso de otra persona lo niegan; permiso, auditoría, el aviso en vivo y el aislamiento por tenant.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { temasDe } from "../tiempo-real/temas.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, familiaDePrueba, FACTURA_DE_PRUEBA, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T15:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;

let local: LocalDePrueba;
let otro: LocalDePrueba;
let marisol: Contexto;
let luis: Contexto;
let monitora: Contexto;
let cocina: Contexto;
let otraCajera: Contexto;
let agua: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};

/** Una venta del mostrador en la cola, con un agua. */
const enLaCola = async (nombre = "Mostrador") =>
  valor(
    await local.app.cuentas.guardar(
      marisol,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: nombre,
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(AHORA).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [{ id: randomUUID(), concept: "Agua mineral", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: agua, taxCode: "GENERAL" }],
        },
      },
      AHORA,
    ),
  );
/** La cuenta de una familia cuyo niño salió por la caja sin vincular su pulsera: en la cola con su paquete. */
const familiaQueSalio = async () => {
  const f = await familiaDePrueba(local, monitora, AHORA - 30 * MIN);
  const s = await local.app.parque.salir(
    monitora,
    { idempotencyKey: randomUUID(), sessionIds: f.sessionIds, disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } },
    AHORA - MIN,
  );
  return valor(s).account;
};
const juntar = (ctx: Contexto, destino: FamilyAccountDto, otras: FamilyAccountDto[], idempotencyKey = randomUUID()) =>
  local.app.cobrarJuntas.juntar(
    ctx,
    { idempotencyKey, destino: { accountId: destino.id, version: destino.version }, otras: otras.map((o) => ({ accountId: o.id, version: o.version })) },
    AHORA,
  );

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Cobrar juntas");
  otro = await abrirLocalDePrueba(URL_APP, "Cobrar juntas de otro");
  const a = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const b = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const m = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  const k = await crearPersona(local, { nombre: "Rosa Mata", role: "COCINA", pin: "8462" });
  marisol = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "7391");
  luis = await contextoDe(local, await crearEquipo(local, "Caja 2"), b, "5937");
  monitora = await contextoDe(local, await crearEquipo(local, "Entrada"), m, "6284");
  cocina = await contextoDe(local, await crearEquipo(local, "Cocina"), k, "8462");
  const c = await crearPersona(otro, { nombre: "Jesús Mendoza", role: "CAJERO", pin: "7391" });
  otraCajera = await contextoDe(otro, await crearEquipo(otro, "Caja 1"), c, "7391");

  const FONDO = { fondos: [{ currency: "USD", amount: usd("0") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await local.app.turnos.abrir(marisol, FONDO, undefined, AHORA - 2 * MIN));
  valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "855.6625", effectiveDate: HOY, valorVerificado: "855.6625" }, AHORA - 10 * MIN));
  // El IGTF, al 0 % como en el local (V-13): el cobro en dólares no lo suma.
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

describe("cobrar juntas (B3-16)", () => {
  test("lo pendiente de la familia pasa al mostrador con de dónde vino; se cobra una vez y la familia queda juntada", async () => {
    const venta = await enLaCola();
    const familia = await familiaQueSalio();
    assert.equal(familia.status, "POR_COBRAR");
    const { destino, otras } = valor(await juntar(marisol, venta, [familia]));

    assert.equal(destino.id, venta.id);
    const juntada = destino.lines.find((l) => l.vieneDe);
    assert.equal(juntada?.vieneDe?.orderNumber, familia.orderNumber);
    assert.equal(juntada?.vieneDe?.kind, "FAMILIA");
    assert.equal(juntada?.kind, "PAQUETE");
    assert.equal(destino.status, "POR_COBRAR");
    assert.equal(destino.pendingSince, familia.pendingSince, "espera desde la que más llevaba");
    assert.equal(otras[0]!.status, "COBRADA");
    assert.deepEqual(otras[0]!.juntadaEn, { cuentaId: venta.id, orderNumber: venta.orderNumber });
    assert.ok(otras[0]!.lines.every((l) => l.paid || l.movedTo === venta.id));
    const causas = await local.base.conTenant(local.sistema.tenantId, (tx) =>
      tx.accountVersion.findMany({ where: { accountId: { in: [venta.id, familia.id] }, cause: "JUNTAR" }, select: { accountId: true } }),
    );
    assert.equal(causas.length, 2);

    // Un solo cobro, con todo: el agua y el paquete de 1 hora, con su IVA ($ 1,16 + $ 11,60).
    const total = valor(await local.app.cuentas.cobrar(
      marisol,
      {
        idempotencyKey: randomUUID(),
        accountId: destino.id,
        version: destino.version,
        lineIds: destino.lines.filter((l) => !l.paid && !l.movedTo).map((l) => l.id),
        total: usd("1276"),
        pagos: [{ method: "EFECTIVO_USD", amount: usd("1276") }],
        destinoSobra: "VUELTO",
        cliente: FACTURA_DE_PRUEBA,
      },
      AHORA + MIN,
    ));
    assert.equal(total.cuenta.status, "COBRADA");
  });

  test("reenviar lo mismo (se cortó la red) no mueve nada otra vez", async () => {
    const a = await enLaCola();
    const b = await enLaCola("Otra venta");
    const clave = randomUUID();
    const primera = valor(await juntar(marisol, a, [b], clave));
    const otraVez = valor(await juntar(marisol, a, [b], clave));
    assert.deepEqual(otraVez, primera);
    assert.equal(primera.destino.lines.length, 2);
  });

  test("una versión vieja, una cuenta ya cerrada o el cobro en curso de otra persona lo niegan", async () => {
    const a = await enLaCola();
    const b = await enLaCola();
    const vieja = await juntar(marisol, { ...a, version: a.version! + 1 }, [b]);
    assert.equal(!vieja.ok && vieja.motivo, "CONFLICTO");
    assert.match(!vieja.ok ? vieja.mensaje : "", /Otro equipo cambió #\d{4}/);

    const ya = valor(await juntar(marisol, a, [b]));
    const cerrada = await juntar(marisol, await enLaCola(), [ya.otras[0]!]);
    assert.equal(!cerrada.ok && cerrada.problemas?.[0]?.message, "CERRADA");

    const c = await enLaCola();
    const d = await enLaCola();
    valor(
      await local.app.borradores.guardar(
        luis,
        { accountId: d.id, version: null, borrador: { pagos: [{ medio: "EFECTIVO_USD", amount: usd("100") }], tasa: null, destinoVuelto: "VUELTO", cliente: { kind: "CONSUMIDOR_FINAL" }, imprimirRecibo: true } },
        AHORA,
      ),
    );
    const enCurso = await juntar(marisol, c, [d]);
    assert.equal(!enCurso.ok && enCurso.motivo, "CONFLICTO");
    assert.match(!enCurso.ok ? enCurso.mensaje : "", /Luis Guerrero está cobrando/);
  });

  test("la cocina no junta y queda en la auditoría; el asiento queda y sale en vivo; otro local, nada", async () => {
    const a = await enLaCola();
    const b = await enLaCola();
    const r = await juntar(cocina, a, [b]);
    assert.equal(!r.ok && r.motivo, "NO_PERMITIDO");
    const negados = await local.app.auditoria.listar(local.sistema, { actorId: cocina.quien!.userId! });
    assert.ok(negados.some((x) => x.action === "cuenta.juntar" && x.outcome === "NEGADO"));

    const deOtro = await otro.app.cobrarJuntas.juntar(
      otraCajera,
      { idempotencyKey: randomUUID(), destino: { accountId: a.id, version: a.version }, otras: [{ accountId: b.id, version: b.version }] },
      AHORA,
    );
    assert.equal(!deOtro.ok && deOtro.motivo, "NO_DISPONIBLE");

    valor(await juntar(marisol, a, [b]));
    const asientos = await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: a.id });
    assert.ok(asientos.some((x) => x.action === "cuenta.juntar"));
    assert.deepEqual([...temasDe("cuenta.juntar")], ["cuentas"]);
  });
});
