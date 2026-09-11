/**
 * Pruebas de la cuenta de la familia — DEC-21.
 *
 * Lo que se prueba son las reglas que las tres pantallas comparten: si una
 * cuenta pudiera quedar «cobrada con algo pendiente», la caja cerraría una
 * familia que todavía debe.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { FamilyAccountSchema } from "./account.ts";

const linea = (paid: boolean, amount = "500") => ({
  id: `l-${amount}-${paid}`,
  concept: "Paquete 1 hora · Vale",
  kind: "PAQUETE" as const,
  amount: { minor: amount, currency: "USD" as const },
  paid,
  sessionId: "s-1",
});

const cuenta = {
  id: "c-1",
  family: "Carolina Rojas",
  mode: "PREPAGO",
  status: "ABIERTA",
  openedAt: "2026-09-11T14:32:00.000Z",
  sessionIds: ["s-1"],
  closedSessionIds: [],
  lines: [linea(true)],
} as const;

describe("cuenta de la familia (DEC-21)", () => {
  test("una cuenta prepago con el paquete cobrado y la familia dentro es válida", () => {
    assert.equal(FamilyAccountSchema.safeParse(cuenta).success, true);
  });

  test("por cobrar exige algo pendiente", () => {
    const r = FamilyAccountSchema.safeParse({ ...cuenta, status: "POR_COBRAR" });
    assert.equal(r.success, false);
    assert.equal(
      FamilyAccountSchema.safeParse({ ...cuenta, status: "POR_COBRAR", lines: [linea(false)] })
        .success,
      true,
    );
  });

  test("una cuenta cobrada no puede deber nada", () => {
    const r = FamilyAccountSchema.safeParse({
      ...cuenta,
      status: "COBRADA",
      closedSessionIds: ["s-1"],
      lines: [linea(true), linea(false, "150")],
    });
    assert.equal(r.success, false);
  });

  test("no se cobra del todo mientras algún niño siga dentro", () => {
    const r = FamilyAccountSchema.safeParse({ ...cuenta, status: "COBRADA" });
    assert.equal(r.success, false);
  });

  test("una estancia cerrada tiene que ser de la cuenta", () => {
    const r = FamilyAccountSchema.safeParse({ ...cuenta, closedSessionIds: ["s-9"] });
    assert.equal(r.success, false);
  });

  test("las líneas van en la moneda funcional", () => {
    const enBolivares = { ...linea(true), amount: { minor: "114205", currency: "VES" as const } };
    const r = FamilyAccountSchema.safeParse({ ...cuenta, lines: [enBolivares] });
    assert.equal(r.success, false);
  });

  test("una cuenta de parque tiene al menos un niño", () => {
    const r = FamilyAccountSchema.safeParse({ ...cuenta, sessionIds: [], lines: [] });
    assert.equal(r.success, false);
  });
});
