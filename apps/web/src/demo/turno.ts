/**
 * El turno hasta que tenga servidor (B3-1 y B3-5): **sin movimientos**, no inventado.
 *
 * Hasta el 2026-09-26 había una tarde de operación de ejemplo (fondo, cobros, vueltos y
 * excepciones). Se quitó a pedido del cliente: los cortes y el Inicio enseñaban dinero que nunca
 * entró. El libro de pagos (B2-3) y el turno real (B3-1) los sustituyen y borran este archivo.
 */
import type { ShiftMovement } from "@l2/domain-cash";
import type { Excepcion } from "../features/cash/turno.ts";

export const DEMO_SHIFT_MOVEMENTS: ShiftMovement[] = [];

/** Anulaciones, cortesías y residuos del turno (F4-08): ninguna hasta B3-5. */
export const DEMO_EXCEPCIONES: Excepcion[] = [];
