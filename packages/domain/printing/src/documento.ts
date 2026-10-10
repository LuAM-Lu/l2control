/**
 * El ticket como documento — B5-2, F1-12.
 *
 * Una plantilla (recibo, corte, comanda) no habla de bytes: dice qué renglones lleva. Aquí se componen
 * a las columnas del papel —32 en 58 mm y 48 en 80 mm, con la letra normal de una térmica— y de esa
 * composición salen el ESC/POS (`escpos.ts`) y la vista previa de la pantalla, que así dicen lo mismo.
 *
 * Todo es texto monoespaciado: alinear es rellenar con espacios, y un renglón que no cabe se parte por
 * palabras (una palabra más larga que el renglón, por letras). Lo grande ocupa el doble de ancho: cabe
 * la mitad.
 */

/** Los dos anchos de rollo del local (DEC-8). */
export type Ancho = 58 | 80;

/** Columnas de la letra normal (12 × 24 puntos) en cada ancho: 384 y 576 puntos útiles. */
export const COLUMNAS: Readonly<Record<Ancho, number>> = { 58: 32, 80: 48 };

export type Alineacion = "IZQ" | "CENTRO" | "DER";

export type Renglon =
  | Readonly<{ tipo: "TEXTO"; texto: string; alinear?: Alineacion; negrita?: boolean; grande?: boolean }>
  /** Un concepto a la izquierda y su importe a la derecha, en el mismo renglón si caben. */
  | Readonly<{ tipo: "PAR"; izq: string; der: string; negrita?: boolean; grande?: boolean }>
  /** `_`: la línea de una firma (el vale del consumo del personal, B3-17). */
  | Readonly<{ tipo: "LINEA"; caracter?: "-" | "=" | "_" }>
  | Readonly<{ tipo: "VACIO" }>;

export type Documento = Readonly<{
  renglones: readonly Renglon[];
  /** Cortar el papel al terminar (la impresora de caja tiene cortador). Por defecto, sí. */
  cortar?: boolean;
}>;

/** Un renglón ya compuesto: el texto exacto que sale, con su estilo. */
export type RenglonCompuesto = Readonly<{ texto: string; negrita: boolean; grande: boolean }>;

/** Parte un texto en trozos de `ancho` como mucho, por palabras; una palabra más larga, por letras. */
export function partir(texto: string, ancho: number): string[] {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio === "") return [""];
  const trozos: string[] = [];
  let actual = "";
  for (const palabra of limpio.split(" ")) {
    let resto = palabra;
    while (resto.length > ancho) {
      if (actual) {
        trozos.push(actual);
        actual = "";
      }
      trozos.push(resto.slice(0, ancho));
      resto = resto.slice(ancho);
    }
    if (resto === "") continue;
    if (actual === "") actual = resto;
    else if (actual.length + 1 + resto.length <= ancho) actual = `${actual} ${resto}`;
    else {
      trozos.push(actual);
      actual = resto;
    }
  }
  if (actual) trozos.push(actual);
  return trozos;
}

function alinear(texto: string, ancho: number, a: Alineacion): string {
  const sobra = Math.max(0, ancho - texto.length);
  if (a === "DER") return " ".repeat(sobra) + texto;
  if (a === "CENTRO") return " ".repeat(Math.floor(sobra / 2)) + texto + " ".repeat(Math.ceil(sobra / 2));
  return texto + " ".repeat(sobra);
}

/** El documento compuesto a las columnas de su papel. */
export function componer(doc: Documento, ancho: Ancho): RenglonCompuesto[] {
  const cols = COLUMNAS[ancho];
  const salida: RenglonCompuesto[] = [];
  for (const r of doc.renglones) {
    const grande = (r.tipo === "TEXTO" || r.tipo === "PAR") && r.grande === true;
    const negrita = (r.tipo === "TEXTO" || r.tipo === "PAR") && r.negrita === true;
    const w = grande ? Math.floor(cols / 2) : cols;
    switch (r.tipo) {
      case "VACIO":
        salida.push({ texto: "", negrita: false, grande: false });
        break;
      case "LINEA":
        salida.push({ texto: (r.caracter ?? "-").repeat(cols), negrita: false, grande: false });
        break;
      case "TEXTO":
        for (const t of partir(r.texto, w)) salida.push({ texto: alinear(t, w, r.alinear ?? "IZQ"), negrita, grande });
        break;
      case "PAR": {
        const der = r.der.trim().slice(0, w);
        const izq = partir(r.izq, Math.max(1, w - der.length - 1));
        izq.forEach((t, i) => {
          const ultimo = i === izq.length - 1;
          salida.push({ texto: ultimo ? t + " ".repeat(Math.max(1, w - t.length - der.length)) + der : alinear(t, w, "IZQ"), negrita, grande });
        });
        break;
      }
    }
  }
  return salida;
}

/** El documento como texto plano: la vista previa y lo que comparan las pruebas. */
export function comoTexto(doc: Documento, ancho: Ancho): string {
  return componer(doc, ancho)
    .map((r) => r.texto.trimEnd())
    .join("\n");
}
