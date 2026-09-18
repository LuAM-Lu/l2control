/**
 * Pruebas de la configuración de medios de pago — F4-02, F4-04.
 *
 * Se prueba lo que impide: quedarse sin ningún medio, ofrecer Pago Móvil sin
 * decir a qué teléfono, dejar el punto de venta encendido sin terminales, y
 * borrar un medio que los pagos de ayer nombran.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MedioCommandSchema,
  MedioDePagoSchema,
  MediosDePagoSchema,
} from "./medios.ts";

const efectivo = {
  code: "EFECTIVO_USD",
  label: "Efectivo $",
  currency: "USD",
  triggersIgtf: true,
  canGiveChange: true,
  activo: true,
} as const;

const pagoMovil = {
  code: "PAGO_MOVIL",
  label: "Pago Móvil",
  currency: "VES",
  triggersIgtf: false,
  canGiveChange: false,
  datos: "PAGO_MOVIL",
  activo: true,
} as const;

const punto = {
  code: "PDV_DEBITO",
  label: "Punto débito",
  currency: "VES",
  triggersIgtf: false,
  canGiveChange: false,
  datos: "PUNTO",
  activo: true,
} as const;

const datosPagoMovil = { bankCode: "0134", phone: "0414-2345678", document: "J-40123456-7" };
const datosZelle = { holder: "Parque Infantil L2 C.A.", email: "pagos@parquel2.com" };

const config = {
  medios: [efectivo, pagoMovil],
  terminales: [{ id: "pdv-banesco", name: "Punto Banesco", bank: "Banesco" }],
  pagoMovil: datosPagoMovil,
};

describe("un medio de pago (F4-02)", () => {
  test("el efectivo en dólares, con su IGTF y su vuelto, es válido", () => {
    assert.equal(MedioDePagoSchema.safeParse(efectivo).success, true);
  });

  test("el código va en mayúsculas y sin espacios: lo referencian los pagos cobrados", () => {
    for (const code of ["efectivo usd", "Efectivo", "E", "1EFECTIVO"]) {
      assert.equal(MedioDePagoSchema.safeParse({ ...efectivo, code }).success, false);
    }
  });

  test("un medio en USDT no da vuelto: en la gaveta no hay USDT", () => {
    const r = MedioDePagoSchema.safeParse({
      ...efectivo,
      code: "USDT",
      currency: "USDT",
      canGiveChange: true,
    });
    assert.equal(r.success, false);
  });
});

describe("la configuración completa (F4-04)", () => {
  test("medios, terminales y los datos que ve el cliente", () => {
    assert.equal(MediosDePagoSchema.safeParse(config).success, true);
  });

  test("sin ningún medio, o sin ninguno activo, no se puede cobrar nada", () => {
    assert.equal(MediosDePagoSchema.safeParse({ ...config, medios: [] }).success, false);
    const apagados = {
      ...config,
      medios: [{ ...efectivo, activo: false }, { ...pagoMovil, activo: false }],
    };
    assert.equal(MediosDePagoSchema.safeParse(apagados).success, false);
  });

  test("ofrecer Pago Móvil sin decir a qué teléfono no pasa", () => {
    const { pagoMovil: _fuera, ...sinDatos } = config;
    assert.equal(MediosDePagoSchema.safeParse(sinDatos).success, false);
  });

  test("pero apagado sí: un local sin Pago Móvil no tiene que inventarse un teléfono", () => {
    const { pagoMovil: _fuera, ...sinDatos } = config;
    const r = MediosDePagoSchema.safeParse({
      ...sinDatos,
      medios: [efectivo, { ...pagoMovil, activo: false }],
    });
    assert.equal(r.success, true);
  });

  test("el punto de venta encendido sin terminales no pasa", () => {
    const r = MediosDePagoSchema.safeParse({
      ...config,
      medios: [efectivo, punto],
      terminales: [],
    });
    assert.equal(r.success, false);
  });

  test("ofrecer Zelle exige el titular y el correo", () => {
    const zelleActivo = {
      code: "ZELLE",
      label: "Zelle",
      currency: "USD",
      triggersIgtf: true,
      canGiveChange: false,
      datos: "ZELLE",
      activo: true,
    } as const;
    assert.equal(
      MediosDePagoSchema.safeParse({ ...config, medios: [efectivo, zelleActivo] }).success,
      false,
    );
    assert.equal(
      MediosDePagoSchema.safeParse({ ...config, medios: [efectivo, zelleActivo], zelle: datosZelle })
        .success,
      true,
    );
  });

  test("un correo que no es un correo no pasa: el cliente le envía dinero a eso", () => {
    const r = MediosDePagoSchema.safeParse({
      ...config,
      zelle: { ...datosZelle, email: "pagos arroba parquel2" },
    });
    assert.equal(r.success, false);
  });

  test("un teléfono venezolano mal escrito tampoco", () => {
    for (const phone of ["0414-234567", "414-2345678", "0499-1234567"]) {
      const r = MediosDePagoSchema.safeParse({ ...config, pagoMovil: { ...datosPagoMovil, phone } });
      assert.equal(r.success, false);
    }
  });

  test("dos medios no comparten código, ni dos terminales identificador", () => {
    assert.equal(
      MediosDePagoSchema.safeParse({ ...config, medios: [efectivo, { ...pagoMovil, code: efectivo.code }] })
        .success,
      false,
    );
    assert.equal(
      MediosDePagoSchema.safeParse({
        ...config,
        terminales: [
          { id: "pdv-1", name: "Punto Banesco", bank: "Banesco" },
          { id: "pdv-1", name: "Punto Mercantil", bank: "Mercantil" },
        ],
      }).success,
      false,
    );
  });
});

describe("los cambios posibles", () => {
  test("un medio se apaga y se enciende", () => {
    assert.equal(
      MedioCommandSchema.safeParse({ kind: "ACTIVAR", code: "ZELLE", activo: false }).success,
      true,
    );
  });

  test("no existe borrar un medio: los pagos de ayer lo nombran", () => {
    assert.equal(MedioCommandSchema.safeParse({ kind: "BORRAR", code: "ZELLE" }).success, false);
    assert.equal(
      MedioCommandSchema.safeParse({ kind: "ELIMINAR_MEDIO", code: "ZELLE" }).success,
      false,
    );
  });

  test("los datos del local se cambian enteros, no campo a campo", () => {
    assert.equal(
      MedioCommandSchema.safeParse({ kind: "DATOS_PAGO_MOVIL", datos: datosPagoMovil }).success,
      true,
    );
    assert.equal(
      MedioCommandSchema.safeParse({ kind: "DATOS_PAGO_MOVIL", datos: { phone: "0414-2345678" } })
        .success,
      false,
    );
  });

  test("un terminal se añade y se retira", () => {
    assert.equal(
      MedioCommandSchema.safeParse({
        kind: "AÑADIR_TERMINAL",
        terminal: { id: "pdv-bnc", name: "Punto BNC", bank: "BNC" },
      }).success,
      true,
    );
    assert.equal(
      MedioCommandSchema.safeParse({ kind: "RETIRAR_TERMINAL", terminalId: "pdv-bnc" }).success,
      true,
    );
  });
});
