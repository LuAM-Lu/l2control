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
  orphanAfterMs,
  wristbandSeriesProblem,
  becomesOrphanAt,
  isOrphan,
  withRecharges,
  admits,
  computeCapacity,
  contactKey,
  documentKey,
  documentoLegible,
  telefonoLegible,
  settleAtExit,
  computeOverdueBreakdown,
  computeOverdueCharge,
  computeSessionView,
  computeSettlement,
  epochMs,
  fixed,
  formatDuration,
  openEnded,
  parkPolicy,
  paquetePorUso,
  pauseProblem,
  isWristbandless,
  nextWristbandlessNumber,
  wristbandlessCode,
  pausedMs,
  resumeProblem,
  type PaqueteDeUso,
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

describe("la salida (B4-3)", () => {
  test("sin pasarse, sale sin excedente y con sus minutos redondeados hacia arriba", () => {
    const r = settleAtExit(sesion(), POLICY, epochMs(T0 + 59 * MIN + 1));
    assert.equal(r.consumedMinutes, 60);
    assert.equal(r.penaltyBlocks, 0);
    assert.equal(toMajor(r.overdue), "0.00");
  });

  test("dentro de la gracia no se cobra; pasada, un bloque iniciado se cobra entero", () => {
    assert.equal(settleAtExit(sesion(), POLICY, epochMs(T0 + 65 * MIN)).penaltyBlocks, 0);
    const r = settleAtExit(sesion(), POLICY, epochMs(T0 + 72 * MIN));
    assert.equal(r.billableOverdueMinutes, 7);
    assert.equal(r.penaltyBlocks, 1);
    assert.equal(toMajor(r.overdue), "1.50");
  });

  test("el tiempo abierto no tiene excedente", () => {
    const r = settleAtExit(sesion({ duration: openEnded }), POLICY, epochMs(T0 + 300 * MIN));
    assert.equal(r.consumedMinutes, 300);
    assert.equal(toMajor(r.overdue), "0.00");
  });
});

describe("la entrada (B4-2)", () => {
  test("el aforo se puede llenar, no pasar; una entrada no entra a medias", () => {
    assert.equal(admits(28, 2, 30), true);
    assert.equal(admits(29, 2, 30), false);
    assert.equal(admits(30, 1, 30), false);
    assert.throws(() => admits(0, 0, 30), RangeError);
  });

  test("un teléfono escrito de cualquier manera es la misma familia", () => {
    for (const t of ["0412-1234567", "0412 123.45.67", "+58 412 1234567", "(0412)1234567"]) {
      assert.equal(contactKey(t), "04121234567", t);
    }
    assert.equal(contactKey("12a"), null);
    assert.equal(contactKey("1".repeat(21)), null);
  });

  test("una cédula o un RIF escritos de cualquier manera son el mismo cliente (B6-9)", () => {
    for (const d of ["V-12345678", "v 12.345.678", "V12345678", " v-12345678 "]) {
      assert.equal(documentKey(d), "V12345678", d);
      assert.equal(documentoLegible(d), "V-12345678", d);
    }
    assert.equal(documentoLegible("j-40123456-7"), "J-40123456-7");
    assert.equal(documentoLegible("E-81234567"), "E-81234567");
    // Sin letra, con otra letra o con muy pocos o demasiados números, no es un documento.
    for (const d of ["12345678", "X-12345678", "V-1234", "V-12345678901", ""]) assert.equal(documentKey(d), null, d);
  });

  test("un teléfono se escribe 0414-1234567, y solo uno de once dígitos lo es (B6-9)", () => {
    for (const t of ["04141234567", "0414 123.45.67", "+58 414 1234567"]) assert.equal(telefonoLegible(t), "0414-1234567", t);
    for (const t of ["1234567", "4141234567", "041412345678"]) assert.equal(telefonoLegible(t), null, t);
  });
});

