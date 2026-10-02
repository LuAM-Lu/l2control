/**
 * Pruebas del catálogo de eventos — F1-20.
 *
 * El catálogo es la frontera entre pantallas: lo que no pasa por aquí no
 * llega a ninguna. Se prueba lo que impide: tipos desconocidos, y desde B6-2 los pedidos, que ya
 * no viajan por aquí.
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

  test("una estancia entra sin nombre: la pulsera la identifica (DEC-28)", () => {
    const sinNombre = { ...estancia, session: { ...estancia.session, kid: { id: "k-2" } } };
    assert.equal(OperationEventSchema.safeParse(sinNombre).success, true);
  });

  test("ponerle nombre después es un evento, y no pide motivo (DEC-28)", () => {
    const nombrada = { id: "e-9", at, type: "estancia.nombrada", sessionId: "s-1", name: "Valentina Rojas" };
    assert.equal(OperationEventSchema.safeParse(nombrada).success, true);
    assert.equal(OperationEventSchema.safeParse({ ...nombrada, nickname: "Vale" }).success, true);
    // Una letra no es un nombre: se corrige, no se guarda a medias.
    assert.equal(OperationEventSchema.safeParse({ ...nombrada, name: "V" }).success, false);
  });

  test("un tipo de evento desconocido se rechaza", () => {
    const r = OperationEventSchema.safeParse({ id: "e-2", at, type: "pedido.teletransportado", orderId: "p-1" });
    assert.equal(r.success, false);
  });

  test("los pedidos ya no viajan por el bus: son del servidor (B6-2)", () => {
    const enviado = { id: "e-3", at, type: "pedido.enviado", orderId: "p-1", tableId: "m-3", items: [{ name: "Tequeños", quantity: 1 }] };
    assert.equal(OperationEventSchema.safeParse(enviado).success, false);
    assert.equal(OperationEventSchema.safeParse({ id: "e-4", at, type: "pedido.listo", orderId: "p-1" }).success, false);
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
});
