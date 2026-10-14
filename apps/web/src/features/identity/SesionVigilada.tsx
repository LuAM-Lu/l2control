"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { avisar } from "@l2/ui";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { porQueSeCerroMiSesion } from "./acceso.acciones";

/**
 * Una persona, un equipo — B1-7 (M-39, X-7).
 *
 * Entrar con el PIN en otro equipo cierra la sesión de aquí (salvo administración y la cuenta de soporte). Cuando el canal
 * dice que cambiaron las sesiones, este equipo mira si la suya sigue abierta; si se cerró, lo dice («Entraste en
 * «Tablet»: aquí se cerró la sesión») y vuelve al acceso. Sin sondeos: solo con el aviso del canal.
 */
export function SesionVigilada() {
  const router = useRouter();
  useAlCambiar(["sesiones"], () => {
    void porQueSeCerroMiSesion()
      .then((r) => {
        if (!r) return;
        avisar.aviso(r.equipo ? `Entraste en «${r.equipo}»: aquí se cerró la sesión` : "Tu sesión en este equipo se cerró", {
          detalle: r.equipo ? "Una persona trabaja en un equipo a la vez. Para seguir aquí, entra otra vez con tu PIN." : "Entra otra vez con tu PIN.",
        });
        router.push("/acceso" as Route);
        router.refresh();
      })
      .catch(() => undefined);
  });
  return null;
}
