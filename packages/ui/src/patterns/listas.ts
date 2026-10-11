/**
 * Lo puro de las listas largas — T-22 (M-38, W-11). Sin React: qué se ve de una lista con lo buscado y el chip elegido,
 * agrupado en su orden, cuántos tiene cada chip y qué dice «Cargar más». Lo usa `ListaLarga` y se prueba aquí.
 */

/** Tres vistas que cada persona elige (y se recuerdan): tarjetas, una lista y una compacta de un renglón. */
export type VistaDeLista = "TARJETAS" | "LISTA" | "COMPACTA";
export const VISTAS: readonly VistaDeLista[] = ["TARJETAS", "LISTA", "COMPACTA"];
export const esVista = (v: unknown): v is VistaDeLista => typeof v === "string" && (VISTAS as readonly string[]).includes(v);

/** Hasta cuántos se ven todos, sin buscador ni filtros. */
export const TODO_A_LA_VISTA = 50;
/** Cuántos trae el servidor cada vez, en una lista sin tope. */
export const DE_A = 50;

/** Un chip que filtra, con su cuenta. */
export type Chip<T> = Readonly<{ id: string; nombre: string; filtro: (t: T) => boolean }>;
/** Un grupo con su encabezado fijo (un día, una categoría, una letra). */
export type Grupo<T> = Readonly<{ titulo: string; elementos: readonly T[] }>;

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Lo que se ve: lo que coincide con lo buscado (sin acentos ni mayúsculas) y con el chip elegido, en grupos por orden
 * de aparición; y cuántos tiene cada chip con lo buscado (así el chip dice lo que va a dejar).
 */
export function verLista<T>(
  elementos: readonly T[],
  o: Readonly<{
    buscado?: string;
    coincide?: (t: T, q: string) => boolean;
    chips?: readonly Chip<T>[];
    chip?: string | null;
    grupo?: (t: T) => string;
  }> = {},
): { grupos: Grupo<T>[]; cuentas: Readonly<Record<string, number>>; visibles: number } {
  const q = sinAcentos((o.buscado ?? "").trim());
  const buscados = q && o.coincide ? elementos.filter((t) => o.coincide!(t, q)) : elementos;
  const cuentas: Record<string, number> = {};
  for (const c of o.chips ?? []) cuentas[c.id] = buscados.filter(c.filtro).length;
  const elegido = o.chip ? o.chips?.find((c) => c.id === o.chip) : undefined;
  const vistos = elegido ? buscados.filter(elegido.filtro) : buscados;
  if (!o.grupo) return { grupos: [{ titulo: "", elementos: vistos }], cuentas, visibles: vistos.length };
  const porTitulo = new Map<string, T[]>();
  for (const t of vistos) {
    const titulo = o.grupo(t);
    const g = porTitulo.get(titulo);
    if (g) g.push(t);
    else porTitulo.set(titulo, [t]);
  }
  return { grupos: [...porTitulo].map(([titulo, es]) => ({ titulo, elementos: es })), cuentas, visibles: vistos.length };
}

const miles = (n: number) => new Intl.NumberFormat("es-VE").format(n);

/** «Cargar más · 50 de 2.000» y cuántos faltan; con todo cargado, «Son todos: 2.000». */
export function textoDeCargarMas(cargados: number, total: number): { boton: string | null; faltan: string } {
  if (cargados >= total) return { boton: null, faltan: total === 1 ? "Es el único" : `Son todos: ${miles(total)}` };
  const faltan = total - cargados;
  return { boton: `Cargar más · ${miles(cargados)} de ${miles(total)}`, faltan: faltan === 1 ? "Falta 1" : `Faltan ${miles(faltan)}` };
}

/** Las letras del índice de las personas (A–Z, con la Ñ en su sitio). */
export const LETRAS: readonly string[] = [..."ABCDEFGHIJKLMN", "Ñ", ..."OPQRSTUVWXYZ"];

/** La letra con que se ordena un nombre: su primera letra, sin acento (la Ñ es su propia letra). */
export function letraDe(nombre: string): string {
  const primera = nombre.trim().charAt(0).toUpperCase();
  if (primera === "Ñ") return "Ñ";
  const sin = primera.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  return LETRAS.includes(sin) ? sin : "#";
}
