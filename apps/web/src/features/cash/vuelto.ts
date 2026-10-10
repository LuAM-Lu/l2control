import type { ParteDelVueltoDto } from "@l2/contracts";
import type { Money } from "@l2/domain-money";

/**
 * Cómo se da el vuelto en la caja — B3-19 (M-37, U-12). Por defecto, todo en efectivo $ (como siempre); si no, en
 * efectivo Bs, por Pago Móvil o repartido: los dólares enteros en billetes y el resto en bolívares (en efectivo o por
 * Pago Móvil). Los bolívares los calcula el servidor a la tasa del cobro.
 */
export type FormaDelVuelto = Readonly<{
  tipo: "USD" | "VES" | "MOVIL" | "REPARTIDO";
  /** Repartido: cuántos dólares enteros van en billetes. */
  dolares: number;
  /** Repartido: en qué va el resto. */
  restoEn: "VES" | "MOVIL";
  /** Por Pago Móvil: el banco del cliente y la referencia del envío. */
  movil: Readonly<{ banco: string; referencia: string }> | null;
}>;

export const VUELTO_EN_DOLARES: FormaDelVuelto = { tipo: "USD", dolares: 0, restoEn: "VES", movil: null };

/** Las partes del vuelto para el cobro; `undefined` si va todo en efectivo $ (el servidor lo da por hecho). */
export function partesDelVuelto(forma: FormaDelVuelto, sobra: Money): ParteDelVueltoDto[] | undefined {
  if (sobra.amount <= 0n || forma.tipo === "USD") return undefined;
  const parte = (method: ParteDelVueltoDto["method"], minor: bigint): ParteDelVueltoDto => ({
    method,
    enDolares: { minor: String(minor), currency: "USD" },
    ...(method === "PAGO_MOVIL" && forma.movil ? { referencia: forma.movil.referencia, banco: forma.movil.banco } : {}),
  });
  if (forma.tipo === "VES") return [parte("EFECTIVO_VES", sobra.amount)];
  if (forma.tipo === "MOVIL") return [parte("PAGO_MOVIL", sobra.amount)];
  const enteros = BigInt(Math.max(0, Math.min(forma.dolares, Number(sobra.amount / 100n)))) * 100n;
  const resto = sobra.amount - enteros;
  return [
    ...(enteros > 0n ? [parte("EFECTIVO_USD", enteros)] : []),
    ...(resto > 0n ? [parte(forma.restoEn === "VES" ? "EFECTIVO_VES" : "PAGO_MOVIL", resto)] : []),
  ];
}

/** Lo que falta para dar el vuelto así, o `null`: el Pago Móvil, su banco y su referencia. */
export function faltaEnElVuelto(forma: FormaDelVuelto, sobra: Money): string | null {
  const partes = partesDelVuelto(forma, sobra) ?? [];
  if (partes.some((p) => p.method === "PAGO_MOVIL") && !(forma.movil && /^\d{4}$/.test(forma.movil.banco) && /^\d{4,20}$/.test(forma.movil.referencia))) {
    return "Falta el banco y la referencia del Pago Móvil del vuelto";
  }
  return null;
}

/** «en $», «en Bs», «Pago Móvil» o «repartido»: lo que dice el botón del vuelto. */
export function etiquetaDelVuelto(forma: FormaDelVuelto): string {
  return { USD: "en $", VES: "en Bs", MOVIL: "Pago Móvil", REPARTIDO: "repartido" }[forma.tipo];
}
