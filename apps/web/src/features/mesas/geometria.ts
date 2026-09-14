/**
 * Geometría del plano — V4.
 *
 * Puras y sin React: el editor las usa para avisar MIENTRAS se mueve una mesa,
 * y el contrato (`PlanoLocalSchema`) vuelve a comprobar lo mismo al publicar.
 * La regla se escribe dos veces a propósito, en dos capas distintas: aquí para
 * que el aviso sea inmediato, allí para que nada inválido llegue al servicio.
 */
import type { DiningTableDto, PlanoLocalDto } from "@l2/contracts";

/** La rejilla del editor, en cm. Al soltar, la mesa se ajusta a ella. */
export const REJILLA_CM = 10;

/** Lo que mueve una flecha del teclado, y con Mayús. */
export const PASO_CM = REJILLA_CM;
export const PASO_LARGO_CM = 50;

export const ajustar = (v: number, rejilla = REJILLA_CM) => Math.round(v / rejilla) * rejilla;

type Caja = Readonly<{ x1: number; y1: number; x2: number; y2: number }>;

export const cajaDe = (m: Pick<DiningTableDto, "x" | "y" | "width" | "height">): Caja => ({
  x1: m.x - m.width / 2,
  y1: m.y - m.height / 2,
  x2: m.x + m.width / 2,
  y2: m.y + m.height / 2,
});

export function solapan(a: DiningTableDto, b: DiningTableDto): boolean {
  const ca = cajaDe(a);
  const cb = cajaDe(b);
  return ca.x1 < cb.x2 && cb.x1 < ca.x2 && ca.y1 < cb.y2 && cb.y1 < ca.y2;
}

export function fueraDelLocal(m: DiningTableDto, plano: Pick<PlanoLocalDto, "width" | "height">): boolean {
  const c = cajaDe(m);
  return c.x1 < 0 || c.y1 < 0 || c.x2 > plano.width || c.y2 > plano.height;
}

/**
 * Qué mesas están mal colocadas ahora mismo: fuera de las paredes o encima de
 * otra. Las retiradas no cuentan: ya no están en el salón.
 */
export function mesasConProblema(plano: PlanoLocalDto): Set<string> {
  const malas = new Set<string>();
  const enSalon = plano.tables.filter((m) => !m.retiredAt);
  for (const m of enSalon) if (fueraDelLocal(m, plano)) malas.add(m.id);
  for (let i = 0; i < enSalon.length; i += 1) {
    for (let j = i + 1; j < enSalon.length; j += 1) {
      if (solapan(enSalon[i]!, enSalon[j]!)) {
        malas.add(enSalon[i]!.id);
        malas.add(enSalon[j]!.id);
      }
    }
  }
  return malas;
}

/** Deja una mesa dentro de las paredes, sin cambiar su tamaño. */
export function dentroDelLocal(m: DiningTableDto, plano: Pick<PlanoLocalDto, "width" | "height">): DiningTableDto {
  const mitadX = m.width / 2;
  const mitadY = m.height / 2;
  return {
    ...m,
    x: Math.min(Math.max(m.x, mitadX), plano.width - mitadX),
    y: Math.min(Math.max(m.y, mitadY), plano.height - mitadY),
  };
}

/** El siguiente número libre del salón: «9» si están del 1 al 8. */
export function siguienteNumero(plano: PlanoLocalDto): string {
  const usados = new Set(plano.tables.filter((m) => !m.retiredAt).map((m) => m.label));
  for (let n = 1; n < 200; n += 1) if (!usados.has(String(n))) return String(n);
  return String(plano.tables.length + 1);
}

/** Lo que ocupa sitio en el suelo: el parque, la barra y la cocina. Una puerta no. */
const OCUPA_SUELO = new Set(["PARQUE", "CAJA", "BARRA", "COCINA", "PARED"]);

function pisaLaEstructura(m: DiningTableDto, plano: PlanoLocalDto): boolean {
  const c = cajaDe(m);
  return plano.fixtures.some((f) => {
    if (!OCUPA_SUELO.has(f.kind)) return false;
    return c.x1 < f.x + f.width && f.x < c.x2 && c.y1 < f.y + f.height && f.y < c.y2;
  });
}

/**
 * Un hueco libre donde dejar una mesa nueva, recorriendo la rejilla.
 *
 * Evita las otras mesas **y la estructura**: una mesa nueva que aparece dentro
 * del parque o encima de la cocina obliga a arrastrarla antes de poder usarla.
 */
export function huecoLibre(plano: PlanoLocalDto, nueva: DiningTableDto): { x: number; y: number } {
  const paso = 25;
  for (let y = nueva.height / 2; y <= plano.height - nueva.height / 2; y += paso) {
    for (let x = nueva.width / 2; x <= plano.width - nueva.width / 2; x += paso) {
      const prueba = { ...nueva, x: ajustar(x), y: ajustar(y) };
      const choca = plano.tables.some((m) => !m.retiredAt && m.id !== nueva.id && solapan(prueba, m));
      if (!choca && !fueraDelLocal(prueba, plano) && !pisaLaEstructura(prueba, plano)) {
        return { x: prueba.x, y: prueba.y };
      }
    }
  }
  return { x: ajustar(plano.width / 2), y: ajustar(plano.height / 2) };
}
