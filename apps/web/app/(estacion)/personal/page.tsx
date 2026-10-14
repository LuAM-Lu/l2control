import { redirect } from "next/navigation";
import type { ConsultaEnLaDireccion } from "../../../src/features/reportes/reportes.servidor";

/**
 * Caja → Personal se mudó a Caja → Deudas → Personal (B3-26, M-39): un enlace guardado lleva a su sitio nuevo, con la
 * quincena que pedía.
 */
export default async function PersonalPage({ searchParams }: { searchParams: Promise<ConsultaEnLaDireccion> }) {
  const consulta = await searchParams;
  const resto = new URLSearchParams(Object.entries(consulta).filter((e): e is [string, string] => typeof e[1] === "string"));
  resto.set("vista", "personal");
  redirect(`/deudas?${resto.toString()}`);
}
