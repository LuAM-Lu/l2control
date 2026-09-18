/**
 * Una tasa de cambio escrita como se lee en Venezuela, **sin pasar por
 * `number`**.
 *
 * La tasa viaja como texto decimal por la misma razón que el dinero no es un
 * flotante (ADR-004): `parseFloat("228.41520000")` y volver a formatear es
 * cómo se pierde el último decimal de una tasa que el BCV publica con ocho.
 * Aquí solo se mueven caracteres: punto para los miles, coma para los
 * decimales, y **lo que se capturó es lo que se ve**, sin redondear.
 */
export function formatTasaVE(value: string): string {
  const [entera = "0", decimales = ""] = value.trim().split(".");
  const miles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${miles},${decimales.padEnd(2, "0")}`;
}
