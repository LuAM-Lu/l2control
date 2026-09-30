/**
 * Formato de hora — F5-08b.
 *
 * En Venezuela conviven las dos costumbres: «14:32» y «2:32 p. m.». Cuál usa el negocio no es una
 * decisión de programación, así que **es configuración** (§9.9): el formato y la zona salen de los
 * ajustes de la sucursal (B4-4), y quien pinta una hora los pasa. Desde un componente, `useHora()`
 * de la sucursal ya los pone. No hay valor por defecto: una pantalla que lo olvidara pintaría la
 * hora del navegador, que puede estar en otra zona.
 */
export type TimeFormat = "24h" | "12h";

/** Un formateador por zona: construirlos cuesta y la zona casi nunca cambia. */
const RELOJES = new Map<string, Intl.DateTimeFormat>();

function relojDe(timeZone: string): Intl.DateTimeFormat {
  let f = RELOJES.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone });
    RELOJES.set(timeZone, f);
  }
  return f;
}

/**
 * Hora corta de un instante en la zona del local: «2:00 pm» o «14:00». Formatea EN EL BORDE, igual
 * que el dinero: el dominio trabaja con instantes, la pantalla con texto.
 */
export function formatClock(epochMs: number, format: TimeFormat, timeZone: string): string {
  const partes = relojDe(timeZone).formatToParts(epochMs);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = partes.find((p) => p.type === "minute")?.value ?? "00";
  if (format === "24h") return `${String(h).padStart(2, "0")}:${m}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${h >= 12 ? "pm" : "am"}`;
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
