import { fromMajor, zero, type Money } from "@l2/domain-money";

/**
 * Un importe como lo teclea una persona en Venezuela, en unidades menores. Con coma, la coma es
 * el decimal y los puntos son miles («1.500,50»); sin coma, el punto es el decimal. Vacío = cero;
 * `null` si no es un importe.
 */
export function importeTecleado(texto: string, moneda: "USD" | "VES"): Money | null {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return zero(moneda);
  if (!/^[\d.,]+$/.test(t)) return null;
  try {
    return fromMajor(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t, moneda);
  } catch {
    return null;
  }
}
