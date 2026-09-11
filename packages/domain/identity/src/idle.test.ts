/**
 * Pruebas del bloqueo por inactividad — F2-12, DEC-17, §9.10.5.
 *
 * «Un puesto desatendido con la sesión de la cajera abierta es una anulación
 * esperando a ocurrir.» Lo que se prueba es cuándo se avisa, cuándo se
 * bloquea, que la pantalla de pared no se bloquee nunca, y que una política
 * mal escrita se rechace en lugar de convertirse en «no bloquear».
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STATION_IDLE,
  InvalidIdlePolicyError,
  computeIdle,
  type IdlePolicy,
} from "./index.ts";

const T0 = 1_757_430_000_000;
const seg = (s: number) => T0 + s * 1000;
const tresMinutos: IdlePolicy = { kind: "BLOQUEO", afterSeconds: 180, warnSeconds: 30 };

describe("bloqueo por inactividad (F2-12)", () => {
  test("recién tocado, la sesión sigue activa", () => {
    assert.deepEqual({ ...computeIdle(T0, seg(10), tresMinutos) }, { state: "ACTIVO" });
  });

  test("en la ventana de aviso dice cuántos segundos quedan", () => {
    assert.deepEqual(
      { ...computeIdle(T0, seg(160), tresMinutos) },
      { state: "AVISO", secondsToLock: 20 },
    );
  });

  test("el aviso empieza justo al entrar en la ventana, no un segundo tarde", () => {
    assert.equal(computeIdle(T0, seg(149), tresMinutos).state, "ACTIVO");
    assert.equal(computeIdle(T0, seg(150), tresMinutos).state, "AVISO");
  });

  test("al cumplirse el plazo, se bloquea", () => {
    assert.equal(computeIdle(T0, seg(180), tresMinutos).state, "BLOQUEADO");
    assert.equal(computeIdle(T0, seg(3600), tresMinutos).state, "BLOQUEADO");
  });

  test("la pantalla de pared no se bloquea nunca", () => {
    // El monitor de sala se mira, no se toca: bloquearlo lo dejaría en negro.
    const pared: IdlePolicy = { kind: "SIN_BLOQUEO" };
    assert.equal(computeIdle(T0, seg(10 * 3600), pared).state, "ACTIVO");
  });

  test("un reloj que retrocede no bloquea ni cuenta tiempo negativo", () => {
    assert.equal(computeIdle(seg(100), seg(40), tresMinutos).state, "ACTIVO");
  });

  test("la política de las estaciones es corta: tres minutos con treinta de aviso", () => {
    assert.deepEqual({ ...DEFAULT_STATION_IDLE }, tresMinutos);
  });

  test("una política mal escrita se rechaza: nunca se lee como «no bloquear»", () => {
    const malas: IdlePolicy[] = [
      { kind: "BLOQUEO", afterSeconds: 0, warnSeconds: 0 },
      { kind: "BLOQUEO", afterSeconds: -5, warnSeconds: 0 },
      { kind: "BLOQUEO", afterSeconds: 60, warnSeconds: 60 },
      { kind: "BLOQUEO", afterSeconds: 60, warnSeconds: -1 },
      { kind: "BLOQUEO", afterSeconds: Number.NaN, warnSeconds: 10 },
    ];
    for (const p of malas) {
      assert.throws(() => computeIdle(T0, seg(1), p), InvalidIdlePolicyError, JSON.stringify(p));
    }
  });
});
