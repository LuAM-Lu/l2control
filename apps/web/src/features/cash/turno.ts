/**
 * Las denominaciones del arqueo — F4-07. Lo demás del turno (lo cobrado, las excepciones, el nombre
 * de cada medio) sale del libro del servidor desde B3-5.
 */
import { fromMajor, type Money } from "@l2/domain-money";

/** Denominaciones que circulan, para el conteo del arqueo (F4-07). */
export const DENOMINACIONES: Record<"USD" | "VES", Money[]> = {
  USD: [
    fromMajor("100.00", "USD"),
    fromMajor("50.00", "USD"),
    fromMajor("20.00", "USD"),
    fromMajor("10.00", "USD"),
    fromMajor("5.00", "USD"),
    fromMajor("1.00", "USD"),
    fromMajor("0.25", "USD"),
  ],
  VES: [
    fromMajor("500.00", "VES"),
    fromMajor("200.00", "VES"),
    fromMajor("100.00", "VES"),
    fromMajor("50.00", "VES"),
    fromMajor("20.00", "VES"),
    fromMajor("10.00", "VES"),
  ],
};
