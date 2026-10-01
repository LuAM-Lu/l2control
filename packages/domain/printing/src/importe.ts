/**
 * Los importes en el papel, con el formato de la pantalla (CLAUDE.md, «Formato monetario de
 * Venezuela»): `$ 1,234.50` y `Bs. 1.234,50`. La pantalla los escribe con `formatMoneyVE` de `@l2/ui`,
 * que el servidor no puede importar; aquí se repite la misma regla sobre `toMajor`, sin decimales de
 * coma flotante.
 */
import { money, toMajor, type CurrencyCode } from "@l2/domain-money";

export function importeVE(minor: bigint, moneda: CurrencyCode): string {
  const texto = toMajor(money(minor, moneda));
  const negativo = texto.startsWith("-");
  const [entero = "0", decimales = "00"] = texto.replace("-", "").split(".");
  const signo = negativo ? "-" : "";
  if (moneda === "VES") return `Bs. ${signo}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimales.padEnd(2, "0")}`;
  const simbolo = moneda === "USD" ? "$" : moneda;
  return `${simbolo} ${signo}${entero.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${decimales.padEnd(2, "0")}`;
}

/**
 * La tasa con dos decimales, redondeando la mitad hacia arriba («857,01»), como `formatTasaVE` de la
 * pantalla: es solo lo que se lee; la conversión usa la tasa completa.
 */
export function tasaVE(value: string): string {
  const [entera = "0", decimales = ""] = value.trim().split(".");
  const tercero = decimales[2] ?? "0";
  const centesimos = BigInt(`${entera || "0"}${decimales.padEnd(2, "0").slice(0, 2)}`) + (tercero >= "5" ? 1n : 0n);
  const miles = (centesimos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${miles},${(centesimos % 100n).toString().padStart(2, "0")}`;
}

/** «01/10/2026 · 1:27 pm» (o «13:27» en 24 h): un instante en la zona y el formato del local. */
export function fechaYHora(instante: number, formato: "12h" | "24h", zona: string): string {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: zona,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instante);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  const h = Number(p("hour")) % 24;
  const hora = formato === "24h" ? `${String(h).padStart(2, "0")}:${p("minute")}` : `${h % 12 === 0 ? 12 : h % 12}:${p("minute")} ${h >= 12 ? "pm" : "am"}`;
  return `${p("day")}/${p("month")}/${p("year")} · ${hora}`;
}
