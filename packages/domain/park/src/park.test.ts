/**
 * Pruebas de las reglas de estancia — §6.5, ADR-010 y ADR-011.
 *
 * Deuda saldada: este paquete decide cuánto se le cobra a un representante en
 * taquilla y no tenía una sola prueba. El DoD de §0.4 lo exige, y la pantalla
 * de registro (F5-02) se apoya en estas reglas.
 *
 * Todas las pruebas fijan `now` a mano. Eso no es una comodidad del test: es
 * ADR-010 hecho verificable — si alguna función leyera el reloj, estas
 * pruebas serían imposibles de escribir de forma determinista.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { fromMajor, toMajor } from "@l2/domain-money";
import {
  computeCapacity,
  computeOverdueBreakdown,
  computeOverdueCharge,
  computeSessionView,
  computeSettlement,
  epochMs,
  fixed,
  formatDuration,
  openEnded,
  parkPolicy,
  type ParkSession,
} from "./index.ts";

const MIN = 60_000;
const T0 = 1_757_000_000_000; // instante fijo de referencia

const POLICY = parkPolicy({
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: fromMajor("1.50", "USD"),
  warnBeforeMinutes: 10,
});

function sesion(over: Partial<ParkSession> = {}): ParkSession {
  return {
    id: "s1",
    childName: "Valentina Rojas",
    wristbandCode: "AK-0142",
    mode: "PREPAGO",
    duration: fixed(60),
    startedAt: epochMs(T0),
    ...over,
  };
}

/** Estado a los `min` minutos de haber entrado. */
const alos = (min: number, s = sesion()) => computeSessionView(s, POLICY, epochMs(T0 + min * MIN));

describe("constructores que validan (ADR-011)", () => {
  test("no existe la duración fija de cero", () => {
    assert.throws(() => fixed(0), /openEnded/);
  });

  test("ni las duraciones negativas o fraccionarias", () => {
    assert.throws(() => fixed(-30), RangeError);
    assert.throws(() => fixed(1.5), RangeError);
  });

  test("gracia 0 es válida: significa «sin gracia», explícitamente", () => {
    const p = parkPolicy({
      graceMinutes: 0,
      penaltyBlockMinutes: 15,
      penaltyPricePerBlock: fromMajor("1.50", "USD"),
      warnBeforeMinutes: 10,
    });
    assert.equal(p.graceMinutes, 0);
  });

  test("un bloque de penalización de 0 se rechaza: sería división por cero", () => {
    assert.throws(
      () =>
        parkPolicy({
          graceMinutes: 5,
          penaltyBlockMinutes: 0,
          penaltyPricePerBlock: fromMajor("1.50", "USD"),
          warnBeforeMinutes: 10,
        }),
      /división por cero/,
    );
  });
});

describe("estados de la estancia (§6.5)", () => {
  test("recorre activa → por vencer → en gracia → vencida", () => {
    assert.equal(alos(10).status, "ACTIVA"); // faltan 50, aviso a los 10
    assert.equal(alos(50).status, "POR_VENCER"); // faltan exactamente 10
    assert.equal(alos(59).status, "POR_VENCER");
    assert.equal(alos(62).status, "EN_GRACIA"); // vencida hace 2, gracia 5
    assert.equal(alos(65).status, "EN_GRACIA"); // justo al borde de la gracia
    assert.equal(alos(66).status, "VENCIDA"); // pasado el borde, ya se cobra
  });

  test("el aviso salta en el minuto exacto configurado, no antes", () => {
    assert.equal(alos(49).status, "ACTIVA");
    assert.equal(alos(50).status, "POR_VENCER");
  });

  test("sin gracia, vencer y ser cobrable ocurren a la vez", () => {
    const sinGracia = parkPolicy({
      graceMinutes: 0,
      penaltyBlockMinutes: 15,
      penaltyPricePerBlock: fromMajor("1.50", "USD"),
      warnBeforeMinutes: 10,
    });
    const v = computeSessionView(sesion(), sinGracia, epochMs(T0 + 61 * MIN));
    assert.equal(v.status, "VENCIDA");
    assert.equal(v.billableOverdueMs, 1 * MIN);
  });

  test("el tiempo abierto nunca vence solo", () => {
    const libre = sesion({ mode: "POSTPAGO", duration: openEnded });
    for (const min of [1, 60, 600]) {
      const v = computeSessionView(libre, POLICY, epochMs(T0 + min * MIN));
      assert.equal(v.status, "ACTIVA");
      assert.equal(v.remainingMs, null);
      assert.equal(v.overdueMs, 0);
    }
  });

  test("un reloj atrasado no produce tiempo transcurrido negativo", () => {
    const v = computeSessionView(sesion(), POLICY, epochMs(T0 - 10 * MIN));
    assert.equal(v.elapsedMs, 0);
  });
});

