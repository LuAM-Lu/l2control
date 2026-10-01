/**
 * Lo que se pega en el asistente al instalar: la orden entera que enseña el panel, o la dirección y el
 * código sueltos, en cualquier orden. El código no lleva I, O, 0 ni 1 (no se confunden al copiarlo).
 */
export function leerVinculacion(texto: string): { servidor: string | null; codigo: string | null } {
  const servidor = /(https?:\/\/[^\s"']+)/i.exec(texto)?.[1]?.replace(/\/$/, "") ?? null;
  const codigo = /\b([A-HJ-NP-Z2-9]{4})-?([A-HJ-NP-Z2-9]{4})\b/i.exec(texto.replace(/https?:\/\/\S+/gi, " "));
  return { servidor, codigo: codigo ? `${codigo[1]}-${codigo[2]}`.toUpperCase() : null };
}

