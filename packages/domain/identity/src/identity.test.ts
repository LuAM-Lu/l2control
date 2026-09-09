/**
 * Pruebas de las políticas de acceso — ADR-013 y §7.2 (A07).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCKOUT_POLICY,
  checkDevice,
  checkNewPin,
  computeLockout,
  describeLockout,
  type Device,
} from "./index.ts";

const T0 = 1_757_000_000_000;
const dispositivo = (status: Device["status"]): Device => ({
  id: "d1",
  label: "Tablet taquilla",
  branchId: "b1",
  status,
});

describe("el dispositivo es el primer factor (ADR-013)", () => {
  test("solo un dispositivo aprobado puede pedir acceso", () => {
    assert.equal(checkDevice(dispositivo("APROBADO")).ok, true);
  });

  test("un dispositivo desconocido no autentica, por muy correcto que sea el PIN", () => {
    const r = checkDevice(null);
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.reason, "DESCONOCIDO");
  });

  test("pendiente y revocado se distinguen: el operador necesita saber qué hacer", () => {
    const p = checkDevice(dispositivo("PENDIENTE"));
    const r = checkDevice(dispositivo("REVOCADO"));
    assert.equal(p.ok === false && p.reason, "PENDIENTE");
    assert.equal(r.ok === false && r.reason, "REVOCADO");
    // El mensaje dice qué hacer, no solo que se denegó.
    assert.match(p.ok === false ? p.message : "", /aprobarlo/);
  });
});

describe("PIN aceptable al asignarlo", () => {
  test("acepta uno normal", () => {
    assert.equal(checkNewPin("8317").ok, true);
  });

  test("rechaza longitud y caracteres no numéricos", () => {
    assert.equal(checkNewPin("831").ok, false);
    assert.equal(checkNewPin("83a7").ok, false);
  });

  test("rechaza repeticiones y secuencias", () => {
    for (const trivial of ["1111", "0000", "1234", "4321", "5678"]) {
      const r = checkNewPin(trivial);
      assert.equal(r.ok, false, `aceptó ${trivial}`);
      assert.equal(r.ok === false && r.reason, "TRIVIAL");
    }
  });

  test("rechaza los PIN más usados", () => {
    for (const comun of ["1212", "6969", "2000"]) {
      assert.equal(checkNewPin(comun).ok, false, `aceptó ${comun}`);
    }
  });

  test("la política es configurable: 6 dígitos también vale", () => {
    assert.equal(checkNewPin("831742", { length: 6, rejectTrivial: true }).ok, true);
    assert.equal(checkNewPin("8317", { length: 6, rejectTrivial: true }).ok, false);
  });
});

describe("bloqueo con escalada creciente (§7.2 A07)", () => {
  test("los primeros intentos no bloquean, y dice cuántos quedan", () => {
    assert.deepEqual(
      [0, 1, 2].map((n) => computeLockout(n, T0, T0).attemptsRemaining),
      [3, 2, 1],
    );
    assert.equal(computeLockout(2, T0, T0).locked, false);
  });

  test("al tercer fallo bloquea 30 segundos", () => {
    const s = computeLockout(3, T0, T0);
    assert.equal(s.locked, true);
    assert.equal(s.secondsRemaining, 30);
  });

  test("la escalada crece: 30 s, 1 min, 5 min, 15 min", () => {
    const esperado = [30, 60, 300, 900];
    esperado.forEach((seg, i) => {
      assert.equal(computeLockout(3 + i, T0, T0).secondsRemaining, seg);
    });
  });

  test("más allá de la escalada se mantiene el máximo, no se reinicia", () => {
    assert.equal(computeLockout(20, T0, T0).secondsRemaining, 900);
  });

  test("cuando expira el bloqueo se concede UN intento, no el cupo entero", () => {
    // Regalar tres intentos cada vez que pasa el tiempo anularía la escalada:
    // bastaría esperar para volver a probar de tres en tres.
    const s = computeLockout(3, T0, T0 + 31_000);
    assert.equal(s.locked, false);
    assert.equal(s.attemptsRemaining, 1);
  });

  test("sin fallo previo registrado no hay bloqueo", () => {
    assert.equal(computeLockout(5, null, T0).locked, false);
  });

  test("el texto del bloqueo se dice en palabras, no en milisegundos", () => {
    assert.equal(describeLockout(computeLockout(3, T0, T0)), "Espera 30 segundos.");
    assert.equal(describeLockout(computeLockout(5, T0, T0)), "Espera 5 minutos.");
    assert.equal(describeLockout(computeLockout(0, T0, T0)), null);
  });

  test("la política es configurable sin tocar el código", () => {
    const estricta = { freeAttempts: 1, backoffSeconds: [10] };
    assert.equal(computeLockout(1, T0, T0, estricta).secondsRemaining, 10);
    assert.equal(computeLockout(0, T0, T0, estricta).attemptsRemaining, 1);
  });

  test("la política por defecto es la que documenta el plan", () => {
    assert.equal(DEFAULT_LOCKOUT_POLICY.freeAttempts, 3);
    assert.deepEqual([...DEFAULT_LOCKOUT_POLICY.backoffSeconds], [30, 60, 300, 900]);
  });
});
