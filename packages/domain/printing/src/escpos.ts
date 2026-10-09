/**
 * El ESC/POS que entiende la impresora térmica — B5-2, ADR-026.
 *
 * Lo hablan casi todas las térmicas (Epson, Xprinter, 3nStar, Bixolon…), así que se usa solo lo común:
 * iniciar (ESC @), apagar el modo chino (FS .), la página de códigos 850 (ESC t 2) para las tildes, la eñe,
 * «¿» y «¡», negrita (ESC E), tamaño doble (GS !), avanzar (ESC d) y cortar dejando una pestaña (GS V 66). Un
 * carácter que la página 850 no tiene sale como «?»: un ticket con un signo raro se lee; uno con bytes basura, no.
 *
 * El modo chino: muchas térmicas genéricas salen de fábrica con él encendido. Ahí cada byte por encima de 0x7F se
 * junta con el siguiente y sale un ideograma: las tildes desaparecen, se comen la letra de al lado y el renglón se
 * descuadra (lo vio el local, M-34, S-21). Las que no lo tienen ignoran FS ., así que se manda siempre.
 *
 * Y una pregunta: el estado del papel (DLE EOT 4). La impresora responde con un byte; el agente lo lee
 * antes de imprimir y `problemaDePapel` dice si hay que parar.
 */
import { COLUMNAS, componer, partir, type Ancho, type Documento } from "./documento.ts";

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
const LF = 0x0a;

/**
 * Las páginas de códigos que se ofrecen (B5-4, M-34): la que entiende una impresora depende del modelo, y el número
 * con que se elige (ESC t n) también. Se eligen en la ficha de la impresora, con «Probar acentos». Los números son los
 * de Epson, que siguen casi todas las genéricas.
 */
export const PAGINAS = ["PC850", "PC858", "WPC1252", "PC437"] as const;
export type PaginaDeCodigos = (typeof PAGINAS)[number];

export const NUMERO_DE_PAGINA: Readonly<Record<PaginaDeCodigos, number>> = { PC437: 0, PC850: 2, WPC1252: 16, PC858: 19 };
export const NOMBRE_DE_PAGINA: Readonly<Record<PaginaDeCodigos, string>> = {
  PC850: "850 (multilingüe)",
  PC858: "858 (la 850 con el euro)",
  WPC1252: "1252 (la de Windows)",
  PC437: "437 (la de fábrica)",
};

/** Lo que no es ASCII imprimible y sí existe en la página 850 (lo que se escribe en español). */
const CP850: Readonly<Record<string, number>> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, "¿": 0xa8, "¡": 0xad, "«": 0xae, "»": 0xaf,
  "°": 0xf8, "·": 0xfa, "×": 0x9e, "º": 0xa7, "ª": 0xa6,
};
/** La 437: la de la 850 menos las mayúsculas con tilde (salvo la É), que no tiene. */
const CP437: Readonly<Record<string, number>> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a, É: 0x90,
  "¿": 0xa8, "¡": 0xad, "«": 0xae, "»": 0xaf, "°": 0xf8, "·": 0xfa, "º": 0xa7, "ª": 0xa6,
};
const TABLAS: Readonly<Record<PaginaDeCodigos, Readonly<Record<string, number>>>> = {
  PC850: CP850,
  PC858: { ...CP850, "€": 0xd5 },
  PC437: CP437,
  // La 1252 es la latina de Windows: de 0xA0 a 0xFF, el mismo número que en Unicode.
  WPC1252: { "€": 0x80 },
};
/** Signos tipográficos que no están en las páginas: se cambian por su equivalente simple. */
const EQUIVALENTE: Readonly<Record<string, string>> = { "−": "-", "–": "-", "—": "-", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'", " ": " " };

/**
 * El texto en una página de códigos. Lo que la página no tiene sale sin su tilde («Ó» → «O») y, si tampoco, «?»: un
 * ticket con una letra sin acento se lee; uno con bytes basura, no.
 */
export function enPagina(texto: string, pagina: PaginaDeCodigos): number[] {
  const tabla = TABLAS[pagina];
  const uno = (c: string): number | null => {
    const code = c.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) return code;
    const t = tabla[c];
    if (t !== undefined) return t;
    if (pagina === "WPC1252" && code >= 0xa0 && code <= 0xff) return code;
    return null;
  };
  const bytes: number[] = [];
  for (const c of texto) {
    const e = EQUIVALENTE[c];
    if (e !== undefined) {
      for (const x of e) bytes.push(x.charCodeAt(0));
      continue;
    }
    const directo = uno(c);
    if (directo !== null) {
      bytes.push(directo);
      continue;
    }
    const sinTilde = c.normalize("NFD").replace(/[̀-ͯ]/g, "");
    bytes.push((sinTilde.length === 1 ? uno(sinTilde) : null) ?? 0x3f);
  }
  return bytes;
}

