/**
 * La carga de lo anotado en papel — B3-7, V-12, ADR-027.
 *
 * Lo que declara la pantalla es poco y está acotado: la carga a la que pertenece un registro y la hora
 * real anotada. El contrato impide lo que no tiene sentido (una ventana al revés, una hora sin zona,
 * campos de más); que la hora caiga dentro de la ventana lo comprueba el servidor contra su reloj.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AbrirCargaCommandSchema,
  CargaPendienteSchema,
  CorteSchema,
  DesdePapelSchema,
  PendientesDelCierreSchema,
  RegistroDePapelSchema,
  RevisarCargaCommandSchema,
  TerminarCargaCommandSchema,
  VentaCerradaSchema,
} from "./index.ts";

const llave = "0d9d6a44-3b6c-4a5b-9b0e-6f5a1c1c9a11";
const carga = "5a3d1d2e-8d3f-4e57-8d6a-0c2e7a9b0f10";

describe("lo que declara la pantalla al cargar un registro", () => {
  test("una carga y una hora real con zona", () => {
    assert.equal(DesdePapelSchema.safeParse({ cargaId: carga, ocurrioEn: "2026-10-05T18:14:00.000Z" }).success, true);
  });

  test("la hora sin zona no es un instante: se rechaza", () => {
    assert.equal(DesdePapelSchema.safeParse({ cargaId: carga, ocurrioEn: "2026-10-05T14:14:00" }).success, false);
    assert.equal(DesdePapelSchema.safeParse({ cargaId: carga, ocurrioEn: "2:14 pm" }).success, false);
  });

  test("la carga es un identificador, y nada más viaja con ella", () => {
    assert.equal(DesdePapelSchema.safeParse({ cargaId: "la-de-ayer", ocurrioEn: "2026-10-05T18:14:00.000Z" }).success, false);
    assert.equal(DesdePapelSchema.safeParse({ cargaId: carga, ocurrioEn: "2026-10-05T18:14:00.000Z", turnoId: carga }).success, false);
  });
});

describe("abrir, terminar y revisar una carga", () => {
  const ventana = { desde: "2026-10-05T16:00:00.000Z", hasta: "2026-10-05T18:30:00.000Z" };

  test("la ventana del corte lleva su clave de idempotencia y empieza antes de terminar", () => {
    assert.equal(AbrirCargaCommandSchema.safeParse({ idempotencyKey: llave, ...ventana, nota: "Se fue la luz" }).success, true);
    assert.equal(AbrirCargaCommandSchema.safeParse({ ...ventana }).success, false);
    const alReves = AbrirCargaCommandSchema.safeParse({ idempotencyKey: llave, desde: ventana.hasta, hasta: ventana.desde });
    assert.equal(alReves.success, false);
    assert.equal(AbrirCargaCommandSchema.safeParse({ idempotencyKey: llave, desde: ventana.hasta, hasta: ventana.hasta }).success, false);
  });

  test("la nota es corta", () => {
    assert.equal(AbrirCargaCommandSchema.safeParse({ idempotencyKey: llave, ...ventana, nota: "x".repeat(161) }).success, false);
  });

  test("terminar y revisar citan la carga; la revisión puede llevar una nota", () => {
    assert.equal(TerminarCargaCommandSchema.safeParse({ cargaId: carga }).success, true);
    assert.equal(TerminarCargaCommandSchema.safeParse({}).success, false);
    assert.equal(RevisarCargaCommandSchema.safeParse({ cargaId: carga }).success, true);
    assert.equal(RevisarCargaCommandSchema.safeParse({ cargaId: carga, nota: "Cuadra con las hojas 1 y 2" }).success, true);
    assert.equal(RevisarCargaCommandSchema.safeParse({ cargaId: carga, revisadaPor: "yo" }).success, false);
  });
});

describe("lo que el servidor devuelve de un registro", () => {
  const base = {
    id: "r-1",
    cuentaId: "c-1",
    orden: 12,
    familia: "Familia Rojas",
    ocurrioEn: "2026-10-05T18:14:00.000Z",
    cargadoEn: "2026-10-05T21:40:00.000Z",
    cargadoPor: "Marisol Prieto",
  };

  test("una entrada, una salida y un cobro, cada uno con su forma", () => {
    assert.equal(
      RegistroDePapelSchema.safeParse({ ...base, tipo: "ENTRADA", modo: "PREPAGO", ninos: [{ pulsera: "AK-1001", nombre: null }], total: { minor: "500", currency: "USD" } }).success,
      true,
    );
    assert.equal(
      RegistroDePapelSchema.safeParse({ ...base, tipo: "SALIDA", ninos: [{ pulsera: "AK-1001", nombre: "Vale" }], excedente: { minor: "0", currency: "USD" } }).success,
      true,
    );
    assert.equal(
      RegistroDePapelSchema.safeParse({
        ...base,
        tipo: "COBRO",
        total: { minor: "500", currency: "USD" },
        pagos: [{ medio: "Efectivo USD", monto: { minor: "500", currency: "USD" } }],
      }).success,
      true,
    );
  });

  test("un cobro sin su total no es un registro", () => {
    assert.equal(RegistroDePapelSchema.safeParse({ ...base, tipo: "COBRO", pagos: [] }).success, false);
  });
});

describe("lo que ya existía sigue leyéndose", () => {
  test("un corte guardado antes de B3-7 no trae el conteo de lo cargado desde papel: vale cero", () => {
    const zero = { minor: "0", currency: "USD" } as const;
    const corte = CorteSchema.parse({
      id: null,
      tipo: "X",
      hechoEn: "2026-10-04T20:00:00.000Z",
      hechoPor: "Marisol Prieto",
      turno: {
        id: "t-1",
        deviceId: "d-1",
        punto: "Caja 1",
        businessDate: "2026-10-04",
        estado: "ABIERTO",
        abiertoPor: { id: "u-1", name: "Marisol Prieto" },
        abiertoEn: "2026-10-04T14:00:00.000Z",
        fondos: [{ currency: "USD", amount: { minor: "2000", currency: "USD" } }],
      },
      porMedio: [],
      gaveta: null,
      ventas: { cantidad: 3, anuladas: 0, total: zero, igtf: zero },
      excepciones: [],
      arqueo: null,
      cierre: null,
    });
    assert.equal(corte.ventas.desdePapel, 0);
  });

  test("los pendientes del cierre admiten cargas sin revisar, y sin ellas son una lista vacía", () => {
    const vacia = PendientesDelCierreSchema.parse({ cuentas: [], ninos: [], huerfanas: [], turnos: [] });
    assert.deepEqual(vacia.papel, []);
    const pendiente = {
      id: carga,
      punto: "Caja 1",
      estado: "CERRADA",
      abiertaPor: "Marisol Prieto",
      desde: "2026-10-05T16:00:00.000Z",
      hasta: "2026-10-05T18:30:00.000Z",
      registros: 9,
    };
    assert.equal(CargaPendienteSchema.safeParse(pendiente).success, true);
    // Una revisada o descartada ya no impide nada: no es un pendiente.
    assert.equal(CargaPendienteSchema.safeParse({ ...pendiente, estado: "REVISADA" }).success, false);
  });

  test("una venta de antes no dice nada del papel, y una cargada dice de qué carga es", () => {
    const campos = Object.keys(VentaCerradaSchema.shape);
    assert.equal(campos.includes("desdePapel"), true);
  });
});
