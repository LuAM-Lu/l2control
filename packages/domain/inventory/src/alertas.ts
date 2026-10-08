/**
 * El estado del stock y sus avisos — B9-5, F8-08, M-16; el arranque, B9-7 (M-28).
 *
 * El stock mínimo de un producto es su punto de reorden: con la existencia en él o por debajo, hay
 * que reponer antes de quedarse sin nada. Cuatro estados y solo cuatro, los mismos en la tabla, en las
 * tarjetas y en Inicio: SIN_INICIAL (todavía no se contó: el catálogo se cargó sin existencias y su
 * inventario inicial falta), AGOTADO (se acabó), BAJO_MINIMO (avisa con antelación) y BIEN. Ni el primero
 * ni el segundo se venden (ADR-023), pero no piden lo mismo: uno se cuenta, el otro se repone.
 */

export type StockStatus = "SIN_INICIAL" | "AGOTADO" | "BAJO_MINIMO" | "BIEN";

/**
 * El estado de un producto que lleva existencia. `iniciado` dice si su existencia ya arrancó en la
 * sucursal (su inventario inicial, una entrada o un conteo, aunque fuera de cero). Sin mínimo, solo se
 * avisa cuando se agota.
 */
export function stockStatus(existencia: number, minimo: number | null, iniciado: boolean): StockStatus {
  if (existencia <= 0) return iniciado ? "AGOTADO" : "SIN_INICIAL";
  if (minimo !== null && existencia <= minimo) return "BAJO_MINIMO";
  return "BIEN";
}

/** Lo que este módulo necesita de un producto para avisar. */
export type StockAlertProduct = Readonly<{ existencia: number | null; minimo: number | null; activo: boolean; iniciado: boolean }>;

/**
 * Cuántos productos a la venta están sin inventario inicial, cuántos agotados y cuántos bajo su
 * mínimo. Lo apartado no avisa (no se ofrece) y lo que no lleva existencia, tampoco.
 */
export function stockAlerts(productos: readonly StockAlertProduct[]): Readonly<{ sinInicial: number; agotados: number; bajoMinimo: number }> {
  let sinInicial = 0;
  let agotados = 0;
  let bajoMinimo = 0;
  for (const p of productos) {
    if (!p.activo || p.existencia === null) continue;
    const estado = stockStatus(p.existencia, p.minimo, p.iniciado);
    if (estado === "SIN_INICIAL") sinInicial++;
    else if (estado === "AGOTADO") agotados++;
    else if (estado === "BAJO_MINIMO") bajoMinimo++;
  }
  return { sinInicial, agotados, bajoMinimo };
}
