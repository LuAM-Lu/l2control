/**
 * Pruebas del contrato de la sucursal.
 *
 * Lo que se comprueba aquí no es que Zod sepa validar: es que las reglas que
 * el producto da por sentadas —el horario no cruza la medianoche, «sin
 * servicio» se dice con palabras, el umbral de vuelto no puede ser cero—
 * las impone el esquema y no la buena voluntad de la pantalla.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { AjustesSucursalSchema, HorarioDelDiaSchema, PublicarAjustesCommandSchema, ServicioSchema } from "./index.ts";

const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"] as const;

const horarioCompleto = DIAS.map((dia) =>
  dia === "DOMINGO"
    ? { dia, kind: "CERRADO" as const }
    : { dia, kind: "ABIERTO" as const, abre: "10:00", cierra: "20:00" },
);

const base = {
  nombre: "Abby Kingdom",
  rif: "J-40123456-7",
  direccionFiscal: "Av. Principal, Local 3, Barquisimeto",
  telefono: null,
  monedaFuncional: "USD" as const,
  formatoHora: "12h" as const,
  zonaHoraria: "America/Caracas",
  horario: horarioCompleto,
  maxRetenido: { minor: "50", currency: "USD" as const },
  umbralArqueo: { minor: "100", currency: "USD" as const },
  horasHuerfana: 8,
  servicio: { kind: "SIN_SERVICIO" as const },
};

const pasa = (cambio: Record<string, unknown>) => AjustesSucursalSchema.safeParse({ ...base, ...cambio }).success;

describe("horario del día", () => {
  test("cerrado no lleva horas: no es «abre a las 00:00»", () => {
    assert.ok(HorarioDelDiaSchema.safeParse({ dia: "DOMINGO", kind: "CERRADO" }).success);
  });

  test("el cierre no puede cruzar la medianoche", () => {
    const r = HorarioDelDiaSchema.safeParse({
      dia: "VIERNES",
      kind: "ABIERTO",
      abre: "20:00",
      cierra: "02:00",
    });
    assert.equal(r.success, false);
  });

  test("una hora inventada no pasa", () => {
    assert.equal(
      HorarioDelDiaSchema.safeParse({ dia: "LUNES", kind: "ABIERTO", abre: "25:00", cierra: "26:00" })
        .success,
      false,
    );
  });
});

describe("servicio y propina (D8, DEC-6)", () => {
  test("«sin servicio» es un caso con nombre, no un cero", () => {
    assert.ok(ServicioSchema.safeParse({ kind: "SIN_SERVICIO" }).success);
    assert.equal(ServicioSchema.safeParse({ kind: "SUGERIDO", basisPoints: 0 }).success, false);
  });

  test("el porcentaje es entero en puntos básicos y tiene techo", () => {
    assert.ok(ServicioSchema.safeParse({ kind: "SUGERIDO", basisPoints: 1000 }).success);
    assert.equal(ServicioSchema.safeParse({ kind: "SUGERIDO", basisPoints: 10.5 }).success, false);
    assert.equal(ServicioSchema.safeParse({ kind: "SUGERIDO", basisPoints: 5000 }).success, false);
  });
});

describe("ajustes de la sucursal", () => {
  test("un local completo pasa", () => {
    const a = AjustesSucursalSchema.parse(base);
    assert.equal(a.formatoHora, "12h");
    assert.equal(a.horario?.length, 7);
  });

  test("el RIF tiene forma de RIF", () => {
    assert.equal(AjustesSucursalSchema.safeParse({ ...base, rif: "40123456" }).success, false);
    assert.ok(AjustesSucursalSchema.safeParse({ ...base, rif: "V-12345678-9" }).success);
  });

  test("los siete días, una vez cada uno", () => {
    const repetido = [...horarioCompleto.slice(0, 6), { dia: "LUNES", kind: "CERRADO" as const }];
    assert.equal(AjustesSucursalSchema.safeParse({ ...base, horario: repetido }).success, false);
    assert.equal(
      AjustesSucursalSchema.safeParse({ ...base, horario: horarioCompleto.slice(0, 6) }).success,
      false,
    );
  });

  test("el umbral de residuo va en la moneda funcional y es mayor que cero", () => {
    assert.equal(
      AjustesSucursalSchema.safeParse({ ...base, maxRetenido: { minor: "50", currency: "VES" } })
        .success,
      false,
    );
    assert.equal(
      AjustesSucursalSchema.safeParse({ ...base, maxRetenido: { minor: "0", currency: "USD" } })
        .success,
      false,
    );
  });

  test("RIF, dirección, teléfono y horario pueden faltar: no se inventan (F0-04)", () => {
    assert.ok(pasa({ rif: null, direccionFiscal: null, telefono: null, horario: null }));
    // Faltar es `null`, no la clave ausente: lo guardado se lee igual que se escribió.
    const { rif: _r, ...sinRif } = base;
    assert.equal(AjustesSucursalSchema.safeParse(sinRif).success, false);
  });

  test("la sucursal no la declara el navegador", () => {
    const a = AjustesSucursalSchema.parse({ ...base, branchId: "otra" });
    assert.equal("branchId" in a, false);
  });

  test("la zona horaria tiene que existir", () => {
    assert.ok(pasa({ zonaHoraria: "America/Bogota" }));
    assert.equal(pasa({ zonaHoraria: "America/Maracaibo" }), false);
    assert.equal(pasa({ zonaHoraria: "UTC-4" }), false);
  });

  test("el residuo no pasa de $ 1,00", () => {
    assert.ok(pasa({ maxRetenido: { minor: "100", currency: "USD" } }));
    assert.equal(pasa({ maxRetenido: { minor: "101", currency: "USD" } }), false);
  });

  test("el umbral del arqueo va de $ 0,00 a $ 20,00, en dólares", () => {
    assert.ok(pasa({ umbralArqueo: { minor: "0", currency: "USD" } }));
    assert.ok(pasa({ umbralArqueo: { minor: "2000", currency: "USD" } }));
    assert.equal(pasa({ umbralArqueo: { minor: "2001", currency: "USD" } }), false);
    assert.equal(pasa({ umbralArqueo: { minor: "-1", currency: "USD" } }), false);
    assert.equal(pasa({ umbralArqueo: { minor: "100", currency: "VES" } }), false);
  });

  test("las horas de una huérfana son enteras, de 2 a 16", () => {
    assert.ok(pasa({ horasHuerfana: 2 }));
    assert.ok(pasa({ horasHuerfana: 16 }));
    assert.equal(pasa({ horasHuerfana: 1 }), false);
    assert.equal(pasa({ horasHuerfana: 17 }), false);
    assert.equal(pasa({ horasHuerfana: 8.5 }), false);
  });

  test("publicar dice sobre qué versión se editó", () => {
    assert.ok(PublicarAjustesCommandSchema.safeParse({ versionBase: 0, ajustes: base }).success);
    assert.equal(PublicarAjustesCommandSchema.safeParse({ ajustes: base }).success, false);
    assert.equal(PublicarAjustesCommandSchema.safeParse({ versionBase: -1, ajustes: base }).success, false);
  });

  test("la serie de pulseras: sin fijar vale todo; los ajustes de antes la leen sin fijar", () => {
    const a = AjustesSucursalSchema.parse(base);
    assert.deepEqual(a.pulseras, { prefijo: null, longitud: null });
    assert.ok(pasa({ pulseras: { prefijo: "ak-", longitud: 7 } }));
    assert.equal(AjustesSucursalSchema.parse({ ...base, pulseras: { prefijo: "ak-", longitud: 7 } }).pulseras.prefijo, "AK-");
    assert.equal(pasa({ pulseras: { prefijo: "AK 1", longitud: 7 } }), false);
    assert.equal(pasa({ pulseras: { prefijo: "AK-", longitud: 3 } }), false);
    assert.equal(pasa({ pulseras: { prefijo: "AKAK", longitud: 4 } }), false);
    assert.equal(pasa({ pulseras: { prefijo: null, longitud: 40 } }), false);
  });
});
