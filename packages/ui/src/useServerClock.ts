"use client";

import { useEffect, useState } from "react";

/**
 * Reloj corregido contra el servidor — ADR-010.
 *
 * Mide el desfase entre el reloj del servidor y el del dispositivo, y luego
 * avanza localmente. Devuelve el instante corregido, no el del navegador.
 *
 * Cada vez que llega un instante NUEVO del servidor, se vuelve a medir. Antes
 * se medía una sola vez al montar, y una tarjeta que recibía horas nuevas
 * —del socket, o del simulador a ×60— las ignoraba y seguía a velocidad real.
 *
 * Existe como hook único para que TODO lo que depende del tiempo en una misma
 * tarjeta (cifra y barra de progreso) avance con el mismo latido. Dos
 * temporizadores independientes se desincronizan y se nota.
 */
export function useServerClock(serverNow: number, intervalMs = 1000): number {
  const [offset, setOffset] = useState(() => serverNow - Date.now());
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    setOffset(serverNow - Date.now());
    setNow(serverNow);
  }, [serverNow]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => clearInterval(id);
  }, [offset, intervalMs]);

  return now;
}
