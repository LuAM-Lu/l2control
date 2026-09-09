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

/** Valor por defecto hasta que F5-08b lo haga editable por sucursal. */
export const DEFAULT_TIME_FORMAT: TimeFormat = "24h";

/**
 * Hora corta de un instante. Formatea EN EL BORDE, igual que el dinero: el
 * dominio trabaja con instantes, la pantalla con texto.
 */
export function formatClock(epochMs: number, format: TimeFormat = DEFAULT_TIME_FORMAT): string {
  return new Date(epochMs).toLocaleTimeString("es-VE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: format === "12h",
  });
}
