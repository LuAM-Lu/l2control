"use client";

import { useRouter } from "next/navigation";
import type { Tema } from "@l2/contracts";
import { useAlCambiar } from "./TiempoRealProvider.tsx";

/**
 * Para una página que lee en el servidor algo de un tema que su proveedor ya vuelve a leer por su
 * cuenta (la sala, las cuentas): el canal no repinta la página por esos temas, así que la página lo
 * pide aquí (B5-1). Lo demás ya lo repinta el canal.
 */
export function RefrescarAlCambiar({ temas }: { temas: readonly Tema[] }) {
  const router = useRouter();
  useAlCambiar(temas, () => router.refresh());
  return null;
}
