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

describe("cuenta de mesa (F6-05, D2 y D3)", () => {
  const plato = { id: "l-pizza", concept: "Pizza margarita", kind: "RESTAURANTE" as const, amount: { minor: "850", currency: "USD" as const }, paid: false };
  const deMesa = {
    id: "c-mesa-3",
    family: "Mesa 3",
    mode: "CUENTA_ABIERTA" as const,
    status: "ABIERTA" as const,
    openedAt: "2026-09-14T18:00:00.000Z",
    sessionIds: [],
    closedSessionIds: [],
    tableId: "mesa-3",
    tableLabel: "3",
    lines: [plato],
  };
  const valido = (c: unknown) => FamilyAccountSchema.safeParse(c).success;

  test("una cuenta anclada a una mesa no necesita niños", () => {
    assert.equal(valido(deMesa), true);
  });

  test("sin niños y sin mesa, no es cuenta de nadie", () => {
    assert.equal(valido({ ...deMesa, tableId: undefined, tableLabel: undefined }), false);
  });

  test("la mesa se cobra aunque sus niños sigan dentro (D3)", () => {
    const conNinos = { ...deMesa, sessionIds: ["s1"], closedSessionIds: [] };
    assert.equal(valido({ ...conNinos, status: "COBRADA", lines: [{ ...plato, paid: true }] }), true);
    // Una cuenta de familia, en cambio, no se cierra con niños dentro.
    assert.equal(
      valido({ ...conNinos, tableId: undefined, tableLabel: undefined, status: "COBRADA", lines: [{ ...plato, paid: true }] }),
      false,
    );
  });

  test("una línea movida a otra cuenta ya no cuenta como pendiente (D2)", () => {
    const movida = { ...plato, movedTo: "c-mesa-3" };
    // Cobrada: lo único que quedaba se movió a la cuenta de la mesa.
    assert.equal(valido({ ...deMesa, sessionIds: ["s1"], status: "COBRADA", lines: [movida], closedSessionIds: ["s1"] }), true);
    // Por cobrar: si todo se movió, no hay nada que cobrar aquí.
    assert.equal(valido({ ...deMesa, status: "POR_COBRAR", lines: [movida] }), false);
  });
});

describe("dividir la cuenta (F6-12)", () => {
  const dividida = (split: object, extra: object = {}) => ({ ...cuenta, lines: [linea(false)], split, ...extra });
  const valido = (c: unknown) => FamilyAccountSchema.safeParse(c).success;

  test("se divide entre dos o más, y no en más de doce", () => {
    assert.equal(valido(dividida({ parts: 3, paid: 0 }, { status: "POR_COBRAR" })), true);
    assert.equal(valido(dividida({ parts: 1, paid: 0 }, { status: "POR_COBRAR" })), false);
    assert.equal(valido(dividida({ parts: 13, paid: 0 }, { status: "POR_COBRAR" })), false);
  });

  test("no se cobran más partes de las que hay", () => {
    assert.equal(valido(dividida({ parts: 3, paid: 4 }, { status: "POR_COBRAR" })), false);
  });

  test("con partes sin cobrar, la cuenta no se cierra", () => {
    const cobrada = { status: "COBRADA" as const, closedSessionIds: ["s-1"], lines: [linea(true)] };
    assert.equal(valido({ ...cuenta, ...cobrada, split: { parts: 3, paid: 2 } }), false);
    assert.equal(valido({ ...cuenta, ...cobrada, split: { parts: 3, paid: 3 } }), true);
  });
});
