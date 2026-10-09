/**
 * El cobro en curso guardado en el servidor, contra l2control_test — B3-13, M-34.
 *
 * Guardar y leer (cifrado), la versión que impide que dos cajas se pisen, tomar el de otra persona (con su asiento),
 * vaciarlo y descartarlo; y que no lo vea quien no cobra ni otro local.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Contexto } from "../index.ts";
import { abrirLocalDePrueba, contextoDe, crearCuenta, crearEquipo, crearPersona, type LocalDePrueba } from "../para-pruebas.ts";

const URL_APP = process.env.L2_DB_TEST_APP_URL!;
const AHORA = Date.parse("2026-10-09T14:00:00.000Z");

let local: LocalDePrueba;
let otro: LocalDePrueba;
let marisol: Contexto;
let luis: Contexto;
let mesero: Contexto;
let cuenta: string;

const valor = <T,>(r: { ok: true; valor: T } | { ok: false; mensaje: string }): T => {
  assert.ok(r.ok, JSON.stringify(r));
  return r.valor;
};
const motivo = (r: { ok: boolean; motivo?: string }) => (r.ok ? "OK" : r.motivo);

const PAGO_MOVIL = { kind: "PAGO_MOVIL" as const, reference: "987654321", bankCode: "0134", payerPhone: "0414-5551234" };
const borrador = (pagos: number) => ({
  pagos: Array.from({ length: pagos }, (_, i) =>
    i === 0 ? { medio: "PAGO_MOVIL", amount: { minor: "100000", currency: "VES" }, datos: PAGO_MOVIL } : { medio: "EFECTIVO_USD", amount: { minor: "500", currency: "USD" } },
  ),
  tasa: { id: "0199a0c0-0000-7000-8000-0000000000aa", valor: "874.73" },
  destinoVuelto: "VUELTO" as const,
  cliente: { kind: "CONSUMIDOR_FINAL" as const },
  imprimirRecibo: true,
});

before(async () => {
  local = await abrirLocalDePrueba(URL_APP, "Cobro en curso");
  otro = await abrirLocalDePrueba(URL_APP, "Cobro en curso de otro");
  const a = await crearPersona(local, { nombre: "Marisol Prieto", role: "CAJERO", pin: "7391" });
  const b = await crearPersona(local, { nombre: "Luis Guerrero", role: "SUPERVISOR", pin: "5937" });
  const m = await crearPersona(local, { nombre: "Pedro Díaz", role: "MESERO", pin: "3175" });
  marisol = await contextoDe(local, await crearEquipo(local, "Caja 1"), a, "7391");
  luis = await contextoDe(local, await crearEquipo(local, "Caja 2"), b, "5937");
  mesero = await contextoDe(local, await crearEquipo(local, "Salón"), m, "3175");
  cuenta = await crearCuenta(local, "MOSTRADOR");
});

describe("el cobro en curso (B3-13)", () => {
  test("se guarda cifrado y se lee entero: los datos del pago no quedan en claro en la base", async () => {
    assert.equal(valor(await local.app.borradores.leer(marisol, cuenta)), null);
    const g = valor(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: null, borrador: borrador(1) }, AHORA))!;
    assert.equal(g.version, 1);
    assert.equal(g.por, "Marisol Prieto");
    const l = valor(await local.app.borradores.leer(luis, cuenta))!;
    assert.deepEqual(l.borrador.pagos[0]!.datos, PAGO_MOVIL);
    assert.equal(l.borrador.tasa?.valor, "874.73");
    const fila = await local.base.conTenant(local.sistema.tenantId, (tx) => tx.chargeDraft.findFirst({ where: { accountId: cuenta } }));
    assert.ok(fila && !fila.contentCipher.includes("987654321") && !fila.contentCipher.includes("0414"), "cifrado");
  });

  test("con su versión: quien guarda sobre una versión vieja choca", async () => {
    const g = valor(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: 1, borrador: borrador(2) }, AHORA + 1000))!;
    assert.equal(g.version, 2);
    assert.equal(motivo(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: 1, borrador: borrador(1) }, AHORA + 2000)), "CONFLICTO");
    assert.equal(motivo(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: null, borrador: borrador(1) }, AHORA + 2000)), "CONFLICTO");
  });

  test("tomar el de otra persona queda en la auditoría; el propio, no", async () => {
    const g = valor(await local.app.borradores.guardar(luis, { accountId: cuenta, version: 2, borrador: borrador(2) }, AHORA + 3000))!;
    assert.equal(g.por, "Luis Guerrero");
    valor(await local.app.borradores.guardar(luis, { accountId: cuenta, version: 3, borrador: borrador(2) }, AHORA + 4000));
    const asientos = (await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: cuenta })).filter((x) => x.action === "cobro.retomar");
    assert.equal(asientos.length, 1);
    assert.deepEqual(asientos[0]!.before, { de: "Marisol Prieto", version: 2 });
  });

  test("sin pagos se borra; descartar lo borra con su asiento", async () => {
    assert.equal(valor(await local.app.borradores.guardar(luis, { accountId: cuenta, version: 4, borrador: borrador(0) }, AHORA + 5000)), null);
    assert.equal(valor(await local.app.borradores.leer(marisol, cuenta)), null);
    valor(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: null, borrador: borrador(1) }, AHORA + 6000));
    assert.deepEqual(valor(await local.app.borradores.descartar(luis, { accountId: cuenta }, AHORA + 7000)), { descartado: true });
    assert.deepEqual(valor(await local.app.borradores.descartar(luis, { accountId: cuenta }, AHORA + 7000)), { descartado: false });
    const asientos = (await local.app.auditoria.listar(local.sistema, { entityType: "account", entityId: cuenta })).filter((x) => x.action === "cobro.descartar");
    assert.equal(asientos.length, 1);
  });

  test("quien no cobra no lo ve; otro local, tampoco", async () => {
    valor(await local.app.borradores.guardar(marisol, { accountId: cuenta, version: null, borrador: borrador(1) }, AHORA + 8000));
    assert.equal(motivo(await local.app.borradores.leer(mesero, cuenta)), "NO_PERMITIDO");
    assert.equal(motivo(await local.app.borradores.guardar(mesero, { accountId: cuenta, version: 1, borrador: borrador(1) }, AHORA + 9000)), "NO_PERMITIDO");
    assert.equal(motivo(await otro.app.borradores.guardar(otro.sistema, { accountId: cuenta, version: null, borrador: borrador(1) }, AHORA + 9000)), "NO_DISPONIBLE");
  });
});
