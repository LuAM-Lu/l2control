/**
 * La carga de lo anotado en papel — B3-7, V-12, ADR-027.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ANTELACION_MAXIMA_MS,
  VENTANA_MAXIMA_MS,
  admiteRegistros,
  bloqueaElCierre,
  estadoAlTerminar,
  horaRealProblem,
  sePuedeRevisar,
  ventanaProblem,
} from "./index.ts";

const H = 3_600_000;
const AHORA = Date.parse("2026-10-05T18:00:00.000Z");
const TURNO = Date.parse("2026-10-05T14:00:00.000Z");
const en = (horasAntes: number) => AHORA - horasAntes * H;

describe("la ventana del corte", () => {
  test("un corte de dos horas que ya terminó sirve", () => {
    assert.equal(ventanaProblem({ desde: en(5), hasta: en(3) }, { ahora: AHORA, turnoAbiertoEn: TURNO }), null);
  });

  test("puede terminar justo ahora, pero no después", () => {
    assert.equal(ventanaProblem({ desde: en(2), hasta: AHORA }, { ahora: AHORA, turnoAbiertoEn: TURNO }), null);
    assert.equal(ventanaProblem({ desde: en(2), hasta: AHORA + 1 }, { ahora: AHORA, turnoAbiertoEn: TURNO }), "EN_EL_FUTURO");
  });

  test("el desde va antes que el hasta, y no son el mismo instante", () => {
    assert.equal(ventanaProblem({ desde: en(2), hasta: en(3) }, { ahora: AHORA, turnoAbiertoEn: TURNO }), "AL_REVES");
    assert.equal(ventanaProblem({ desde: en(2), hasta: en(2) }, { ahora: AHORA, turnoAbiertoEn: TURNO }), "AL_REVES");
  });

  test("no dura más de un día", () => {
    const largo = { ahora: AHORA, turnoAbiertoEn: AHORA - 40 * H };
    assert.equal(ventanaProblem({ desde: AHORA - VENTANA_MAXIMA_MS, hasta: AHORA }, largo), null);
    assert.equal(ventanaProblem({ desde: AHORA - VENTANA_MAXIMA_MS - 1, hasta: AHORA }, largo), "DEMASIADO_LARGA");
  });

  test("no empieza más de un día antes de abrirse el turno en que se carga", () => {
    const desde = TURNO - ANTELACION_MAXIMA_MS;
    assert.equal(ventanaProblem({ desde, hasta: desde + H }, { ahora: AHORA, turnoAbiertoEn: TURNO }), null);
    assert.equal(ventanaProblem({ desde: desde - 1, hasta: desde + H }, { ahora: AHORA, turnoAbiertoEn: TURNO }), "ANTES_DEL_TURNO");
  });

  test("lo anotado puede ser anterior al turno: sin conexión no se pudo abrir", () => {
    // El corte fue de 8:00 a 10:00 y el turno se abrió a las 10:30.
    const turno = Date.parse("2026-10-05T10:30:00.000Z");
    const ventana = { desde: Date.parse("2026-10-05T08:00:00.000Z"), hasta: Date.parse("2026-10-05T10:00:00.000Z") };
    assert.equal(ventanaProblem(ventana, { ahora: AHORA, turnoAbiertoEn: turno }), null);
  });
});

describe("la hora real de un registro", () => {
  const ventana = { desde: en(5), hasta: en(3) };

  test("dentro de la ventana vale, con los dos extremos incluidos", () => {
    assert.equal(horaRealProblem(en(4), ventana, AHORA), null);
    assert.equal(horaRealProblem(ventana.desde, ventana, AHORA), null);
    assert.equal(horaRealProblem(ventana.hasta, ventana, AHORA), null);
  });

  test("fuera de ella, se dice de qué lado", () => {
    assert.equal(horaRealProblem(ventana.desde - 1, ventana, AHORA), "ANTES_DE_LA_VENTANA");
    assert.equal(horaRealProblem(ventana.hasta + 1, ventana, AHORA), "DESPUES_DE_LA_VENTANA");
  });

  test("nada que todavía no pasó, aunque la ventana lo cubra", () => {
    // Una ventana que termina ahora admite lo de hace un minuto, no lo de dentro de uno.
    const hastaAhora = { desde: en(2), hasta: AHORA };
    assert.equal(horaRealProblem(AHORA, hastaAhora, AHORA), null);
    assert.equal(horaRealProblem(AHORA + 60_000, { desde: en(2), hasta: AHORA + 3 * H }, AHORA), "EN_EL_FUTURO");
  });
});

describe("los estados de una carga", () => {
  test("solo una carga abierta admite registros", () => {
    assert.equal(admiteRegistros("ABIERTA"), true);
    for (const e of ["CERRADA", "REVISADA", "DESCARTADA"] as const) assert.equal(admiteRegistros(e), false, e);
  });

  test("abierta o cerrada sin revisar impide el cierre; revisada o descartada, no", () => {
    assert.equal(bloqueaElCierre("ABIERTA"), true);
    assert.equal(bloqueaElCierre("CERRADA"), true);
    assert.equal(bloqueaElCierre("REVISADA"), false);
    assert.equal(bloqueaElCierre("DESCARTADA"), false);
  });

  test("supervisión revisa lo que la cajera ya terminó, y nada más", () => {
    assert.equal(sePuedeRevisar("CERRADA"), true);
    for (const e of ["ABIERTA", "REVISADA", "DESCARTADA"] as const) assert.equal(sePuedeRevisar(e), false, e);
  });

  test("terminar sin haber cargado nada la descarta: no hay qué revisar", () => {
    assert.equal(estadoAlTerminar(0), "DESCARTADA");
    assert.equal(estadoAlTerminar(1), "CERRADA");
    assert.equal(estadoAlTerminar(12), "CERRADA");
  });
});
