/**
 * Pruebas del catálogo de eventos — F1-20.
 *
 * El catálogo es la frontera entre pantallas: lo que no pasa por aquí no
 * llega a ninguna. Se prueba lo que impide: tipos desconocidos, pedidos sin
 * platos, anulaciones sin motivo ni autorizador.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { OperationEventSchema } from "./eventos.ts";

const at = "2026-09-12T18:05:00.000Z";

const estancia = {
  id: "e-1",
  at,
  type: "estancia.abierta",
  family: "Ana Rojas",
  session: {
    id: "s-1",
    wristbandCode: "AK-1001",
    kid: { id: "k-1", name: "Valentina Rojas", nickname: "Vale" },
    mode: "PREPAGO",
    duration: { kind: "fixed", minutes: 60 },
    startedAt: at,
    packageId: "pkg-60",
    packagePrice: { minor: "500", currency: "USD" },
  },
} as const;

describe("catálogo de eventos (F1-20)", () => {
  test("una estancia abierta con su representante es válida", () => {
    assert.equal(OperationEventSchema.safeParse(estancia).success, true);
  });

  test("un tipo de evento desconocido se rechaza", () => {
    const r = OperationEventSchema.safeParse({ id: "e-2", at, type: "pedido.teletransportado", orderId: "p-1" });
    assert.equal(r.success, false);
  });

  test("un pedido sin platos no se envía", () => {
    const r = OperationEventSchema.safeParse({
      id: "e-3",
      at,
      type: "pedido.enviado",
      orderId: "p-1",
      tableId: "m-3",
      items: [],
    });
    assert.equal(r.success, false);
  });

  test("anular exige motivo y quién lo autorizó", () => {
    const sinMotivo = { id: "e-4", at, type: "pedido.anulado", orderId: "p-1", authorizedBy: "Luis Guerrero" };
    assert.equal(OperationEventSchema.safeParse(sinMotivo).success, false);
    const completo = { ...sinMotivo, reason: "Plato equivocado" };
    assert.equal(OperationEventSchema.safeParse(completo).success, true);
  });

  test("vincular una mesa exige al menos una estancia", () => {
    const r = OperationEventSchema.safeParse({
      id: "e-5",
      at,
      type: "mesa.vinculada",
      tableId: "m-3",
      sessionIds: [],
    });
    assert.equal(r.success, false);
  });

  test("un evento sin instante no es un evento", () => {
    const { at: _at, ...sinInstante } = estancia;
    assert.equal(OperationEventSchema.safeParse(sinInstante).success, false);
  });
  test("confirmar que se vio una anulación exige decir quién (F6-08)", () => {
    const vista = { id: "e-9", at, type: "pedido.anulacion_vista", orderId: "p-1" };
    assert.equal(OperationEventSchema.safeParse(vista).success, false);
    assert.equal(OperationEventSchema.safeParse({ ...vista, by: "Diego Salas" }).success, true);
  });
});
