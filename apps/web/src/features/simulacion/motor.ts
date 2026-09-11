/**
 * El reloj del simulador — F1-19.
 *
 * Funciones puras: el instante real entra como argumento, igual que en el
 * dominio (ADR-010). El tiempo simulado se calcula desde un ANCLA —un par
 * «instante real, instante simulado»— y la velocidad. Cambiar la velocidad o
 * pausar reancla, así que el tiempo simulado nunca salta hacia atrás.
 */
import type { OperationEventDto } from "@l2/contracts";

export type Reloj = Readonly<{
  velocidad: number;
  pausado: boolean;
  anclaReal: number;
  anclaSimulada: number;
}>;

export function arrancar(inicioSimulado: number, velocidad: number, ahoraReal: number): Reloj {
  return { velocidad, pausado: false, anclaReal: ahoraReal, anclaSimulada: inicioSimulado };
}

export function ahoraSimulado(r: Reloj, ahoraReal: number): number {
  return r.pausado ? r.anclaSimulada : r.anclaSimulada + (ahoraReal - r.anclaReal) * r.velocidad;
}

export function conVelocidad(r: Reloj, velocidad: number, ahoraReal: number): Reloj {
  return { ...r, velocidad, anclaReal: ahoraReal, anclaSimulada: ahoraSimulado(r, ahoraReal) };
}

export function pausar(r: Reloj, ahoraReal: number): Reloj {
  return { ...r, pausado: true, anclaReal: ahoraReal, anclaSimulada: ahoraSimulado(r, ahoraReal) };
}

export function reanudar(r: Reloj, ahoraReal: number): Reloj {
  return { ...r, pausado: false, anclaReal: ahoraReal };
}

/**
 * Los eventos que ya tocan: desde el índice `desde` hasta el instante
 * simulado `limite`. Devuelve el nuevo índice para la próxima vuelta.
 */
export function vencidos(
  eventos: readonly OperationEventDto[],
  desde: number,
  limite: number,
): { nuevos: readonly OperationEventDto[]; indice: number } {
  let i = desde;
  while (i < eventos.length && Date.parse(eventos[i]!.at) <= limite) i += 1;
  return { nuevos: eventos.slice(desde, i), indice: i };
}
