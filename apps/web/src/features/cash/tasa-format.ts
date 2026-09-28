/**
 * Una tasa de cambio escrita como se lee en Venezuela, **sin pasar por
 * `number`**.
 *
 * La tasa viaja como texto decimal por la misma razón que el dinero no es un
 * flotante (ADR-004): `parseFloat("228.41520000")` y volver a formatear es
 * cómo se pierde un decimal. Aquí solo se mueven dígitos con enteros.
 *
 * **Se enseña con dos decimales** (pedido del cliente, 2026-09-28): el BCV
 * publica ocho y «Bs. 857,00580000» no se lee de un vistazo. Se redondea la
 * mitad hacia arriba (857,0058 → 857,01). Es solo lo que se ve: el cobro
 * convierte con la tasa completa que se capturó.
 */
export function formatTasaVE(value: string): string {
  const [entera = "0", decimales = ""] = value.trim().split(".");
  const tercero = decimales[2] ?? "0";
  const centesimos = BigInt(`${entera || "0"}${decimales.padEnd(2, "0").slice(0, 2)}`) + (tercero >= "5" ? 1n : 0n);
  const miles = (centesimos / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${miles},${(centesimos % 100n).toString().padStart(2, "0")}`;
}
