/**
 * Lo que identifica un producto y de qué tipo es — B9-6, M-16.
 *
 *  · **Tipo:** un PRODUCTO se cuenta (refrescos, golosinas, juguetes); un PREPARADO se hace al momento
 *    (café, tequeños; sin existencia hasta que lleguen las recetas, después del piloto); un SERVICIO
 *    no es una cosa (alquiler del local, paquetes). Solo el PRODUCTO lleva existencia y código de barras.
 *  · **SKU:** el código interno, que pone el servidor y no cambia: las tres primeras letras de la
 *    categoría y un correlativo, «BEB-0001». Lo citan los conteos, las listas y la gente.
 *  · **Código de barras:** el del empaque, para leerlo en la caja, las entradas y el conteo. Si es un
 *    EAN o un UPC, su dígito de control tiene que cuadrar: una lectura torcida no se guarda.
 */

export const PRODUCT_KINDS = ["PRODUCTO", "PREPARADO", "SERVICIO"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

/** Si el tipo lleva existencia (y por tanto código de barras, entradas y conteo). */
export const kindTracksStock = (k: ProductKind): boolean => k === "PRODUCTO";

/**
 * El prefijo del SKU: las tres primeras letras de la categoría, sin acentos ni lo que no sea letra,
 * en mayúsculas, y con X si no llega a tres («Té» → «TEX»). La migración de B9-6 rellenó con lo mismo.
 */
export function skuPrefix(category: string): string {
  const letras = category
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return letras.slice(0, 3).padEnd(3, "X");
}

/** El siguiente SKU de un prefijo, dados los que ya existen (de cualquier prefijo). */
export function nextSku(prefix: string, existing: readonly string[]): string {
  const patron = new RegExp(`^${prefix}-(\\d{4,6})$`);
  let max = 0;
  for (const s of existing) {
    const n = patron.exec(s)?.[1];
    if (n !== undefined) max = Math.max(max, Number(n));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/** Un código leído o tecleado, como se guarda: sin espacios y en mayúsculas. */
export const normalizeBarcode = (raw: string): string => raw.replace(/\s+/g, "").toUpperCase();

export type BarcodeProblem = "FORMATO" | "DIGITO_DE_CONTROL";

/**
 * Qué tiene mal un código de barras, o `null`. De 4 a 32 caracteres (dígitos, letras y guiones). Si
 * son 8, 12, 13 o 14 dígitos es un GTIN (EAN-8, UPC-A, EAN-13, ITF-14) y su último dígito tiene que
 * ser el de control: así se cae una lectura que se saltó una barra.
 */
export function barcodeProblem(code: string): BarcodeProblem | null {
  if (!/^[0-9A-Z-]{4,32}$/.test(code)) return "FORMATO";
  if (/^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length)) {
    const digitos = [...code].map(Number);
    const control = digitos.pop()!;
    // Desde la derecha, pesos 3, 1, 3, 1…
    const suma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
    if ((10 - (suma % 10)) % 10 !== control) return "DIGITO_DE_CONTROL";
  }
  return null;
}
