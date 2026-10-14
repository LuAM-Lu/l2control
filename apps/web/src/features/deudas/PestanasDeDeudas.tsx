"use client";

import { useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FiltroSegmentado } from "@l2/ui";

/**
 * Caja → Deudas, en dos (B3-26, M-39): lo que dejaron los clientes (B3-11) y lo del personal, sus vales y sus adelantos
 * (B3-17, B3-21). La vista va en la dirección (`?vista=personal`): un enlace guardado abre la que era.
 */
export function PestanasDeDeudas({ activa }: { activa: "CLIENTES" | "PERSONAL" }) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  return (
    <FiltroSegmentado<"CLIENTES" | "PERSONAL">
      etiqueta="Deudas de"
      opciones={[
        { id: "CLIENTES", nombre: "Clientes" },
        { id: "PERSONAL", nombre: "Personal" },
      ]}
      valor={activa}
      onCambiar={(v) => v !== activa && iniciar(() => router.push((v === "PERSONAL" ? "/deudas?vista=personal" : "/deudas") as Route))}
    />
  );
}
