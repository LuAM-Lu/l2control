/**
 * Pruebas de contrato.
 *
 * Un contrato sin pruebas es una intención. Estas comprueban que las reglas
 * que el plan da por sentadas —minimización de datos de menores, ausencia de
 * duración cero, representante inequívoco— las impone el esquema y no la
 * buena voluntad de quien llame.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CheckInCommandSchema,
  DurationSchema,
  GuardianSchema,
  DirectorioRepresentantesSchema,
  KidSchema,
  MoneySchema,
  ParkPolicySchema,
  TarifarioSchema,
  WristbandCodeSchema,
} from "./index.ts";

const UUID = "3f2b1c8e-5a4d-4e7f-9b1a-2c6d8e0f4a71";

describe("código de pulsera", () => {
  test("normaliza a mayúsculas y recorta espacios", () => {
    assert.equal(WristbandCodeSchema.parse("  ak-0142 "), "AK-0142");
  });

  test("rechaza lo que no puede venir de un lector", () => {
    for (const malo of ["ab", "", "AK 0142", "AK_0142", "<script>", "x".repeat(33)]) {
      assert.equal(WristbandCodeSchema.safeParse(malo).success, false, `aceptó "${malo}"`);
    }
  });
});

describe("minimización de datos de menores (DEC-9)", () => {
  test("acepta solo lo autorizado", () => {
    const kid = KidSchema.parse({ name: "Valentina Rojas", nickname: "Vale", ageYears: 7 });
    assert.equal(kid.name, "Valentina Rojas");
  });

  test("nombre y contacto del representante son obligatorios", () => {
    assert.equal(GuardianSchema.safeParse({ fullName: "A" }).success, false);
    assert.equal(
      GuardianSchema.safeParse({ fullName: "Ana Rojas", contactReference: "0412-1234567" }).success,
      true,
    );
  });

  test("descarta campos que DEC-9 no autorizó", () => {
    const kid = KidSchema.parse({
      name: "Mateo Guerrero",
      cedula: "V-12345678",
      direccion: "Calle 5",
      foto: "data:image/png;base64,AAA",
    } as Record<string, unknown>);
    assert.equal("cedula" in kid, false);
    assert.equal("direccion" in kid, false);
    assert.equal("foto" in kid, false);
  });
});

describe("duración (ADR-011)", () => {
  test("no existe la duración cero", () => {
    assert.equal(DurationSchema.safeParse({ kind: "fixed", minutes: 0 }).success, false);
    assert.equal(DurationSchema.safeParse({ kind: "fixed", minutes: -30 }).success, false);
  });

  test("el tiempo abierto es otra variante, no un número", () => {
    assert.deepEqual(DurationSchema.parse({ kind: "openEnded" }), { kind: "openEnded" });
  });
});

describe("política del parque", () => {
  test("gracia 0 es válida y significa «sin gracia»", () => {
    const p = ParkPolicySchema.parse({
      graceMinutes: 0,
      penaltyBlockMinutes: 15,
      penaltyPricePerBlock: { minor: "150", currency: "USD" },
      warnBeforeMinutes: 10,
      capacityLimit: 30,
    });
    assert.equal(p.graceMinutes, 0);
  });

  test("un bloque de penalización de 0 se rechaza: sería división por cero", () => {
    const r = ParkPolicySchema.safeParse({
      graceMinutes: 5,
      penaltyBlockMinutes: 0,
      penaltyPricePerBlock: { minor: "150", currency: "USD" },
      warnBeforeMinutes: 10,
      capacityLimit: 30,
    });
    assert.equal(r.success, false);
  });
});

describe("dinero en el cable", () => {
  test("acepta enteros como texto, no decimales", () => {
    assert.equal(MoneySchema.safeParse({ minor: "1750", currency: "USD" }).success, true);
    assert.equal(MoneySchema.safeParse({ minor: "17.50", currency: "USD" }).success, false);
  });

  test("un monto sin moneda no es un monto", () => {
    assert.equal(MoneySchema.safeParse({ minor: "1750" }).success, false);
  });
});

describe("registro de entrada (F5-02)", () => {
  const entrada = {
    idempotencyKey: UUID,
    entries: [
      { wristbandCode: "AK-0142", kid: { name: "Valentina Rojas" }, packageId: "pkg-60" },
    ],
  };

  test("acepta un representante nuevo", () => {
    const r = CheckInCommandSchema.safeParse({
      ...entrada,
      guardian: { fullName: "Ana Rojas", contactReference: "0412-1234567" },
    });
    assert.equal(r.success, true);
  });

  test("acepta un representante ya conocido", () => {
    const r = CheckInCommandSchema.safeParse({ ...entrada, guardianId: "g-1" });
    assert.equal(r.success, true);
  });

  test("rechaza que no haya representante: sin él no hay a quién llamar", () => {
    assert.equal(CheckInCommandSchema.safeParse(entrada).success, false);
  });

  test("rechaza los dos a la vez", () => {
    const r = CheckInCommandSchema.safeParse({
      ...entrada,
      guardianId: "g-1",
      guardian: { fullName: "Ana Rojas", contactReference: "0412-1234567" },
    });
    assert.equal(r.success, false);
  });

  test("exige clave de idempotencia: sin ella, un doble clic cobra dos veces", () => {
    const { idempotencyKey: _omitida, ...sinClave } = entrada;
    const r = CheckInCommandSchema.safeParse({
      ...sinClave,
      guardianId: "g-1",
    });
    assert.equal(r.success, false);
  });

  test("exige al menos un niño", () => {
    const r = CheckInCommandSchema.safeParse({
      idempotencyKey: UUID,
      entries: [],
      guardianId: "g-1",
    });
    assert.equal(r.success, false);
  });
});

describe("tarifario del parque (F5-04, F5-06)", () => {
  const paquete = (id: string, nombre: string, minutos: number | null, minor = "500", activo = true) => ({
    id,
    name: nombre,
    mode: minutos === null ? ("POSTPAGO" as const) : ("PREPAGO" as const),
    duration: minutos === null ? { kind: "openEnded" as const } : { kind: "fixed" as const, minutes: minutos },
    price: { minor, currency: "USD" as const },
    active: activo,
  });
  const politica = {
    graceMinutes: 5,
    penaltyBlockMinutes: 15,
    penaltyPricePerBlock: { minor: "150", currency: "USD" as const },
    warnBeforeMinutes: 10,
    capacityLimit: 30,
  };
  const valido = {
    packages: [paquete("p30", "30 minutos", 30, "300"), paquete("libre", "Pase libre", null, "1200")],
    policy: politica,
  };
  const falla = (t: unknown, patron: RegExp) => {
    const r = TarifarioSchema.safeParse(t);
    assert.equal(r.success, false);
    if (!r.success) assert.ok(r.error.issues.some((i) => patron.test(i.message)), JSON.stringify(r.error.issues));
  };

  test("un tarifario coherente es válido", () => {
    assert.equal(TarifarioSchema.safeParse(valido).success, true);
  });

  test("un paquete retirado se queda, pero tiene que quedar alguno a la venta", () => {
    const retirado = paquete("p30", "30 minutos", 30, "300", false);
    assert.equal(TarifarioSchema.safeParse({ ...valido, packages: [retirado, valido.packages[1]] }).success, true);
    falla({ ...valido, packages: [retirado] }, /al menos un paquete a la venta/);
  });

  test("un paquete a precio cero no entra: eso es una cortesía", () => {
    falla({ ...valido, packages: [paquete("p", "Gratis", 30, "0")] }, /mayor que cero/);
  });

  test("el parque cobra en dólares", () => {
    const enBs = { ...paquete("p", "30 minutos", 30), price: { minor: "300", currency: "VES" } };
    falla({ ...valido, packages: [enBs] }, /dólares/);
  });

  test("dos paquetes a la venta no se llaman igual, aunque cambien mayúsculas o acentos", () => {
    falla(
      { ...valido, packages: [paquete("a", "Media hora", 30), paquete("b", "  MEDIA  HORA", 45)] },
      /Ya hay un paquete/,
    );
    // Retirado no cuenta: un paquete vuelve con otro precio.
    assert.equal(
      TarifarioSchema.safeParse({
        ...valido,
        packages: [paquete("a", "Media hora", 30, "300", false), paquete("b", "Media hora", 30, "350")],
      }).success,
      true,
    );
  });

  test("un pase libre se cobra al salir", () => {
    const mal = { ...paquete("libre", "Pase libre", null), mode: "PREPAGO" };
    falla({ ...valido, packages: [valido.packages[0], mal] }, /se cobra al salir/);
  });

  test("el aviso de «por vencer» cabe en el paquete más corto", () => {
    falla({ ...valido, policy: { ...politica, warnBeforeMinutes: 30 } }, /menor que el paquete más corto/);
    // Un paquete retirado no cuenta para el más corto.
    const conRetiradoCorto = { ...valido, packages: [...valido.packages, paquete("p5", "5 minutos", 5, "100", false)] };
    assert.equal(TarifarioSchema.safeParse(conRetiradoCorto).success, true);
  });

  test("el excedente no puede ser negativo, y puede ser cero", () => {
    falla({ ...valido, policy: { ...politica, penaltyPricePerBlock: { minor: "-1", currency: "USD" } } }, /negativo/);
    assert.equal(
      TarifarioSchema.safeParse({ ...valido, policy: { ...politica, penaltyPricePerBlock: { minor: "0", currency: "USD" } } }).success,
      true,
    );
  });

  test("dos paquetes con el mismo id se rechazan", () => {
    falla({ ...valido, packages: [paquete("x", "Uno", 30), paquete("x", "Dos", 60)] }, /mismo id/);
  });
});

describe("directorio de representantes (F5-01, DEC-9)", () => {
  const familia = {
    id: "g1",
    fullName: "Pedro Bermúdez",
    contactReference: "0416-9876543",
    kids: [{ id: "k1", name: "Santiago Bermúdez", nickname: "Santi" }],
    visitas: 3,
    ultimaVisita: "2026-09-16T18:20:00.000Z",
  };

  test("una familia con sus niños y sus visitas es válida", () => {
    const d = DirectorioRepresentantesSchema.parse({ representantes: [familia] });
    assert.equal(d.representantes[0]?.kids[0]?.nickname, "Santi");
  });

  test("el contacto es la llave de búsqueda: no se repite, ni escrito distinto", () => {
    const r = DirectorioRepresentantesSchema.safeParse({
      representantes: [familia, { ...familia, id: "g2", contactReference: "04169876543" }],
    });
    assert.equal(r.success, false);
  });

  test("sin visitas no puede haber última visita", () => {
    const r = DirectorioRepresentantesSchema.safeParse({
      representantes: [{ ...familia, visitas: 0 }],
    });
    assert.equal(r.success, false);
  });

  test("sigue sin caber nada que DEC-9 no autorizó", () => {
    const r = DirectorioRepresentantesSchema.safeParse({
      representantes: [{ ...familia, kids: [{ id: "k1", name: "Santiago", cedula: "V-30111222" }] }],
    });
    // El esquema ignora lo que no declara; lo que importa es que no viaje.
    assert.ok(r.success);
    assert.equal("cedula" in (r.data?.representantes[0]?.kids[0] ?? {}), false);
  });
});
