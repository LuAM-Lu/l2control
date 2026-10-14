/**
 * Anular por estado — B3-25 (M-39, X-2). Lo puro: cuándo un plato enviado se anula sin el PIN de supervisión y cuándo un
 * pedido es el mismo que se acaba de enviar.
 *
 * Como en Toast, Square y Lightspeed: lo que no salió se quita sin más (la regla de la cuenta, v0.131.1); lo que salió
 * se anula con su motivo. Quien lo pidió lo anula sin PIN en los primeros 2 minutos (se equivocó al tocar); después, o si
 * es otra persona, con el PIN de supervisión. Y pedir para la misma cuenta lo mismo de hace menos de 2 minutos pide
 * confirmarlo: es casi siempre un toque doble o dos equipos pidiendo lo mismo.
 */

/** Los primeros minutos en que quien pidió un plato lo anula sin PIN. */
export const VENTANA_SIN_PIN_MS = 2 * 60_000;
/** Cuánto tiempo un pedido igual al anterior pide confirmarse. */
export const VENTANA_REPETIDO_MS = 2 * 60_000;

/** ¿Se anula sin PIN? Solo quien lo pidió, y dentro de su ventana. */
export function anularSinPin(pedido: Readonly<{ porId: string | null; en: number }>, quien: string | null | undefined, ahora: number): boolean {
  if (pedido.porId === null || !quien || pedido.porId !== quien) return false;
  const pasado = ahora - pedido.en;
  return pasado >= 0 && pasado <= VENTANA_SIN_PIN_MS;
}

type Plato = Readonly<{ productId: string; cantidad: number }>;

const porProducto = (lineas: readonly Plato[]) => {
  const m = new Map<string, number>();
  for (const l of lineas) m.set(l.productId, (m.get(l.productId) ?? 0) + l.cantidad);
  return m;
};

/** ¿Es el mismo pedido que el anterior de esa cuenta, de hace menos de 2 minutos? Los mismos platos, en las mismas cantidades. */
export function pedidoRepetido(nuevo: readonly Plato[], anterior: Readonly<{ lineas: readonly Plato[]; en: number }> | null, ahora: number): boolean {
  if (!anterior) return false;
  const pasado = ahora - anterior.en;
  if (pasado < 0 || pasado > VENTANA_REPETIDO_MS) return false;
  const a = porProducto(nuevo);
  const b = porProducto(anterior.lineas);
  return a.size === b.size && [...a].every(([id, n]) => b.get(id) === n);
}
