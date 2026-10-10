/**
 * El consumo del personal, contra l2control_test — B3-17 (M-37).
 *
 * Lo que fijan: lo firma con su PIN quien consumió (del local, no la cuenta de soporte); a precio normal, sale del
 * inventario y no entra dinero (la gaveta no cambia); es el único pago de su cobro y por el total; queda su vale y se
 * imprime para su firma; los vales de la quincena los ven supervisión y administración, y cada persona los suyos con su
 * PIN; un vale anulado no cuenta; reimprimir sale como copia; y el corte lo lista fuera de la gaveta.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { FamilyAccountDto } from "@l2/contracts";
import type { Contexto } from "../index.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { abrirLocalDePrueba, contextoDe, crearEquipo, crearPersona, impresoraDePrueba, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-10T17:00:00.000Z");
const HOY = "2026-10-10";
const MIN = 60_000;
const QUINCENA = { desde: "2026-10-01", hasta: HOY };

let local: LocalDePrueba;
let cajera: Contexto;
let supervisora: Contexto;
let marisol: string;
let pedro: string;
let admin: string;
let soporte: string;
let refresco: string;
let turno: string;

const usd = (minor: string) => ({ minor, currency: "USD" as const });
const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
/** Dos refrescos en la cola: $ 2,00 + IVA = $ 2,32. */
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
const consumo = (c: FamilyAccountDto, personal: { staffUserId: string; pin: string }, extra: Record<string, unknown> = {}) => ({
  idempotencyKey: randomUUID(),
  accountId: c.id,
  version: c.version,
  lineIds: c.lines.map((l) => l.id),
  total: usd("232"),
  pagos: [{ method: "CONSUMO_PERSONAL", amount: usd("232") }],
  destinoSobra: "VUELTO",
  personal,
  ...extra,
});
const existencia = async () => (await local.app.productos.leer(local.sistema)).productos.find((p) => p.id === refresco)!.existencia;
const gaveta = () => local.base.conTenant(local.sistema.tenantId, (tx) => esperadoEnGaveta(tx, turno));
const vales = () => local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffConsumption.findMany({ orderBy: { at: "asc" } }));
const papelesDe = (saleId: string) =>
  local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findMany({ where: { saleId }, orderBy: { createdAt: "asc" }, select: { title: true, copy: true, content: true } }));
const textoDe = (content: unknown) => JSON.stringify(content);

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "El consumo del personal");
  await impresoraDePrueba(local);
  marisol = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  pedro = await crearPersona(local, { nombre: "Pedro Salas", role: "MESERO", pin: "5173" });
  const luisa = await crearPersona(local, { nombre: "Luisa Mora", role: "SUPERVISOR", pin: "5937" });
  admin = await crearPersona(local, { nombre: "Abigail Karam", role: "ADMIN", pin: "4826" });
  soporte = await crearPersona(local, { nombre: "Soporte Técnico", role: "ADMIN", pin: "3141" });
  await local.base.conTenant(local.sistema.tenantId, (tx) => tx.staffUser.update({ where: { id: soporte }, data: { supportLogin: "soporte-prueba" } }));
  cajera = await contextoDe(local, await crearEquipo(local, "Caja 1"), marisol, "7391");
  supervisora = await contextoDe(local, await crearEquipo(local, "Oficina"), luisa, "5937");
  const FONDO = { fondos: [{ currency: "USD", amount: usd("5000") }, { currency: "VES", amount: { minor: "0", currency: "VES" } }] };
  turno = valor(await local.app.turnos.abrir(cajera, FONDO, undefined, AHORA - 30 * MIN)).id;
  for (const cmd of [
    { impuesto: "IVA", code: "GENERAL", basisPoints: 1600, dia: HOY },
    { impuesto: "IGTF", code: null, basisPoints: 0, dia: HOY },
  ]) {
    valor(await local.app.impuestos.programar(local.sistema, cmd, AHORA - 20 * MIN));
  }
  const cat = valor(await local.app.productos.aplicar(local.sistema, { kind: "CREAR", producto: { nombre: "Refresco", categoria: "Bebidas", taxCode: "GENERAL", tipo: "PRODUCTO", precioMinor: "100", area: "SIN_PAPEL" } }, AHORA - 10 * MIN));
  refresco = cat.productos.find((p) => p.nombre === "Refresco")!.id;
  valor(await local.app.entradas.registrar(local.sistema, { idempotencyKey: randomUUID(), tipo: "COMPRA", lineas: [{ productId: refresco, bultos: 1, unidadesPorBulto: 24, costo: { por: "BULTO", minor: "1200" } }] }, AHORA - 5 * MIN));
});

