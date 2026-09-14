/**
 * L2 Control — Ciclo de vida de la comanda.
 * Implementa §6.5 del plan y F6-08.
 *
 *   ENVIADO → EN_PREPARACION → LISTO → ENTREGADO
 *   ANULADO desde cualquiera, con motivo y autorización
 *
 * El BORRADOR no está aquí: vive en la tablet del mesero y la cocina no lo ve
 * (FLUJOS §2, flujo C). Esta máquina empieza cuando el pedido se envía.
 *
 * Reglas que este módulo IMPONE:
 *
 *  1. Solo se avanza hacia delante. Un evento repetido o que llega tarde —la
 *     cocina lo marcó listo y después llega un «aceptado» retrasado— no hace
 *     retroceder la comanda: se rechaza con su motivo.
 *  2. Se puede marcar listo algo que la cocina nunca «aceptó»: en hora punta
 *     un plato rápido sale sin pasar por la pantalla, y negarlo empuja a la
 *     cocina a tocar dos botones seguidos para nada.
 *  3. No se sirve lo que no está listo.
 *  4. ANULADO es final. Anular después de LISTO obliga a revertir inventario,
 *     porque en LISTO ya se descontó (ADR-012).
 *  5. Una anulación de algo que la cocina ya vio queda PENDIENTE DE VER hasta
 *     que alguien en cocina lo confirma: un plato que se sigue cocinando porque
 *     nadie vio la anulación es comida tirada (FLUJOS C5).
 *
 * Puro: sin reloj, sin E/S. El instante, si hace falta, entra como argumento.
 */

export type EstadoComanda = "ENVIADO" | "EN_PREPARACION" | "LISTO" | "ENTREGADO" | "ANULADO";

export type Transicion = "ACEPTAR" | "MARCAR_LISTO" | "ENTREGAR" | "ANULAR";

export type ResultadoTransicion =
  | Readonly<{ ok: true; estado: EstadoComanda; requiereReversion: boolean }>
  | Readonly<{ ok: false; motivo: string }>;

const DESTINO: Readonly<Record<Transicion, EstadoComanda>> = {
  ACEPTAR: "EN_PREPARACION",
  MARCAR_LISTO: "LISTO",
  ENTREGAR: "ENTREGADO",
  ANULAR: "ANULADO",
};

/** Desde qué estados es válida cada transición. */
const ORIGENES: Readonly<Record<Transicion, readonly EstadoComanda[]>> = {
  ACEPTAR: ["ENVIADO"],
  MARCAR_LISTO: ["ENVIADO", "EN_PREPARACION"],
  ENTREGAR: ["LISTO"],
  ANULAR: ["ENVIADO", "EN_PREPARACION", "LISTO", "ENTREGADO"],
};

const NOMBRE: Readonly<Record<EstadoComanda, string>> = {
  ENVIADO: "en cola",
  EN_PREPARACION: "en preparación",
  LISTO: "lista",
  ENTREGADO: "entregada",
  ANULADO: "anulada",
};

export function transicionar(actual: EstadoComanda, t: Transicion): ResultadoTransicion {
  if (actual === "ANULADO") {
    return { ok: false, motivo: "La comanda está anulada: no admite más cambios" };
  }
  if (!ORIGENES[t].includes(actual)) {
    const pedido: Readonly<Record<Transicion, string>> = {
      ACEPTAR: "empezarla",
      MARCAR_LISTO: "marcarla lista",
      ENTREGAR: "servirla",
      ANULAR: "anularla",
    };
    return { ok: false, motivo: `La comanda ya está ${NOMBRE[actual]}: no se puede ${pedido[t]}` };
  }
  return {
    ok: true,
    estado: DESTINO[t],
    requiereReversion: t === "ANULAR" && (actual === "LISTO" || actual === "ENTREGADO"),
  };
}

/**
 * ¿La cocina tiene que confirmar que vio esta anulación?
 * Solo si la comanda ya estaba en sus manos. Una anulada estando en cola la
 * quita la pantalla sin más: nadie empezó a cocinarla.
 */
export function anulacionRequiereConfirmacion(estadoAlAnular: EstadoComanda): boolean {
  return estadoAlAnular === "EN_PREPARACION" || estadoAlAnular === "LISTO";
}

/* ─────────────────────────────────────────── espera en cocina ── */

export type UmbralEspera = Readonly<{
  /** Minutos a partir de los que la comanda «tarda». */
  avisoMin: number;
  /** Minutos a partir de los que la comanda «grita» (§8.5, FLUJOS C4). */
  gritaMin: number;
}>;

export type NivelEspera = "A_TIEMPO" | "TARDA" | "ATRASADA";

export class UmbralInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UmbralInvalidoError";
  }
}

/** Nivel de espera de una comanda. El umbral es configurable, no una constante (§8.5). */
export function nivelEspera(esperaMs: number, umbral: UmbralEspera): NivelEspera {
  if (!(umbral.avisoMin > 0) || !(umbral.gritaMin > umbral.avisoMin)) {
    throw new UmbralInvalidoError("El umbral de «grita» tiene que ser mayor que el de aviso, y los dos positivos");
  }
  const min = Math.max(0, esperaMs) / 60_000;
  if (min >= umbral.gritaMin) return "ATRASADA";
  if (min >= umbral.avisoMin) return "TARDA";
  return "A_TIEMPO";
}
