"use client";

import { useState } from "react";
import type { CargaDePapelDto } from "@l2/contracts";
import { Input } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { aTexto, deTexto } from "./hora.ts";

/**
 * La hora real que se anotó en el formulario — B3-7, ADR-027.
 *
 * Se escribe como se lee en el papel (fecha y hora del reloj del local) y tiene que caer dentro del corte
 * que se declaró al abrir la carga: aquí se dice enseguida, y el servidor lo vuelve a comprobar contra su
 * reloj. Mientras no sea una hora válida, `iso` es `null` y ningún botón de cargar debería dejar enviar.
 */
export function useHoraReal(carga: Pick<CargaDePapelDto, "desde" | "hasta">) {
  const reloj = useReloj();
  const [texto, setTexto] = useState("");
  const desde = Date.parse(carga.desde);
  const hasta = Date.parse(carga.hasta);
  const instante = deTexto(texto, reloj.zona);
  const fuera = instante !== null && (instante < desde || instante > hasta);
  const error =
    texto !== "" && instante === null
      ? "Escribe una fecha y una hora."
      : fuera
        ? `Fuera del corte: entre ${reloj.diaYHora(desde)} y ${reloj.diaYHora(hasta)}.`
        : undefined;
  return {
    texto,
    setTexto,
    /** El instante ISO que viaja al servidor, o `null` si falta o no vale. */
    iso: !error && instante !== null ? new Date(instante).toISOString() : null,
    instante: !error ? instante : null,
    error,
    limpiar: () => setTexto(""),
    min: aTexto(desde, reloj.zona),
    max: aTexto(hasta, reloj.zona),
  };
}

export type HoraReal = ReturnType<typeof useHoraReal>;

export function CampoHoraReal({ hora, label = "Hora real del formulario", hint }: { hora: HoraReal; label?: string; hint?: string }) {
  return (
    <Input
      label={label}
      surface="tablet"
      type="datetime-local"
      value={hora.texto}
      min={hora.min}
      max={hora.max}
      error={hora.error}
      hint={hint}
      onChange={(e) => hora.setTexto(e.target.value)}
    />
  );
}
