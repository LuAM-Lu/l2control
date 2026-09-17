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

import { AjustesSucursalSchema, HorarioDelDiaSchema, ServicioSchema } from "./index.ts";

const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"] as const;

const horarioCompleto = DIAS.map((dia) =>
  dia === "DOMINGO"
    ? { dia, kind: "CERRADO" as const }
    : { dia, kind: "ABIERTO" as const, abre: "10:00", cierra: "20:00" },
);

const base = {
  branchId: "b1",
  nombre: "Abby Kingdom",
  rif: "J-40123456-7",
  direccionFiscal: "Av. Principal, Local 3, Barquisimeto",
  monedaFuncional: "USD" as const,
  formatoHora: "12h" as const,
  horario: horarioCompleto,
  maxRetenido: { minor: "50", currency: "USD" as const },
  servicio: { kind: "SIN_SERVICIO" as const },
};

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
    assert.equal(a.horario.length, 7);
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
});