describe("recarga y huérfanas (B4-3)", () => {
  test("una recarga suma sus minutos al paquete; el tiempo abierto no cambia", () => {
    assert.deepEqual(withRecharges(fixed(60), [30, 30]), fixed(120));
    assert.equal(withRecharges(openEnded, [30]), openEnded);
    assert.throws(() => withRecharges(fixed(60), [-5]), RangeError);
  });

  test("con la recarga, la tarjeta vuelve a estar en tiempo (F5-11)", () => {
    const vencida = computeSessionView(sesion(), POLICY, epochMs(T0 + 63 * MIN));
    assert.equal(vencida.status, "EN_GRACIA");
    const recargada = computeSessionView(sesion({ duration: withRecharges(fixed(60), [30]) }), POLICY, epochMs(T0 + 63 * MIN));
    assert.equal(recargada.status, "ACTIVA");
  });

  test("huérfana: abierta desde un día anterior, o más horas dentro de las del local", () => {
    const hoy = epochMs(T0 + 60 * MIN);
    const ocho = orphanAfterMs(8);
    assert.equal(isOrphan(epochMs(T0), epochMs(T0 + 2 * 60 * MIN), hoy, ocho), true); // de ayer
    assert.equal(isOrphan(epochMs(T0 + 2 * 60 * MIN), epochMs(T0 + 3 * 60 * MIN), hoy, ocho), false);
    assert.equal(isOrphan(hoy, epochMs(hoy + ocho), hoy, ocho), false);
    assert.equal(isOrphan(hoy, epochMs(hoy + ocho + 1), hoy, ocho), true);
  });

  test("las horas de una huérfana son del local: con 3, a las 3 horas y un instante ya lo es", () => {
    const hoy = epochMs(T0);
    const tres = orphanAfterMs(3);
    assert.equal(tres, 3 * 60 * MIN);
    assert.equal(isOrphan(hoy, epochMs(hoy + 3 * 60 * MIN + 1), hoy, tres), true);
    assert.equal(isOrphan(hoy, epochMs(hoy + 3 * 60 * MIN + 1), hoy, orphanAfterMs(8)), false);
    assert.throws(() => orphanAfterMs(0), RangeError);
    assert.throws(() => orphanAfterMs(2.5), RangeError);
  });

  test("cuándo pasa a huérfana: el umbral, o el cambio de día si llega antes", () => {
    const manana = epochMs(T0 + 24 * 60 * MIN);
    const ocho = orphanAfterMs(8);
    // Entra a primera hora: la alcanza el umbral.
    const temprano = epochMs(T0 + 60 * MIN);
    assert.equal(becomesOrphanAt(temprano, ocho, manana), temprano + ocho + 1);
    // Entra de noche: la alcanza el cambio de día.
    const noche = epochMs(T0 + 20 * 60 * MIN);
    assert.equal(becomesOrphanAt(noche, ocho, manana), manana);
    // Y en ese instante, `isOrphan` ya dice que sí; un milisegundo antes, que no.
    const t = becomesOrphanAt(temprano, ocho, manana);
    assert.equal(isOrphan(temprano, t, epochMs(T0), ocho), true);
    assert.equal(isOrphan(temprano, epochMs(t - 1), epochMs(T0), ocho), false);
    assert.equal(isOrphan(noche, manana, manana, ocho), true);
    assert.equal(isOrphan(noche, epochMs(manana - 1), epochMs(T0), ocho), false);
  });
});

describe("la serie de pulseras (V-1)", () => {
  test("sin fijar, vale cualquier código", () => {
    assert.equal(wristbandSeriesProblem("X9-001", { prefix: null, length: null }), null);
  });
  test("con prefijo y longitud, solo los de la serie", () => {
    const serie = { prefix: "AK-", length: 7 };
    assert.equal(wristbandSeriesProblem("AK-0042", serie), null);
    assert.equal(wristbandSeriesProblem("BK-0042", serie), "PREFIJO");
    assert.equal(wristbandSeriesProblem("AK-00421", serie), "LONGITUD");
    assert.equal(wristbandSeriesProblem("AK-042", serie), "LONGITUD");
  });
  test("se puede fijar solo uno de los dos", () => {
    assert.equal(wristbandSeriesProblem("ZZ-1", { prefix: "AK-", length: null }), "PREFIJO");
    assert.equal(wristbandSeriesProblem("ZZ-1", { prefix: null, length: 4 }), null);
  });
});

describe("salir antes de tiempo: cobrar por uso (B4-6, M-18)", () => {
  const usd = (n: number) => fromMajor(n, "USD");
  const TARIFA: PaqueteDeUso[] = [
    { name: "30 minutos", duration: fixed(30), price: usd(3) },
    { name: "1 hora", duration: fixed(60), price: usd(5) },
    { name: "2 horas", duration: fixed(120), price: usd(9) },
    { name: "Pase libre", duration: openEnded, price: usd(12) },
  ];
  const nombre = (p: PaqueteDeUso | null) => p?.name ?? null;

  test("pidió 1 hora y estuvo 25 minutos: se cobra el de 30 minutos", () => {
    assert.equal(nombre(paquetePorUso(TARIFA, 25 * MIN, 5, usd(5))), "30 minutos");
  });

  test("la gracia cuenta: 34 minutos con 5 de gracia los cubre el de 30; 36, ya no", () => {
    assert.equal(nombre(paquetePorUso(TARIFA, 34 * MIN, 5, usd(5))), "30 minutos");
    assert.equal(nombre(paquetePorUso(TARIFA, 36 * MIN, 5, usd(5))), null, "le toca la hora que pidió: no hay ajuste");
  });

  test("el pase libre también se cobra por uso, y las recargas entran en lo contratado", () => {
    assert.equal(nombre(paquetePorUso(TARIFA, 25 * MIN, 5, usd(12))), "30 minutos");
    assert.equal(nombre(paquetePorUso(TARIFA, 70 * MIN, 5, usd(10))), "2 horas", "1 hora + 1 hora de recarga, 70 min: el de 2 horas");
  });

  test("si lo contratado ya es lo más barato, no hay nada que ajustar", () => {
    assert.equal(paquetePorUso(TARIFA, 10 * MIN, 5, usd(3)), null);
    assert.equal(paquetePorUso([], 10 * MIN, 5, usd(5)), null);
  });

  test("a igual precio gana el más corto", () => {
    const iguales: PaqueteDeUso[] = [{ name: "Libre barato", duration: openEnded, price: usd(3) }, ...TARIFA];
    assert.equal(nombre(paquetePorUso(iguales, 20 * MIN, 0, usd(5))), "30 minutos");
  });
});

