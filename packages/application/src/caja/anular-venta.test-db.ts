/**
 * Anular y devolver, de administración — B3-18 (M-37, U-10, U-11), contra l2control_test.
 *
 * Lo que fijan: «Anular la venta entera» devuelve el dinero, cierra la cuenta con su motivo (sus líneas anuladas, nada
 * se borra) y lo que tiene inventario vuelve al estante, o sale como merma; no se anula así una familia con niños en la
 * sala; y «lo que no usó» un niño que pagó por adelantado vuelve en la caja: lo pagado menos lo que vale su tiempo
 * real con la regla de B4-17, con su IVA, después de su salida.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto, VentaCerradaDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, FACTURA_DE_PRUEBA, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T19:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;

let local: LocalDePrueba;
let cajera: Contexto;
let monitora: Contexto;
let admin: string;
let refresco: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const pinDeAdmin = () => ({ autorizadorId: admin, pin: "4826", motivo: "Cobro equivocado" });
const existencia = async () => (await local.app.productos.leer(local.sistema)).productos.find((p) => p.id === refresco)!.existencia;

async function cobrar(c: FamilyAccountDto, total: string): Promise<{ cuenta: FamilyAccountDto; venta: VentaCerradaDto; clave: string }> {
  const clave = randomUUID();
  const r = valor(
    await local.app.cuentas.cobrar(
      cajera,
      { idempotencyKey: clave, accountId: c.id, version: c.version, lineIds: c.lines.filter((l) => !l.paid && !l.movedTo).map((l) => l.id), total: usd(total), pagos: [{ method: "EFECTIVO_USD", amount: usd(total) }], destinoSobra: "VUELTO", cliente: FACTURA_DE_PRUEBA },
      AHORA,
    ),
  );
  return { cuenta: r.cuenta, venta: r.venta, clave };
}
const dosRefrescos = async () =>
  valor(
    await local.app.cuentas.guardar(
      cajera,
      {
        cuenta: {
          id: randomUUID(),
          kind: "MOSTRADOR",
          family: "Mostrador",
          mode: "PREPAGO",
          status: "POR_COBRAR",
          openedAt: new Date(AHORA).toISOString(),
          sessionIds: [],
          closedSessionIds: [],
          lines: [1, 2].map(() => ({ id: randomUUID(), concept: "Refresco", kind: "RESTAURANTE", amount: usd("100"), paid: false, productId: refresco, taxCode: "GENERAL" })),
        },
      },
      AHORA,
    ),
  );
const anularEntera = (c: FamilyAccountDto, clave: string, inventario: "ESTANTE" | "MERMA") =>
  local.app.cuentas.anular(
    cajera,
    { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }], camino: "ANULAR_VENTA", inventario },
    pinDeAdmin(),
    AHORA + MIN,
  );

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Anular la venta");
  await impresoraDePrueba(local);
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  const c = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const m = await crearPersona(local, { nombre: "Ana Rojas", role: "MONITOR_PARQUE", pin: "6284" });
  cajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), c, "7391");
  monitora = await contextoDe(local, await crearEquipo(local, "Entrada"), m, "6284");
  const FONDO = { fondos: [{ currency: "USD", amount: usd("5000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  valor(await local.app.turnos.abrir(cajera, FONDO, undefined, AHORA - 30 * MIN));
  valor(await local.app.tasas.capturar(local.sistema, { pair: "USD/VES", source: "BCV", value: "190.5", effectiveDate: HOY, valorVerificado: "190.5" }, AHORA - 20 * MIN));
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 20 * MIN));
  }
  const cat = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre: "Refresco", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "100", area: "SIN_PAPEL" } }, AHORA - 10 * MIN));
  refresco = cat.productos.find((p) => p.nombre === "Refresco")!.id;
  valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId: refresco, bultos: 1, unidadesPorBulto: 24, costo: { por: "BULTO", minor: "1200" } }] }, AHORA - 5 * MIN));
  // La tarifa del parque: 30 minutos $ 3, 1 hora $ 5, 5 de gracia.
  valor(
    await local.app.tarifario.publicar(local.sistema, {
      packages: [
        { id: "p30", name: "30 minutos", mode: "PREPAGO", duration: { kind: "fixed", minutes: 30 }, price: usd("300"), active: true },
        { id: "p60", name: "1 hora", mode: "PREPAGO", duration: { kind: "fixed", minutes: 60 }, price: usd("500"), active: true },
      ],
      policy: { graceMinutes: 5, penaltyBlockMinutes: 15, penaltyPricePerBlock: usd("150"), warnBeforeMinutes: 10, capacityLimit: 30 },
    }),
  );
});

after(async () => {
  await local.cerrar();
});

describe("anular la venta entera (B3-18)", () => {
  test("el dinero vuelve, la cuenta se cierra con su motivo y lo que tiene inventario vuelve al estante", async () => {
    const antes = await existencia();
    const { cuenta, clave } = await cobrar(await dosRefrescos(), "232");
    assert.equal(await existencia(), antes! - 2);
    const r = valor(await anularEntera(cuenta, clave, "ESTANTE"));
    assert.equal(r.cuenta.status, "SIN_CONSUMO", "sale de la cola, cerrada");
    assert.ok(r.cuenta.lines.every((l) => l.anulacion && !l.paid), "sus líneas, anuladas con su motivo; nada se borra");
    assert.match(String((r.cuenta.lines[0]!.anulacion as { detalle?: string }).detalle), /Venta anulada: error en el cobro/);
    assert.deepEqual(r.libro.aplicado, usd("0"));
    assert.equal(await existencia(), antes, "al estante");
  });

  test("a merma: lo anulado no vuelve a venderse, sale como pérdida", async () => {
    const antes = await existencia();
    const { cuenta, clave } = await cobrar(await dosRefrescos(), "232");
    valor(await anularEntera(cuenta, clave, "MERMA"));
    assert.equal(await existencia(), antes! - 2);
    const merma = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.stockAdjustment.findFirst({ where: { reason: "MERMA" }, orderBy: { at: "desc" } }));
    assert.match(merma?.note ?? "", /Venta anulada/);
  });

  test("no con el PIN de supervisión; ni una familia con niños en la sala", async () => {
    const sup = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
    const { cuenta, clave } = await cobrar(await dosRefrescos(), "232");
    const deSupervision = await local.app.cuentas.anular(
      cajera,
      { idempotencyKey: randomUUID(), accountId: cuenta.id, cobroKey: clave, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }], camino: "ANULAR_VENTA" },
      { autorizadorId: sup, pin: "5937", motivo: "Yo" },
      AHORA + MIN,
    );
    assert.equal(!deSupervision.ok && deSupervision.motivo, "NO_PERMITIDO");

    const entrada = valor(
      await local.app.parque.entrar(
        monitora,
        { idempotencyKey: randomUUID(), paymentMode: "PREPAGO", entries: [{ wristbandCode: "B318-SALA", kid: {}, packageId: "p60" }], guardian: { fullName: "Familia Prueba", contactReference: "0412-3180001" }, guardianDocument: "V-31800001" },
        AHORA,
      ),
    ).account;
    const pagada = await cobrar(entrada, "580");
    const enSala = await anularEntera(pagada.cuenta, pagada.clave, "ESTANTE");
    assert.match(!enSala.ok ? enSala.mensaje : "", /siguen en la sala/);
  });
});

describe("devolver lo que un niño no usó (B3-18, M-37 U-11)", () => {
  test("pagó 1 hora ($ 5) y estuvo 5 minutos (vale 30 minutos, $ 3): vuelven $ 2 con su IVA, después de su salida", async () => {
    const entrada = valor(
      await local.app.parque.entrar(
        monitora,
        { idempotencyKey: randomUUID(), paymentMode: "PREPAGO", entries: [{ wristbandCode: "B318-USO", kid: {}, packageId: "p60" }], guardian: { fullName: "Familia Uso", contactReference: "0412-3180002" }, guardianDocument: "V-31800002" },
        AHORA,
      ),
    ).account;
    const { venta } = await cobrar(entrada, "580");
    const paquete = venta.lineas[0]!;
    const devolver = (lineas: unknown[], monto: string, ahora: number) =>
      local.app.devoluciones.devolver(cajera, { idempotencyKey: randomUUID(), saleId: venta.id, lineas, reintegros: [{ paymentIndex: 0, amount: usd(monto) }], motivo: "Se tuvo que ir" }, pinDeAdmin(), ahora);

    const antes = await devolver([{ lineId: paquete.lineId, destino: "ESTANTE", noUsado: true }], "232", AHORA + 3 * MIN);
    assert.equal(!antes.ok && antes.problemas?.[0]?.message, "NINO_EN_SALA");

    valor(
      await local.app.parque.salir(
        monitora,
        { idempotencyKey: randomUUID(), sessionIds: entrada.sessionIds, disposition: { kind: "CAJA" }, recogida: { kind: "REPRESENTANTE" } },
        AHORA + 5 * MIN,
      ),
    );
    const hecha = valor(await devolver([{ lineId: paquete.lineId, destino: "ESTANTE", noUsado: true }], "232", AHORA + 6 * MIN));
    const d = hecha.venta.devoluciones[0]!;
    assert.deepEqual([d.total, d.lineas[0]!.amount], [usd("232"), usd("200")]);
    assert.match(d.lineas[0]!.concept, /lo que no usó/);
    assert.equal(d.autorizo, "Abigail Karam");
  });
});
