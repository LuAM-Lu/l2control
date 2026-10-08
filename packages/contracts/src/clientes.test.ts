import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AbrirCuentaDelSalonCommandSchema } from "./restaurante.ts";
import { AsignarClienteCommandSchema, BuscarClienteSchema, DatosDelClienteSchema } from "./clientes.ts";

const UUID = "0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b";
const cliente = { nombre: "Prueba Cliente", cedula: "V-12345678", telefono: "0414-1234567" };

describe("el cliente de la cuenta (B6-9, M-33)", () => {
  test("los tres datos son obligatorios y cada uno con su forma", () => {
    assert.equal(DatosDelClienteSchema.safeParse(cliente).success, true);
    assert.equal(DatosDelClienteSchema.safeParse({ ...cliente, telefono: "04141234567" }).success, true);
    for (const falta of ["nombre", "cedula", "telefono"] as const) {
      const { [falta]: _, ...resto } = cliente;
      assert.equal(DatosDelClienteSchema.safeParse(resto).success, false, falta);
    }
    assert.equal(DatosDelClienteSchema.safeParse({ ...cliente, nombre: "P" }).success, false);
    assert.equal(DatosDelClienteSchema.safeParse({ ...cliente, cedula: "12345678" }).success, false);
    assert.equal(DatosDelClienteSchema.safeParse({ ...cliente, telefono: "1234567" }).success, false);
    // Nada más que los tres: ni dirección ni foto.
    assert.equal(DatosDelClienteSchema.safeParse({ ...cliente, direccion: "Calle 1" }).success, false);
  });

  test("sentar a alguien sin sus datos no se puede expresar", () => {
    const sentar = { cuentaId: UUID, tableId: UUID, comensales: 2, vistas: 0 };
    assert.equal(AbrirCuentaDelSalonCommandSchema.safeParse(sentar).success, false);
    assert.equal(AbrirCuentaDelSalonCommandSchema.safeParse({ ...sentar, cliente }).success, true);
    // De pie, igual: sin mesa, con su cliente.
    const { tableId: _, ...dePie } = sentar;
    assert.equal(AbrirCuentaDelSalonCommandSchema.safeParse({ ...dePie, cliente }).success, true);
  });

  test("se busca por la cédula o el teléfono, y se asigna con los tres", () => {
    assert.equal(BuscarClienteSchema.safeParse({}).success, false);
    assert.equal(BuscarClienteSchema.safeParse({ cedula: "V-12345678" }).success, true);
    assert.equal(BuscarClienteSchema.safeParse({ telefono: "0414-1234567" }).success, true);
    assert.equal(AsignarClienteCommandSchema.safeParse({ idempotencyKey: UUID, accountId: UUID, cliente }).success, true);
    assert.equal(AsignarClienteCommandSchema.safeParse({ idempotencyKey: UUID, accountId: UUID, cliente: { nombre: "Prueba" } }).success, false);
  });
});