describe("la pausa por comida (B4-7, M-27)", () => {
  // Entró en T0 con una hora; a los 20 min sale a comer con una pausa de hasta 10.
  const pausa = (endedAtMin: number | null = null) => ({ startedAt: epochMs(T0 + 20 * MIN), endedAt: endedAtMin === null ? null : epochMs(T0 + endedAtMin * MIN), maxMinutes: 10 });

  test("mientras dura, el reloj está quieto y dice cuánto le queda a la pausa", () => {
    const s = sesion({ pause: pausa() });
    const v = alos(24, s);
    assert.equal(v.paused, true);
    assert.equal(v.pauseRemainingMs, 6 * MIN);
    assert.equal(v.elapsedMs, 20 * MIN, "se quedó en los 20 minutos de antes de salir a comer");
    assert.equal(v.remainingMs, 40 * MIN);
  });

  test("a los 10 minutos vuelve a correr sola: el tiempo de después cuenta", () => {
    const s = sesion({ pause: pausa() });
    const v = alos(45, s);
    assert.equal(v.paused, false);
    assert.equal(v.pauseRemainingMs, null);
    assert.equal(v.elapsedMs, 35 * MIN, "45 menos los 10 de la pausa");
    assert.equal(pausedMs(s.pause, epochMs(T0 + 45 * MIN)), 10 * MIN);
  });

  test("si la monitora la termina antes, solo descuenta lo que duró", () => {
    const s = sesion({ pause: pausa(26) });
    assert.equal(alos(40, s).elapsedMs, 34 * MIN);
    assert.equal(alos(40, s).paused, false);
  });

  test("terminarla después del máximo no regala más tiempo", () => {
    const s = sesion({ pause: pausa(50) });
    assert.equal(alos(60, s).elapsedMs, 50 * MIN);
  });

  test("el tiempo de más y la salida se cuentan sin la pausa", () => {
    const sin = settleAtExit(sesion(), POLICY, epochMs(T0 + 68 * MIN));
    const con = settleAtExit(sesion({ pause: pausa() }), POLICY, epochMs(T0 + 68 * MIN));
    assert.ok(sin.overdue.amount > 0n, "sin pausa se pasó de la hora y la gracia");
    assert.equal(con.overdue.amount, 0n, "con la pausa, 58 minutos: dentro de su hora");
    assert.equal(con.consumedMinutes, 58);
  });

  test("también en tiempo abierto: lo que estuvo comiendo no cuenta", () => {
    const s = sesion({ duration: openEnded, pause: pausa() });
    assert.equal(alos(60, s).elapsedMs, 50 * MIN);
  });

  test("una sola pausa por visita, y solo se termina la que sigue en curso", () => {
    assert.equal(pauseProblem(sesion()), null);
    assert.equal(pauseProblem(sesion({ pause: pausa() })), "YA_PAUSO");
    assert.equal(resumeProblem(sesion(), epochMs(T0 + 25 * MIN)), "SIN_PAUSA");
    assert.equal(resumeProblem(sesion({ pause: pausa() }), epochMs(T0 + 25 * MIN)), null);
    assert.equal(resumeProblem(sesion({ pause: pausa() }), epochMs(T0 + 31 * MIN)), "YA_TERMINO");
    assert.equal(resumeProblem(sesion({ pause: pausa(24) }), epochMs(T0 + 25 * MIN)), "YA_TERMINO");
  });
});

describe("niños sin pulsera (B4-8, M-27)", () => {
  test("el código lo pone el servidor, correlativo y con su prefijo reservado", () => {
    assert.equal(wristbandlessCode(1), "SP-00001");
    assert.equal(nextWristbandlessNumber([]), 1);
    assert.equal(nextWristbandlessNumber(["SP-00001", "AK-0009", "SP-00007", "sp-00003"]), 8);
    assert.throws(() => wristbandlessCode(0), RangeError);
  });

  test("un código con el prefijo reservado es de un niño sin pulsera", () => {
    assert.equal(isWristbandless("SP-00012"), true);
    assert.equal(isWristbandless("sp-1"), true);
    assert.equal(isWristbandless("AK-0012"), false);
  });
});
