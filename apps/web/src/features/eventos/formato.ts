/**
 * Cómo se leen los cumpleaños en pantalla (B10-1). El horario viaja en minutos desde la medianoche
 * del local; aquí se pinta con el formato de hora de la sucursal, nunca con el del navegador.
 */
import type { EstadoReserva } from "@l2/contracts";
import type { Tone } from "@l2/ui";
import type { TimeFormat } from "../park/time-format.ts";

/** 900 → «3:00 pm» o «15:00», según el formato del local. */
export function horaDelDia(minutos: number, formato: TimeFormat): string {
  const h = Math.floor(minutos / 60) % 24;
  const m = String(minutos % 60).padStart(2, "0");
  if (formato === "24h") return `${String(h).padStart(2, "0")}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? "pm" : "am"}`;
}

/** «3:00 pm – 6:00 pm». */
export const horario = (inicio: number, fin: number, formato: TimeFormat) => `${horaDelDia(inicio, formato)} – ${horaDelDia(fin, formato)}`;

/** «15:30» (lo que da un `<input type="time">`) → 930; `null` si no es una hora. */
export function minutosDe(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** 930 → «15:30», para volver a un `<input type="time">`. */
export const hhmmDe = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

const LARGA = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const CORTA = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** «sábado, 10 de octubre»: un día de calendario, pintado en UTC para que no se corra de día. */
export const fechaLarga = (dia: string) => LARGA.format(Date.parse(`${dia}T12:00:00.000Z`));
/** «sáb, 10 oct». */
export const fechaCorta = (dia: string) => CORTA.format(Date.parse(`${dia}T12:00:00.000Z`));

/** El día `n` días después de `dia` (los dos de calendario). */
export const diaMas = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Cómo se dice y de qué color va cada estado de una reserva (color + icono + texto, §8.2). */
export const ESTADO: Readonly<Record<EstadoReserva, { texto: string; tono: Tone }>> = {
  ANTICIPO_POR_COBRAR: { texto: "Anticipo por cobrar", tono: "warn" },
  CONFIRMADA: { texto: "Confirmada", tono: "ok" },
  CANCELADA: { texto: "Cancelada", tono: "idle" },
};
