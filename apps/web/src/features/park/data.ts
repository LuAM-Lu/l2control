/**
 * Nivel 3 — funcionalidad (§9.4): esto SÍ conoce el dominio del parque.
 *
 * DATOS DE EJEMPLO. Sustituir por la consulta real en F5. Están aquí para
 * que la pantalla abra en un estado de trabajo realista y se pueda validar
 * la interfaz con el cliente antes de que exista backend.
 */

import {
  type ParkSession,
  type ParkPolicy,
  epochMs,
  fixed,
  openEnded,
  parkPolicy,
} from "@l2/domain-park";
import { fromMajor } from "@l2/domain-money";

/** Política del parque. En producción es configuración editable (§9.9). */
export const DEMO_POLICY: ParkPolicy = parkPolicy({
  // 0 significaría "sin gracia" de forma explícita (ADR-011). Aquí, 5 min.
  graceMinutes: 5,
  penaltyBlockMinutes: 15,
  penaltyPricePerBlock: fromMajor("1.50", "USD"),
  warnBeforeMinutes: 10,
});

/** Aforo del local piloto (DEC-7). Configurable, no constante del código. */
export const DEMO_CAPACITY_LIMIT = 30;

const MIN = 60_000;

/** Genera estancias de ejemplo relativas al instante del servidor. */
export function demoSessions(now: number): ParkSession[] {
  const ago = (m: number) => epochMs(now - m * MIN);

  return [
    {
      id: "s1",
      childName: "Valentina Rojas",
      childNickname: "Vale",
      wristbandCode: "AK-0142",
      mode: "PREPAGO",
      duration: fixed(60),
      startedAt: ago(12),
    },
    {
      id: "s2",
      childName: "Mateo Guerrero",
      wristbandCode: "AK-0143",
      mode: "PREPAGO",
      duration: fixed(30),
      startedAt: ago(24),
    },
    {
      id: "s3",
      childName: "Isabella Prieto",
      childNickname: "Isa",
      wristbandCode: "AK-0147",
      mode: "PREPAGO",
      duration: fixed(60),
      startedAt: ago(58),
    },
    {
      id: "s4",
      childName: "Santiago Bermúdez",
      wristbandCode: "AK-0151",
      mode: "PREPAGO",
      duration: fixed(30),
      startedAt: ago(37),
    },
    {
      id: "s5",
      childName: "Camila Nieves",
      wristbandCode: "AK-0158",
      mode: "POSTPAGO",
      duration: openEnded,
      startedAt: ago(41),
    },
    {
      id: "s6",
      childName: "Diego Alcántara",
      childNickname: "Dieguito",
      wristbandCode: "AK-0160",
      mode: "PREPAGO",
      duration: fixed(120),
      startedAt: ago(8),
    },
    {
      id: "s7",
      childName: "Antonella Salas",
      wristbandCode: "AK-0163",
      mode: "PREPAGO",
      duration: fixed(60),
      startedAt: ago(52),
    },
    {
      id: "s8",
      childName: "Emiliano Paredes",
      wristbandCode: "AK-0171",
      mode: "POSTPAGO",
      duration: openEnded,
      startedAt: ago(6),
    },
  ];
}
