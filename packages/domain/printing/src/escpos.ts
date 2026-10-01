/**
 * El ESC/POS que entiende la impresora térmica — B5-2, ADR-026.
 *
 * Lo hablan casi todas las térmicas (Epson, Xprinter, 3nStar, Bixolon…), así que se usa solo lo común:
 * iniciar (ESC @), la página de códigos 850 (ESC t 2) para las tildes, la eñe, «¿» y «¡», negrita
 * (ESC E), tamaño doble (GS !), avanzar (ESC d) y cortar dejando una pestaña (GS V 66). Un carácter que
 * la página 850 no tiene sale como «?»: un ticket con un signo raro se lee; uno con bytes basura, no.
 *
 * Y una pregunta: el estado del papel (DLE EOT 4). La impresora responde con un byte; el agente lo lee
 * antes de imprimir y `problemaDePapel` dice si hay que parar.
 */
import { componer, type Ancho, type Documento } from "./documento.ts";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Lo que no es ASCII imprimible y sí existe en la página 850 (lo que se escribe en español). */
const CP850: Readonly<Record<string, number>> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9, "¿": 0xa8, "¡": 0xad, "«": 0xae, "»": 0xaf,
  "°": 0xf8, "·": 0xfa, "×": 0x9e, "º": 0xa7, "ª": 0xa6,
};
/** Signos tipográficos que no están en la 850: se cambian por su equivalente simple. */
const EQUIVALENTE: Readonly<Record<string, string>> = { "−": "-", "–": "-", "—": "-", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'", " ": " " };

/** El texto en la página de códigos 850. Lo que no está, «?». */
export function enCp850(texto: string): number[] {
  const bytes: number[] = [];
  for (const c of texto) {
    const e = EQUIVALENTE[c];
    if (e !== undefined) {
      for (const x of e) bytes.push(x.charCodeAt(0));
      continue;
    }
    const code = c.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) bytes.push(code);
    else bytes.push(CP850[c] ?? 0x3f);
  }
  return bytes;
}

/** Los bytes del documento para una impresora de ese ancho. */
export function escpos(doc: Documento, ancho: Ancho): Uint8Array {
  const b: number[] = [ESC, 0x40, ESC, 0x74, 0x02];
  let negrita = false;
  let grande = false;
  for (const r of componer(doc, ancho)) {
    if (r.negrita !== negrita) {
      b.push(ESC, 0x45, r.negrita ? 1 : 0);
      negrita = r.negrita;
    }
    if (r.grande !== grande) {
      b.push(GS, 0x21, r.grande ? 0x11 : 0x00);
      grande = r.grande;
    }
    b.push(...enCp850(r.texto.trimEnd()), LF);
  }
  if (negrita) b.push(ESC, 0x45, 0);
  if (grande) b.push(GS, 0x21, 0);
  // Avanza lo que separa el cabezal del cortador y corta dejando una pestaña.
  b.push(ESC, 0x64, 4);
  if (doc.cortar !== false) b.push(GS, 0x56, 0x42, 0x00);
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
