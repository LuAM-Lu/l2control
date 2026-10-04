/**
 * Pruebas de los cumpleaños — B10-1, V-10, D-EVT.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { add, fromMajor, toMajor } from "@l2/domain-money";
import { anticipoDe, anticipoValido, paqueteSobreAforo, reservaProblem, seSolapan, type EventoEnAgenda } from "./eventos.ts";

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
