/**
 * El catálogo de productos — F8-02, B9-1.
 *
 * Lo que se vende en el mostrador (bebidas, snacks, golosinas, café) o se añade como consumo a una
 * cuenta abierta. Dos ideas lo ordenan:
 *
 *  · **El precio es un dato con fecha**, no un número del producto. Cambiarlo programa un tramo
 *    nuevo; el anterior se queda, y lo vendido con él también. Es la misma mecánica que las
 *    alícuotas (`taxTimeline` de @l2/domain-tax): nada se reescribe, se programa lo siguiente.
 *  · **Un nombre, un producto.** Dos «Agua mineral» en la carta de la caja son un error de cobro
 *    esperando a pasar: el nombre se compara sin mayúsculas, acentos ni espacios de más.
 *
 * Todo en dólares (la moneda funcional, DEC-1): el bolívar sale de la tasa del instante del cobro.
 */
import { money, type Money } from "@l2/domain-money";

/** Un precio programado: desde cuándo vale y cuándo se programó. En unidades menores de USD. */
export type ScheduledPrice = Readonly<{
  id: string;
  productId: string;
  amountMinor: bigint;
  effectiveFrom: number;
  scheduledAt: number;
}>;

/** Un tramo del calendario de precios: el precio que rige desde `effectiveFrom` hasta `effectiveTo`. */
export type PricePeriod = ScheduledPrice & Readonly<{ effectiveTo: number | null }>;

/**
 * El precio más alto que admite un producto de mostrador: $ 10.000,00. Por encima, alguien se
 * equivocó de moneda o de unidad (tecleó bolívares, o céntimos como dólares).
 */
export const MAX_PRICE_MINOR = 1_000_000n;

/**
 * El calendario de precios de cada producto a partir de lo programado.
 *
 * Por producto, cada comienzo distinto abre un tramo que dura hasta el siguiente. Con el mismo
 * comienzo manda el programado después: así se corrige un cambio futuro sin borrar nada. Un precio
 * igual al anterior no abre tramo: programar el precio que rige para un día cancela el cambio que
 * había para ese día. Ordenado por producto y comienzo.
 */
export function priceTimeline(scheduled: readonly ScheduledPrice[]): PricePeriod[] {
  const grupos = new Map<string, Map<number, ScheduledPrice>>();
  for (const s of scheduled) {
    const porComienzo = grupos.get(s.productId) ?? new Map<number, ScheduledPrice>();
    const previo = porComienzo.get(s.effectiveFrom);
    if (!previo || s.scheduledAt > previo.scheduledAt || (s.scheduledAt === previo.scheduledAt && s.id > previo.id)) {
      porComienzo.set(s.effectiveFrom, s);
    }
    grupos.set(s.productId, porComienzo);
  }
  const tramos: PricePeriod[] = [];
  for (const productId of [...grupos.keys()].sort()) {
    const ordenados = [...grupos.get(productId)!.values()].sort((a, b) => a.effectiveFrom - b.effectiveFrom);
    const cambios = ordenados.filter((s, i) => i === 0 || s.amountMinor !== ordenados[i - 1]!.amountMinor);
    cambios.forEach((s, i) => tramos.push(Object.freeze({ ...s, effectiveTo: cambios[i + 1]?.effectiveFrom ?? null })));
  }
  return tramos;
}

/** El tramo de `productId` que rige en `at`, o `undefined` si ninguno. */
export function periodAt(periods: readonly PricePeriod[], productId: string, at: number): PricePeriod | undefined {
  return periods.find((p) => p.productId === productId && p.effectiveFrom <= at && (p.effectiveTo === null || at < p.effectiveTo));
}

/**
 * El precio de `productId` en `at`, o `null` si no tiene ninguno vigente (su primer precio empieza
 * más tarde). Sin precio no se vende: nunca se supone un cero (fail-closed).
 */
export function priceAt(periods: readonly PricePeriod[], productId: string, at: number): Money | null {
  const p = periodAt(periods, productId, at);
  return p ? money(p.amountMinor, "USD") : null;
}

/**
 * ¿Cambia algo programar `candidate`? Si el calendario del producto queda igual (ese día ya rige
 * ese precio), no se guarda: sería un asiento que no dice nada.
 */
export function changesTimeline(scheduled: readonly ScheduledPrice[], candidate: ScheduledPrice): boolean {
  const huella = (filas: readonly ScheduledPrice[]) =>
    priceTimeline(filas.filter((s) => s.productId === candidate.productId))
      .map((p) => `${p.amountMinor}@${p.effectiveFrom}-${p.effectiveTo ?? ""}`)
      .join("|");
  return huella(scheduled) !== huella([...scheduled, candidate]);
}

/** Por qué no se puede programar un precio. */
export type PriceProblem = "NO_POSITIVO" | "EXCESIVO" | "EN_EL_PASADO";

/**
 * ¿Se puede programar este precio ahora? Mayor que cero (lo que se regala es una cortesía, con su
 * motivo y su firma, no un precio cero), dentro del tope y nunca hacia atrás: lo ya vendido se
 * queda con el precio que tenía. `null` si se puede.
 */
export function priceProblem(p: Pick<ScheduledPrice, "amountMinor" | "effectiveFrom">, now: number): PriceProblem | null {
  if (p.amountMinor <= 0n) return "NO_POSITIVO";
  if (p.amountMinor > MAX_PRICE_MINOR) return "EXCESIVO";
  if (p.effectiveFrom < now) return "EN_EL_PASADO";
  return null;
}

/**
 * La forma de un nombre para compararlo: sin espacios de más, sin mayúsculas y sin acentos. «Café
 * con leche», «cafe  con leche» y « CAFÉ CON LECHE » son el mismo producto.
 */
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lo mínimo de un producto que el dominio necesita para decidir. */
export type CatalogProduct = Readonly<{ id: string; name: string; category: string; active: boolean }>;

/**
 * ¿Choca `name` con otro producto del catálogo? Cuenta también un producto que ya no se vende: se
 * vuelve a poner a la venta en vez de crear otro con el mismo nombre. `exceptId` es el propio
 * producto cuando se renombra. Devuelve el que choca, o `undefined`.
 */
export function nameClash<P extends CatalogProduct>(products: readonly P[], name: string, exceptId?: string): P | undefined {
  const clave = nameKey(name);
  return products.find((p) => p.id !== exceptId && nameKey(p.name) === clave);
}

/**
 * Lo que la caja puede vender en `at`: activo y con precio vigente, con ese precio. Conserva el
 * orden en que llegan. Un producto activo sin precio todavía (su primer precio es para mañana) no
 * se ofrece.
 */
export function sellableAt<P extends CatalogProduct>(
  products: readonly P[],
  periods: readonly PricePeriod[],
  at: number,
): (P & Readonly<{ price: Money }>)[] {
  const vendibles: (P & Readonly<{ price: Money }>)[] = [];
  for (const p of products) {
    if (!p.active) continue;
    const price = priceAt(periods, p.id, at);
    if (price) vendibles.push({ ...p, price });
  }
  return vendibles;
}

/**
 * Las categorías de una lista de productos, en el orden en que aparece cada una y sin repetir
 * (comparadas como los nombres). La caja arma sus pestañas con esto: una categoría existe si hay
 * algo que vender en ella, no porque alguien la escribiera en una lista del código.
 */
export function categoriesOf(products: readonly Pick<CatalogProduct, "category">[]): string[] {
  const vistas = new Set<string>();
  const categorias: string[] = [];
  for (const p of products) {
    const clave = nameKey(p.category);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    categorias.push(p.category.trim().replace(/\s+/g, " "));
  }
  return categorias;
}