describe("cargo por excedente", () => {
  test("dentro de la gracia no se cobra nada", () => {
    assert.equal(toMajor(computeOverdueCharge(alos(63), POLICY)), "0.00");
  });

  test("se cobra por BLOQUES INICIADOS, no proporcional", () => {
    // 7 min vencida − 5 de gracia = 2 cobrables → 1 bloque de 15
    assert.equal(toMajor(computeOverdueCharge(alos(67), POLICY)), "1.50");
    // 20 − 5 = 15 cobrables → sigue siendo 1 bloque exacto
    assert.equal(toMajor(computeOverdueCharge(alos(80), POLICY)), "1.50");
    // 21 − 5 = 16 cobrables → entra el segundo bloque
    assert.equal(toMajor(computeOverdueCharge(alos(81), POLICY)), "3.00");
    // 50 − 5 = 45 → tres bloques justos
    assert.equal(toMajor(computeOverdueCharge(alos(110), POLICY)), "4.50");
  });

  test("es el caso del monitor: Santiago, 7 min de más, 1,50 USD", () => {
    const santiago = sesion({ childName: "Santiago Bermúdez", duration: fixed(30) });
    const v = computeSessionView(santiago, POLICY, epochMs(T0 + 37 * MIN));
    assert.equal(v.status, "VENCIDA");
    assert.equal(toMajor(computeOverdueCharge(v, POLICY)), "1.50");
  });

  test("el tiempo abierto no genera excedente: se cobra al salir, no por vencer", () => {
    const libre = sesion({ mode: "POSTPAGO", duration: openEnded });
    const v = computeSessionView(libre, POLICY, epochMs(T0 + 300 * MIN));
    assert.equal(toMajor(computeOverdueCharge(v, POLICY)), "0.00");
  });
});

describe("desglose del excedente", () => {
  test("dice minutos y bloques, no solo el importe", () => {
    // 7 min vencida − 5 de gracia = 2 cobrables → 1 bloque de 15 iniciado
    const d = computeOverdueBreakdown(alos(67), POLICY);
    assert.equal(d.billableMinutes, 2);
    assert.equal(d.blocks, 1);
    assert.equal(toMajor(d.charge), "1.50");
  });

  test("dentro de la gracia el desglose es todo ceros", () => {
    const d = computeOverdueBreakdown(alos(63), POLICY);
    assert.deepEqual([d.billableMinutes, d.blocks, toMajor(d.charge)], [0, 0, "0.00"]);
  });

  test("redondea los minutos hacia arriba: cobrar 7 y mostrar 6 sería mentir", () => {
    // 66 min y 30 s de estancia → 6 min 30 s vencidos − 5 de gracia = 1,5
    const v = computeSessionView(sesion(), POLICY, epochMs(T0 + 66 * MIN + 30_000));
    assert.equal(computeOverdueBreakdown(v, POLICY).billableMinutes, 2);
  });

  test("coincide siempre con computeOverdueCharge", () => {
    for (const min of [61, 63, 67, 80, 81, 110, 200]) {
      const v = alos(min);
      assert.equal(
        toMajor(computeOverdueBreakdown(v, POLICY).charge),
        toMajor(computeOverdueCharge(v, POLICY)),
      );
    }
  });
});

describe("liquidación", () => {
  test("suma el paquete y el excedente en la misma moneda", () => {
    const s = computeSettlement(fromMajor("5.00", "USD"), alos(67), POLICY);
    assert.equal(toMajor(s.packagePrice), "5.00");
    assert.equal(toMajor(s.overdue), "1.50");
    assert.equal(toMajor(s.total), "6.50");
  });

  test("sin excedente, el total es el paquete", () => {
    const s = computeSettlement(fromMajor("5.00", "USD"), alos(30), POLICY);
    assert.equal(toMajor(s.total), "5.00");
  });
});

describe("aforo (DEC-7)", () => {
  test("informa cuántos caben y cuándo está lleno", () => {
    const c = computeCapacity(8, 30);
    assert.equal(c.remaining, 22);
    assert.equal(c.isFull, false);

    const lleno = computeCapacity(30, 30);
    assert.equal(lleno.isFull, true);
    assert.equal(lleno.remaining, 0);
  });

  test("por encima del límite sigue marcando lleno, sin restos negativos", () => {
    const c = computeCapacity(33, 30);
    assert.equal(c.isFull, true);
    assert.equal(c.remaining, 0);
  });

  test("un aforo de 0 o negativo no tiene sentido y se rechaza", () => {
    assert.throws(() => computeCapacity(0, 0), RangeError);
    assert.throws(() => computeCapacity(0, -5), RangeError);
  });
});

describe("formato de duración", () => {
  test("usa horas solo cuando las hay", () => {
    assert.equal(formatDuration(0), "00:00");
    assert.equal(formatDuration(59_000), "00:59");
    assert.equal(formatDuration(90 * 1000), "01:30");
    assert.equal(formatDuration(3600 * 1000), "01:00:00");
    assert.equal(formatDuration(3661 * 1000), "01:01:01");
  });

  test("nunca devuelve tiempos negativos", () => {
    assert.equal(formatDuration(-5000), "00:00");
  });
});
