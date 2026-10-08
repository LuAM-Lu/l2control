/**
 * Pruebas de la gestión del equipo — F2-11, §7.3.
 *
 * §10.1: cada negativa tiene su prueba. Una pantalla de usuarios es la llave
 * del sistema entero, así que lo que se prueba aquí no es que funcione el
 * camino feliz, sino que **las cinco puertas cierran**.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { administradoresActivos, revisarCambio, type PersonaDelEquipo } from "./gestion.ts";
import type { Actor } from "./permissions.ts";

const SUC = "b1";
const admin: Actor = { id: "u-abi", role: "ADMIN", branchIds: [SUC] };
const supervisor: Actor = { id: "u-luis", role: "SUPERVISOR", branchIds: [SUC] };

const EQUIPO: PersonaDelEquipo[] = [
  { id: "u-abi", role: "ADMIN", active: true },
  { id: "u-luis", role: "SUPERVISOR", active: true },
  { id: "u-mari", role: "CAJERO", active: true },
  { id: "u-carla", role: "CAJERO", active: false },
];

const revisar = (cambio: Parameters<typeof revisarCambio>[0]["cambio"], autor: Actor = admin, equipo = EQUIPO) =>
  revisarCambio({ equipo, autor, cambio, branchId: SUC });

describe("gestionar el equipo (F2-11)", () => {
  test("la administración da de alta, de baja, cambia el rol y repone el PIN", () => {
    assert.equal(revisar({ kind: "ALTA", role: "MESERO" }).ok, true);
    assert.equal(revisar({ kind: "BAJA", userId: "u-mari" }).ok, true);
    assert.equal(revisar({ kind: "ROL", userId: "u-mari", role: "SUPERVISOR" }).ok, true);
    assert.equal(revisar({ kind: "PIN", userId: "u-mari" }).ok, true);
    assert.equal(revisar({ kind: "REINGRESO", userId: "u-carla" }).ok, true);
  });

  test("quien no alcanza «usuarios.gestionar» no toca nada", () => {
    const v = revisar({ kind: "BAJA", userId: "u-mari" }, supervisor);
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.motivo : "", /permiso/i);
  });

  test("tampoco en una sucursal que no es la suya", () => {
    const otraSede: Actor = { id: "u-abi", role: "ADMIN", branchIds: ["b2"] };
    assert.equal(revisar({ kind: "BAJA", userId: "u-mari" }, otraSede).ok, false);
  });

  test("nadie se da de baja ni se cambia el rol a sí mismo", () => {
    assert.equal(revisar({ kind: "BAJA", userId: "u-abi" }).ok, false);
    assert.equal(revisar({ kind: "ROL", userId: "u-abi", role: "CAJERO" }).ok, false);
  });

  test("el local no se queda sin administración: ni de baja ni degradada", () => {
    const equipo: PersonaDelEquipo[] = [
      { id: "u-abi", role: "ADMIN", active: true },
      { id: "u-mari", role: "CAJERO", active: true },
    ];
    // Lo pide otra persona con el permiso concedido por excepción, para que la
    // regla que muerda sea la del último administrador y no la de uno mismo.
    const otro: Actor = { id: "u-mari", role: "ADMIN", branchIds: [SUC] };
    const baja = revisarCambio({ equipo, autor: otro, cambio: { kind: "BAJA", userId: "u-abi" }, branchId: SUC });
    assert.equal(baja.ok, false);
    assert.match(baja.ok === false ? baja.motivo : "", /única administración/i);

    const rol = revisarCambio({
      equipo,
      autor: otro,
      cambio: { kind: "ROL", userId: "u-abi", role: "SUPERVISOR" },
      branchId: SUC,
    });
    assert.equal(rol.ok, false);
  });

  test("con dos administraciones activas, una sí se puede dar de baja", () => {
    const equipo: PersonaDelEquipo[] = [
      ...EQUIPO,
      { id: "u-otra", role: "ADMIN", active: true },
    ];
    assert.equal(revisar({ kind: "BAJA", userId: "u-otra" }, admin, equipo).ok, true);
    assert.equal(administradoresActivos(equipo), 2);
  });

  test("una administración de baja no cuenta para el mínimo", () => {
    const equipo: PersonaDelEquipo[] = [
      { id: "u-abi", role: "ADMIN", active: true },
      { id: "u-vieja", role: "ADMIN", active: false },
      { id: "u-mari", role: "CAJERO", active: true },
    ];
    assert.equal(administradoresActivos(equipo), 1);
    const otro: Actor = { id: "u-mari", role: "ADMIN", branchIds: [SUC] };
    assert.equal(
      revisarCambio({ equipo, autor: otro, cambio: { kind: "BAJA", userId: "u-abi" }, branchId: SUC }).ok,
      false,
    );
  });

  test("administrador solo lo nombra un administrador, aunque otro pueda gestionar", () => {
    // Un supervisor con la concesión de DEC-15: gestiona personas, pero no
    // fabrica administradores.
    const conConcesion: Actor = { id: "u-luis", role: "SUPERVISOR", branchIds: [SUC] };
    const equipo = EQUIPO;
    // Se comprueba con el permiso ya abierto, sustituyendo el rol solo para el
    // segundo filtro: lo que se prueba es la puerta 5, no la 1.
    const comoAdmin: Actor = { ...conConcesion, role: "ADMIN" };
    assert.equal(revisarCambio({ equipo, autor: comoAdmin, cambio: { kind: "ALTA", role: "ADMIN" }, branchId: SUC }).ok, true);
    const v = revisarCambio({ equipo, autor: conConcesion, cambio: { kind: "ALTA", role: "ADMIN" }, branchId: SUC });
    assert.equal(v.ok, false);
  });

  test("no se repite lo que ya es: ni baja doble, ni reingreso de quien está activo, ni el mismo rol", () => {
    assert.equal(revisar({ kind: "BAJA", userId: "u-carla" }).ok, false);
    assert.equal(revisar({ kind: "REINGRESO", userId: "u-mari" }).ok, false);
    assert.equal(revisar({ kind: "ROL", userId: "u-mari", role: "CAJERO" }).ok, false);
  });

  test("a quien está de baja no se le cambia el rol ni se le repone el PIN", () => {
    assert.equal(revisar({ kind: "ROL", userId: "u-carla", role: "MESERO" }).ok, false);
    assert.equal(revisar({ kind: "PIN", userId: "u-carla" }).ok, false);
  });

  test("una persona que no está en el equipo no se toca", () => {
    const v = revisar({ kind: "BAJA", userId: "u-fantasma" });
    assert.equal(v.ok, false);
    assert.match(v.ok === false ? v.motivo : "", /no está en el equipo/i);
  });
});

describe("la cuenta de soporte (T-17, M-28)", () => {
  const otraAdmin: Actor = { id: "u-ines", role: "ADMIN", branchIds: [SUC] };
  const CON_DOS: PersonaDelEquipo[] = [...EQUIPO, { id: "u-ines", role: "ADMIN", active: true }];
  const CON_SOPORTE: PersonaDelEquipo[] = [...EQUIPO, { id: "u-sop", role: "ADMIN", active: true, soporte: true }];

  test("la administración marca a otra persona de Administración, y la quita", () => {
    assert.equal(revisar({ kind: "SOPORTE", userId: "u-ines" }, admin, CON_DOS).ok, true);
    assert.equal(revisar({ kind: "SOPORTE_FIN", userId: "u-sop" }, admin, CON_SOPORTE).ok, true);
  });

  test("nadie se marca a sí misma, y solo la administración marca", () => {
    assert.match(String((revisar({ kind: "SOPORTE", userId: "u-ines" }, otraAdmin, CON_DOS) as { motivo?: string }).motivo), /a ti misma/);
    const conGestion: Actor = { ...supervisor, grants: { "usuarios.gestionar": "PERMITIDO" } };
    assert.match(String((revisar({ kind: "SOPORTE", userId: "u-ines" }, conGestion, CON_DOS) as { motivo?: string }).motivo), /Solo la administración/);
  });

  test("solo de Administración, activa, y el local no se queda sin su administración", () => {
    assert.equal(revisar({ kind: "SOPORTE", userId: "u-luis" }, admin, CON_DOS).ok, false);
    assert.equal(revisar({ kind: "SOPORTE", userId: "u-carla" }, admin, CON_DOS).ok, false);
    // Ni a sí misma, ni a la única administración del local (se quedaría sin nadie).
    assert.equal(revisar({ kind: "SOPORTE", userId: "u-ines" }, otraAdmin, CON_DOS).ok, false);
    const soloInes: PersonaDelEquipo[] = [{ id: "u-ines", role: "ADMIN", active: true }, { id: "u-abi", role: "ADMIN", active: true, soporte: true }];
    assert.match(String((revisar({ kind: "SOPORTE", userId: "u-ines" }, admin, soloInes) as { motivo?: string }).motivo), /única administración del local/);
  });

  test("la cuenta de soporte no cuenta como administración del local, no cambia de rol y se puede dar de baja", () => {
    assert.equal(administradoresActivos(CON_SOPORTE), 1);
    assert.match(String((revisar({ kind: "ROL", userId: "u-sop", role: "SUPERVISOR" }, admin, CON_SOPORTE) as { motivo?: string }).motivo), /quítale la marca/);
    assert.equal(revisar({ kind: "BAJA", userId: "u-sop" }, admin, CON_SOPORTE).ok, true);
    // La única administración del local no se da de baja aunque haya una cuenta de soporte.
    const abiYSoporte: PersonaDelEquipo[] = [{ id: "u-abi", role: "ADMIN", active: true }, { id: "u-sop", role: "ADMIN", active: true, soporte: true }];
    const otra: Actor = { id: "u-sop", role: "ADMIN", branchIds: [SUC] };
    assert.equal(revisar({ kind: "BAJA", userId: "u-abi" }, otra, abiYSoporte).ok, false);
    assert.equal(revisar({ kind: "SOPORTE_FIN", userId: "u-abi" }, admin, abiYSoporte).ok, false, "no es la de soporte");
  });
});
