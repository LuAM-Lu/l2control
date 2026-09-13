/**
 * Formato de hora — F5-08b.
 *
 * En Venezuela conviven las dos costumbres: «14:32» y «2:32 p. m.». Cuál usa
 * el negocio no es una decisión de programación, así que **es configuración**
 * (§9.9), no una constante repartida por los componentes.
 *
 * Hoy vive aquí con un valor por defecto. Cuando exista el módulo de ajustes,
 * el valor pasa a venir de la configuración de la sucursal y **este archivo no
 * cambia**: solo deja de exportar el valor por defecto y lo recibe.
 */
export type TimeFormat = "24h" | "12h";

/**
 * Valor por defecto para Venezuela (§9.9): reloj de 12 horas con indicador am/pm.
 * (ej. "2:00 pm", "10:30 am").
 */
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

/**
 * Hora corta de un instante. Formatea EN EL BORDE, igual que el dinero: el
 * dominio trabaja con instantes, la pantalla con texto.
 */
export function formatClock(epochMs: number, format: TimeFormat = DEFAULT_TIME_FORMAT): string {
  const d = new Date(epochMs);
  if (format === "24h") {
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

/** Convierte una hora en formato "14:00" o "15:42" al formato de 12h venezolano ("2:00 pm", "3:42 pm"). */
export function to12h(time24: string): string {
  const parts = time24.trim().split(":");
  if (parts.length < 2) return time24;
  const h = parseInt(parts[0] ?? "", 10);
  const m = parts[1] ?? "00";
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}