after(async () => {
  await local.cerrar();
});

describe("el consumo del personal (B3-17)", () => {
  test("lo firma con su PIN quien consumió: sale del inventario, no entra dinero y queda su vale impreso", async () => {
    const [antes, enGaveta] = [await existencia(), await gaveta()];
    const r = valor(await local.app.cuentas.cobrar(cajera, consumo(await dosRefrescos(), { staffUserId: pedro, pin: "5173" }), AHORA));
    assert.equal(r.cuenta.status, "COBRADA");
    assert.deepEqual(r.venta.personal, { id: pedro, nombre: "Pedro Salas" });
    assert.equal(r.valeNoImpreso, undefined);
    assert.equal(await existencia(), antes! - 2, "a precio normal, sale del estante");
    assert.deepEqual(await gaveta(), enGaveta, "no entra dinero: la gaveta no cambia");
    const [vale] = await vales();
    assert.equal(vale!.staffName, "Pedro Salas");
    assert.equal(vale!.totalMinor, 232n);
    assert.equal(vale!.createdByName, "Marisol Prieto");
    const papeles = await papelesDe(r.venta.id);
    assert.equal(papeles.length, 1, "el vale, no el recibo");
    assert.match(papeles[0]!.title, /^Vale #\d{4} · Pedro Salas$/);
    assert.match(textoDe(papeles[0]!.content), /VALE DE CONSUMO/);
    assert.match(textoDe(papeles[0]!.content), /Firma/);
    assert.equal(papeles[0]!.copy, false);
  });

  test("con un PIN malo, la cuenta de soporte o alguien que no es del equipo, no se cobra", async () => {
    const c = await dosRefrescos();
    const malo = await local.app.cuentas.cobrar(cajera, consumo(c, { staffUserId: pedro, pin: "0000" }), AHORA);
    assert.equal(!malo.ok && malo.motivo, "NO_PERMITIDO");
    assert.match(!malo.ok ? malo.mensaje : "", /PIN incorrecto/);
    const deSoporte = await local.app.cuentas.cobrar(cajera, consumo(c, { staffUserId: soporte, pin: "3141" }), AHORA);
    assert.equal(!deSoporte.ok && deSoporte.motivo, "NO_PERMITIDO", "la cuenta de soporte no es del equipo del local");
    const nadie = await local.app.cuentas.cobrar(cajera, consumo(c, { staffUserId: randomUUID(), pin: "1234" }), AHORA);
    assert.equal(!nadie.ok && nadie.motivo, "NO_PERMITIDO");
    const sigue = valor(await local.app.cuentas.leer(cajera)).cuentas.find((x) => x.id === c.id)!;
    assert.equal(sigue.status, "POR_COBRAR", "sigue en la cola, sin asientos");
    const asientos = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.payment.count({ where: { documentId: c.id } }));
    assert.equal(asientos, 0);
  });

  test("es el único pago y por el total: ni mezclado, ni de más, ni sin la firma", async () => {
    const c = await dosRefrescos();
    const firma = { staffUserId: pedro, pin: "5173" };
    const mezclado = await local.app.cuentas.cobrar(cajera, consumo(c, firma, { pagos: [{ method: "CONSUMO_PERSONAL", amount: usd("200") }, { method: "EFECTIVO_USD", amount: usd("32") }] }), AHORA);
    assert.equal(!mezclado.ok && mezclado.motivo, "INVALIDO");
    const deMas = await local.app.cuentas.cobrar(cajera, consumo(c, firma, { pagos: [{ method: "CONSUMO_PERSONAL", amount: usd("300") }] }), AHORA);
    assert.equal(!deMas.ok && deMas.motivo, "INVALIDO");
    assert.equal(!deMas.ok && deMas.problemas?.[0]?.message, "CONSUMO_NO_ES_EL_TOTAL");
    const { personal: _sinFirma, ...sinFirma } = consumo(c, firma);
    const r = await local.app.cuentas.cobrar(cajera, sinFirma, AHORA);
    assert.equal(!r.ok && r.motivo, "INVALIDO", "el medio sin la firma de quien consumió");
  });

  test("los vales de la quincena: supervisión ve los de todos; cada persona, los suyos con su PIN", async () => {
    valor(await local.app.cuentas.cobrar(cajera, consumo(await dosRefrescos(), { staffUserId: marisol, pin: "7391" }), AHORA + MIN));
    const todos = valor(await local.app.personal.vales(supervisora, QUINCENA, AHORA + 2 * MIN));
    assert.equal(todos.alcance, "TODOS");
    assert.deepEqual(
      todos.porPersona.map((p) => [p.persona.nombre, p.vales, p.neto.minor]),
      [
        ["Marisol Prieto", 1, "232"],
        ["Pedro Salas", 1, "232"],
      ],
    );
    assert.equal(todos.total.minor, "464");
    assert.equal(todos.vales[0]!.lineas.length, 2);
    const sinPin = await local.app.personal.vales(cajera, QUINCENA, AHORA + 2 * MIN);
    assert.equal(!sinPin.ok && sinPin.motivo, "NO_PERMITIDO", "la cajera no ve los de todos");
    const suyos = valor(await local.app.personal.vales(cajera, { ...QUINCENA, persona: { staffUserId: pedro, pin: "5173" } }, AHORA + 2 * MIN));
    assert.equal(suyos.alcance, "PERSONA");
    assert.deepEqual(suyos.vales.map((v) => v.persona.nombre), ["Pedro Salas"]);
    const ajeno = await local.app.personal.vales(cajera, { ...QUINCENA, persona: { staffUserId: pedro, pin: "7391" } }, AHORA + 2 * MIN);
    assert.equal(!ajeno.ok && ajeno.motivo, "NO_PERMITIDO", "con el PIN de otra persona, no");
    const otraQuincena = valor(await local.app.personal.vales(supervisora, { desde: "2026-09-16", hasta: "2026-09-30" }, AHORA + 2 * MIN));
    assert.equal(otraQuincena.vales.length, 0);
  });

  test("un vale anulado no cuenta; reimprimir sale como copia", async () => {
    const c = await dosRefrescos();
    const cmd = consumo(c, { staffUserId: pedro, pin: "5173" });
    valor(await local.app.cuentas.cobrar(cajera, cmd, AHORA + 3 * MIN));
    valor(
      await local.app.cuentas.anular(
        cajera,
        { idempotencyKey: randomUUID(), accountId: c.id, cobroKey: cmd.idempotencyKey, motivo: "ERROR_EN_COBRO", devoluciones: [{ paymentIndex: 0, via: "MISMO_MEDIO" }], camino: "ANULAR_VENTA", inventario: "ESTANTE" },
        { autorizadorId: admin, pin: "4826", motivo: "No era suyo" },
        AHORA + 4 * MIN,
      ),
    );
    const i = valor(await local.app.personal.vales(supervisora, QUINCENA, AHORA + 5 * MIN));
    const anulado = i.vales.find((v) => v.anulado)!;
    assert.equal(anulado.neto.minor, "0");
    assert.deepEqual(
      i.porPersona.find((p) => p.persona.id === pedro)!,
      { persona: { id: pedro, nombre: "Pedro Salas" }, vales: 1, neto: usd("232") },
      "el anulado no suma",
    );
    const copia = valor(await local.app.personal.reimprimir(cajera, { valeId: i.vales[0]!.id }, AHORA + 6 * MIN));
    const papeles = await papelesDe(copia.saleId);
    assert.equal(papeles.at(-1)!.copy, true);
    assert.match(textoDe(papeles.at(-1)!.content), /\*\*\* COPIA \*\*\*/);
  });

  test("el corte lo lista fuera de la gaveta: está en las ventas, no en el dinero", async () => {
    const x = valor(await local.app.cortes.corteX(cajera, {}, AHORA + 7 * MIN));
    const medio = x.porMedio.find((m) => m.methodCode === "CONSUMO_PERSONAL")!;
    assert.equal(medio.enGaveta, false);
    assert.equal(medio.neto.minor, "464", "los dos que quedaron; el anulado volvió");
    const trabajo = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.printJob.findFirst({ where: { kind: "CORTE" }, orderBy: { createdAt: "desc" }, select: { content: true } }));
    if (trabajo) assert.match(textoDe(trabajo.content), /Consumo del personal/);
  });

  test("la caja no lo ofrece entre los medios del cobro mixto, y apagado no se cobra", async () => {
    const personas = valor(await local.app.personal.personas(cajera));
    assert.deepEqual(personas.map((p) => p.nombre), ["Abigail Karam", "Luisa Mora", "Marisol Prieto", "Pedro Salas"], "sin la cuenta de soporte");
    valor(await local.app.medios.aplicar(local.sistema, { kind: "ACTIVAR", code: "CONSUMO_PERSONAL", activo: false }));
    const r = await local.app.cuentas.cobrar(cajera, consumo(await dosRefrescos(), { staffUserId: pedro, pin: "5173" }), AHORA + 8 * MIN);
    assert.equal(!r.ok && r.motivo, "INVALIDO");
    valor(await local.app.medios.aplicar(local.sistema, { kind: "ACTIVAR", code: "CONSUMO_PERSONAL", activo: true }));
  });
});
