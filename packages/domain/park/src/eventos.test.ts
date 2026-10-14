/**
 * Pruebas de los cumpleaños — B10-1, V-10, D-EVT.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { add, fromMajor, toMajor } from "@l2/domain-money";
import {
  anticipoDe,
  anticipoValido,
  fraseDeGuardados,
  horaComercial,
  lugaresDeCumpleanos,
  paqueteSobreAforo,
  puertaParaVisitas,
  reservaProblem,
  seSolapan,
  type CumpleanosEnLaPuerta,
  type EventoEnAgenda,
} from "./eventos.ts";

describe("el anticipo (D-EVT)", () => {
  test("el 50 % de un paquete de $ 150: $ 75 de anticipo y $ 75 de saldo", () => {
    const { anticipo, saldo } = anticipoDe(fromMajor("150", "USD"), 5000);
    assert.equal(toMajor(anticipo), "75.00");
    assert.equal(toMajor(saldo), "75.00");
  });

  test("con céntimos impares redondea el anticipo y el saldo cuadra al céntimo", () => {
    const precio = fromMajor("99.99", "USD");
    const { anticipo, saldo } = anticipoDe(precio, 5000);
    assert.equal(toMajor(anticipo), "50.00");
    assert.equal(toMajor(saldo), "49.99");
    assert.deepEqual(add(anticipo, saldo), precio);
  });

  test("es configurable: el 30 % de $ 200 son $ 60, y el 100 % es el paquete entero", () => {
    assert.equal(toMajor(anticipoDe(fromMajor("200", "USD"), 3000).anticipo), "60.00");
    const entero = anticipoDe(fromMajor("200", "USD"), 10_000);
    assert.equal(toMajor(entero.anticipo), "200.00");
    assert.equal(toMajor(entero.saldo), "0.00");
  });

  test("un porcentaje fuera de 0,01 % a 100 % es un error, no un anticipo", () => {
    for (const bps of [0, -1, 10_001, 50.5]) assert.throws(() => anticipoDe(fromMajor("10", "USD"), bps), RangeError);
  });

  test("un anticipo vale si es más de cero y no pasa del paquete", () => {
    assert.equal(anticipoValido(fromMajor("0.01", "USD"), fromMajor("10", "USD")), true);
    assert.equal(anticipoValido(fromMajor("0", "USD"), fromMajor("10", "USD")), false);
    assert.equal(anticipoValido(fromMajor("10.01", "USD"), fromMajor("10", "USD")), false);
  });
});

describe("la reserva (V-10)", () => {
  const paquete = { minInvitados: 10, maxInvitados: 25 };
  const tarde: EventoEnAgenda = { fecha: "2026-10-10", inicio: 15 * 60, fin: 18 * 60, invitados: 20 };
  const base = { reserva: tarde, hoy: "2026-10-03", paquete, otros: [], aforo: 30 };

  test("una reserva dentro de todo se acepta", () => {
    assert.equal(reservaProblem(base), null);
  });

  test("hoy se puede reservar; ayer, no", () => {
    assert.equal(reservaProblem({ ...base, hoy: "2026-10-10" }), null);
    assert.equal(reservaProblem({ ...base, hoy: "2026-10-11" }), "FECHA_PASADA");
  });

  test("el horario empieza antes de terminar y cabe en el día", () => {
    for (const [inicio, fin] of [[18 * 60, 15 * 60], [15 * 60, 15 * 60], [-1, 60], [23 * 60, 24 * 60 + 1]] as const) {
      assert.equal(reservaProblem({ ...base, reserva: { ...tarde, inicio, fin } }), "HORARIO_INVALIDO");
    }
  });

  test("los invitados, entre el mínimo y el máximo del paquete", () => {
    assert.equal(reservaProblem({ ...base, reserva: { ...tarde, invitados: 10 } }), null);
    assert.equal(reservaProblem({ ...base, reserva: { ...tarde, invitados: 25 } }), null);
    assert.equal(reservaProblem({ ...base, reserva: { ...tarde, invitados: 9 } }), "INVITADOS_FUERA_DEL_PAQUETE");
    assert.equal(reservaProblem({ ...base, reserva: { ...tarde, invitados: 26 } }), "INVITADOS_FUERA_DEL_PAQUETE");
  });

  test("dos eventos a la misma hora no pasan juntos del aforo; uno después del otro, sí caben", () => {
    const manana: EventoEnAgenda = { fecha: "2026-10-10", inicio: 10 * 60, fin: 15 * 60, invitados: 25 };
    const solapado: EventoEnAgenda = { fecha: "2026-10-10", inicio: 17 * 60, fin: 19 * 60, invitados: 11 };
    assert.equal(reservaProblem({ ...base, otros: [manana] }), null, "termina justo cuando empieza este");
    assert.equal(reservaProblem({ ...base, otros: [solapado] }), "AFORO_DEL_HORARIO");
    assert.equal(reservaProblem({ ...base, otros: [{ ...solapado, invitados: 10 }] }), null, "20 + 10 = 30, el aforo justo");
    assert.equal(reservaProblem({ ...base, otros: [{ ...solapado, fecha: "2026-10-11" }] }), null, "otro día");
  });

  test("solaparse es compartir algún minuto del mismo día", () => {
    assert.equal(seSolapan(tarde, { ...tarde, inicio: 17 * 60 + 59, fin: 20 * 60 }), true);
    assert.equal(seSolapan(tarde, { ...tarde, inicio: 18 * 60, fin: 20 * 60 }), false);
  });

  test("un paquete cuyo máximo pasa del aforo se señala", () => {
    const paquetes = [{ id: "a", maxInvitados: 20 }, { id: "b", maxInvitados: 31 }];
    assert.equal(paqueteSobreAforo(paquetes, 30)?.id, "b");
    assert.equal(paqueteSobreAforo(paquetes, 31), null);
  });
});

describe("el aforo del cumpleaños y el exclusivo (B10-4, M-39, X-12)", () => {
  const MIN = 60_000;
  const AHORA = Date.UTC(2026, 9, 17, 19, 0);
  const sofia: CumpleanosEnLaPuerta = { id: "s", nombre: "Sofía", empiezaEn: AHORA + 20 * MIN, terminaEn: AHORA + 200 * MIN, invitados: 15, entraron: 0, exclusivo: false };

  test("aforo 30 y un cumpleaños de 15 que empieza en 20 minutos: la entrada normal admite 15", () => {
    const lugares = lugaresDeCumpleanos([sofia], AHORA);
    assert.equal(lugares.guardados, 15);
    assert.deepEqual(puertaParaVisitas({ dentro: 0, entran: 15, aforo: 30, lugares }), { admite: true });
    assert.deepEqual(puertaParaVisitas({ dentro: 0, entran: 16, aforo: 30, lugares }), { admite: false, motivo: "AFORO", libres: 15 });
  });

  test("antes de los 30 minutos no guarda nada; al terminar, tampoco", () => {
    assert.equal(lugaresDeCumpleanos([sofia], AHORA - 11 * MIN).guardados, 0, "a 31 minutos de empezar");
    assert.equal(lugaresDeCumpleanos([sofia], AHORA - 10 * MIN).guardados, 15, "a 30 minutos justos");
    assert.equal(lugaresDeCumpleanos([sofia], sofia.terminaEn).guardados, 0);
  });

  test("guarda solo el lugar de quien no ha llegado, y nunca contra sus propios invitados", () => {
    const lugares = lugaresDeCumpleanos([{ ...sofia, entraron: 8 }], AHORA);
    assert.equal(lugares.guardados, 7);
    assert.equal(fraseDeGuardados(lugares), "7 guardados para el cumpleaños de Sofía");
    assert.equal(lugaresDeCumpleanos([sofia], AHORA, "s").guardados, 0, "los invitados de Sofía entran a sus lugares");
    assert.equal(lugaresDeCumpleanos([{ ...sofia, entraron: 20 }], AHORA).guardados, 0, "con más de los reservados, nada");
  });

  test("con varios, la frase los nombra a todos", () => {
    const pedro = { ...sofia, id: "p", nombre: "Pedro", invitados: 2 };
    const lugares = lugaresDeCumpleanos([sofia, pedro], AHORA);
    assert.equal(fraseDeGuardados(lugares), "17 guardados para los cumpleaños de Sofía y Pedro");
    assert.equal(fraseDeGuardados(lugaresDeCumpleanos([{ ...pedro, invitados: 1 }], AHORA)), "1 guardado para el cumpleaños de Pedro");
  });

  test("con uno exclusivo en curso no entra ninguna visita normal; antes de su hora, sí (con los lugares guardados)", () => {
    const exclusivo = { ...sofia, exclusivo: true };
    const enCurso = lugaresDeCumpleanos([exclusivo], AHORA + 30 * MIN);
    assert.equal(enCurso.exclusivo?.id, "s");
    assert.deepEqual(puertaParaVisitas({ dentro: 0, entran: 1, aforo: 30, lugares: enCurso }), { admite: false, motivo: "EXCLUSIVO", libres: 0 });
    const antes = lugaresDeCumpleanos([exclusivo], AHORA);
    assert.equal(antes.exclusivo, null);
    assert.deepEqual(puertaParaVisitas({ dentro: 0, entran: 1, aforo: 30, lugares: antes }), { admite: true });
    assert.equal(lugaresDeCumpleanos([exclusivo], AHORA + 30 * MIN, "s").exclusivo, null, "sus invitados sí entran");
  });

  test("un exclusivo no se reserva encima de otro cumpleaños, ni otro encima de él", () => {
    const tarde: EventoEnAgenda = { fecha: "2026-10-17", inicio: 15 * 60, fin: 18 * 60, invitados: 10 };
    const paquete = { minInvitados: 1, maxInvitados: 30 };
    const comun = { hoy: "2026-10-14", paquete, aforo: 30 };
    assert.equal(reservaProblem({ ...comun, reserva: { ...tarde, exclusivo: true }, otros: [{ ...tarde, inicio: 17 * 60, fin: 19 * 60 }] }), "HORARIO_EXCLUSIVO");
    assert.equal(reservaProblem({ ...comun, reserva: tarde, otros: [{ ...tarde, exclusivo: true }] }), "HORARIO_EXCLUSIVO");
    assert.equal(reservaProblem({ ...comun, reserva: tarde, otros: [{ ...tarde, inicio: 18 * 60, fin: 20 * 60, exclusivo: true }] }), null, "uno después del otro");
  });

  test("la hora comercial", () => {
    assert.equal(horaComercial(18 * 60), "6:00 pm");
    assert.equal(horaComercial(12 * 60 + 5), "12:05 pm");
    assert.equal(horaComercial(30), "12:30 am");
  });
});