/** El texto en la página de códigos 850. Lo que no está, sin tilde o «?». */
export function enCp850(texto: string): number[] {
  return enPagina(texto, "PC850");
}

/** Cómo se imprime en una impresora: su página de códigos y si va oscura (B5-4). */
export type OpcionesDeImpresion = Readonly<{ pagina?: PaginaDeCodigos; oscura?: boolean }>;

/**
 * Iniciar, apagar el modo chino y elegir la página, en ese orden: con el modo chino encendido, la impresora no atiende
 * a la página.
 */
function cabecera(pagina: PaginaDeCodigos): number[] {
  return [ESC, 0x40, FS, 0x2e, ESC, 0x74, NUMERO_DE_PAGINA[pagina]];
}

/**
 * Los bytes del documento para una impresora de ese ancho. **Oscura** (B5-4): todo en negrita y con doble pasada
 * (ESC G), para las térmicas que marcan pálido; la densidad del cabezal es de la propia impresora.
 */
export function escpos(doc: Documento, ancho: Ancho, opciones: OpcionesDeImpresion = {}): Uint8Array {
  const pagina = opciones.pagina ?? "PC850";
  const oscura = opciones.oscura ?? false;
  const b: number[] = cabecera(pagina);
  if (oscura) b.push(ESC, 0x47, 1);
  let negrita = false;
  let grande = false;
  for (const r of componer(doc, ancho)) {
    const enNegrita = r.negrita || oscura;
    if (enNegrita !== negrita) {
      b.push(ESC, 0x45, enNegrita ? 1 : 0);
      negrita = enNegrita;
    }
    if (r.grande !== grande) {
      b.push(GS, 0x21, r.grande ? 0x11 : 0x00);
      grande = r.grande;
    }
    b.push(...enPagina(r.texto.trimEnd(), pagina), LF);
  }
  if (negrita) b.push(ESC, 0x45, 0);
  if (grande) b.push(GS, 0x21, 0);
  if (oscura) b.push(ESC, 0x47, 0);
  // Avanza lo que separa el cabezal del cortador y corta dejando una pestaña.
  b.push(ESC, 0x64, 4);
  if (doc.cortar !== false) b.push(GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(b);
}

/** Lo que imprime «Probar acentos» con cada página. */
export const TEXTO_DE_PRUEBA = "áéíóú ÁÉÍÓÚ ñÑ ¿¡ $ Bs.";

/**
 * «Probar acentos» (B5-4): un solo papel con el texto de prueba en cada página de códigos, cada uno precedido de su
 * número en ASCII («1 · 850»), para elegir en la ficha la que salió bien.
 */
export function pruebaDeAcentos(ancho: Ancho): Uint8Array {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const b: number[] = [ESC, 0x40, FS, 0x2e];
  b.push(...ascii("PRUEBA DE ACENTOS"), LF, ...ascii("Elige en la ficha la que se lee bien:"), LF, LF);
  PAGINAS.forEach((p, i) => {
    b.push(ESC, 0x74, NUMERO_DE_PAGINA[p]);
    b.push(...ascii(`${i + 1} - ${p.replace("WPC", "").replace("PC", "")}`), LF);
    for (const trozo of partir(TEXTO_DE_PRUEBA, COLUMNAS[ancho])) b.push(...enPagina(trozo, p), LF);
    b.push(LF);
  });
  b.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00);
  return Uint8Array.from(b);
}

/** La pregunta por el sensor del rollo (DLE EOT 4). */
export const PREGUNTA_PAPEL = Uint8Array.from([0x10, 0x04, 0x04]);

/**
 * Qué dice la respuesta a `PREGUNTA_PAPEL`. Un byte de estado tiene fijos los bits 1 y 4 a uno y 0 y
 * 7 a cero; si no tiene esa forma, no es una respuesta y no se sabe nada (`null`). Bits 5-6: sin papel;
 * bits 2-3: queda poco.
 */
export function problemaDePapel(byte: number): "SIN_PAPEL" | "POCO_PAPEL" | null {
  if ((byte & 0x93) !== 0x12) return null;
  if ((byte & 0x60) !== 0) return "SIN_PAPEL";
  if ((byte & 0x0c) !== 0) return "POCO_PAPEL";
  return null;
}
