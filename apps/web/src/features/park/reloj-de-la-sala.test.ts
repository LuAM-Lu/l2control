import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { EstanciaDto, MonitorSnapshotDto } from "@l2/contracts";
import { ahoraSegun, esMasNueva, horaDeLectura } from "./reloj-de-la-sala.ts";
import { toMonitorModel } from "./view-model.ts";

/**
 * El reloj de la sala (B4-13, M-34): el local vio que «a veces queda pegado y hay que recargar». Dos causas, las dos
 * de medir el tiempo con la lectura y no con el reloj: el desfase se medía al pintar (una tarjeta pintada tarde se
 * quedaba atrás) y el estado de cada niño se calculaba a la hora de la lectura (no pasaba a «cumplido» solo).
 */

const MIN = 60_000;
const T = Date.parse("2026-10-08T15:00:00.000Z");

const terminos = {
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: { minor: "200", currency: "USD" as const },
  warnBeforeMinutes: 5,
};
const estancia: EstanciaDto = {
  id: "estancia-1",
  wristbandCode: "PB-0001",
  kid: { name: "Prueba Ana" },
  mode: "PREPAGO",
  duration: { kind: "fixed", minutes: 30 },
  startedAt: new Date(T).toISOString(),
  packageId: "paquete-30",
  packagePrice: { minor: "300", currency: "USD" },
  accountId: "9b2f8c1e-0000-4000-8000-000000000001",
  guardianId: "representante-1",
  guardianName: "Prueba Pedro",
  packageName: "30 minutos",
  terms: terminos,
  recargas: [],
  porUso: [],
};
const salaLeidaA = (serverNow: number): MonitorSnapshotDto => ({
  serverNow: new Date(serverNow).toISOString(),
  policy: { ...terminos, capacityLimit: 30 },
  rate: null,
  sessions: [estancia],
  huerfanas: [],
  shiftLabel: "",
});

describe("el reloj de la sala", () => {
  test("el desfase se mide al recibir la lectura: pintada diez minutos después, marca la hora de ahora", () => {
    const equipoAlLeer = 1_000_000;
    const hora = horaDeLectura(T + 5_000, equipoAlLeer, equipoAlLeer);
    const equipoAlPintar = equipoAlLeer + 10 * MIN;
    assert.equal(ahoraSegun(hora, equipoAlPintar), T + 5_000 + 10 * MIN);
    // Lo de antes: medir al pintar con la lectura vieja dejaba el reloj en la hora de la lectura.
    const desfaseAlPintar = T + 5_000 - equipoAlPintar;
    assert.equal(equipoAlPintar + desfaseAlPintar, T + 5_000);
  });

  test("con el ida y vuelta de la petición, el desfase toma el punto medio", () => {
    assert.equal(horaDeLectura(10_000, 1_000, 1_400).desfase, 8_800);
    assert.equal(horaDeLectura(10_000, 1_000, 1_400).leidaEn, 1_400);
  });

  test("una lectura más vieja que la que se tiene no la pisa", () => {
    assert.equal(esMasNueva(T, T - 1), false);
    assert.equal(esMasNueva(T, T), true);
    assert.equal(esMasNueva(T, T + 1), true);
  });

  test("el estado de cada niño avanza con el reloj, no se queda en el de la lectura", () => {
    const sala = salaLeidaA(T + 10 * MIN);
    assert.equal(toMonitorModel(sala).cards[0]!.status, "ACTIVA");
    // La misma lectura, más tarde: por vencer a 5 minutos del final y cumplido pasada la gracia, con su excedente.
    assert.equal(toMonitorModel(sala, T + 27 * MIN).cards[0]!.status, "POR_VENCER");
    const cumplido = toMonitorModel(sala, T + 40 * MIN).cards[0]!;
    assert.equal(cumplido.status, "VENCIDA");
    assert.equal(cumplido.hasOverdueCharge, true);
    assert.equal(toMonitorModel(sala, T + 40 * MIN).serverNow, T + 40 * MIN);
  });
});
