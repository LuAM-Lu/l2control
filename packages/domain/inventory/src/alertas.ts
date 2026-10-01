/**
 * El estado del stock y sus avisos — B9-5, F8-08, M-16.
 *
 * El stock mínimo de un producto es su punto de reorden: con la existencia en él o por debajo, hay
 * que reponer antes de quedarse sin nada. Tres estados y solo tres, los mismos en la tabla, en las
 * tarjetas y en Inicio: AGOTADO (no se vende, ADR-023), BAJO_MINIMO (avisa con antelación) y BIEN.
 */

export type StockStatus = "AGOTADO" | "BAJO_MINIMO" | "BIEN";

/** El estado de un producto que lleva existencia. Sin mínimo, solo se avisa cuando se agota. */
export function stockStatus(existencia: number, minimo: number | null): StockStatus {
  if (existencia <= 0) return "AGOTADO";
  if (minimo !== null && existencia <= minimo) return "BAJO_MINIMO";
  return "BIEN";
}

/** Lo que este módulo necesita de un producto para avisar. */
export type StockAlertProduct = Readonly<{ existencia: number | null; minimo: number | null; activo: boolean }>;

/**
 * Cuántos productos a la venta están agotados y cuántos bajo su mínimo. Lo apartado no avisa (no se
 * ofrece) y lo que no lleva existencia, tampoco.
 */
export function stockAlerts(productos: readonly StockAlertProduct[]): Readonly<{ agotados: number; bajoMinimo: number }> {
  let agotados = 0;
  let bajoMinimo = 0;
  for (const p of productos) {
    if (!p.activo || p.existencia === null) continue;
    const estado = stockStatus(p.existencia, p.minimo);
    if (estado === "AGOTADO") agotados++;
    else if (estado === "BAJO_MINIMO") bajoMinimo++;
  }
  return { agotados, bajoMinimo };
}
