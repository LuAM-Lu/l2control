"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExchangeRateDto, HistorialTasasDto, RatePair, Resultado } from "@l2/contracts";
import { calendarDay, frozenRateOf, rateOfDay } from "@l2/domain-rates";
import type { FrozenRate } from "@l2/domain-money";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { capturarTasa, confirmarTasa } from "./tasas.acciones";

/**
 * Las tasas de cambio — F3-03 a F3-05, en el servidor desde B2-1.
 *
 * El historial lo manda el layout desde la base. Capturar y confirmar son acciones del servidor:
 * él decide quién puede, si el salto exige teclear otra vez y deja el asiento. Aquí solo se
 * adopta lo que devuelve. Otra estación lo ve al navegar, y en vivo con el tiempo real (B5-1).
 */

type Valor = Readonly<{
  historial: HistorialTasasDto;
  /** Nunca lanza por un rechazo: lo devuelve para que la pantalla lo pinte. */
  capturar: (entrada: unknown) => Promise<Resultado<ExchangeRateDto>>;
  confirmar: (entrada: unknown, autorizacion?: unknown) => Promise<Resultado<ExchangeRateDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function TasasProvider({ inicial, children }: { inicial: HistorialTasasDto; children: React.ReactNode }) {
  const [historial, setHistorial] = useState<HistorialTasasDto>(inicial);

  // Cuando el layout se vuelve a pintar con otro historial (esta u otra estación capturó o
  // confirmó y se navegó), se adopta. La huella dice si cambió algo: el objeto es nuevo en cada pintado.
  const huella = inicial.tasas.map((t) => `${t.id}:${t.confirmed ? 1 : 0}`).join("|");
  useEffect(() => {
    setHistorial(inicial);
  }, [huella]);

  /** Sustituye o añade la tasa que devolvió el servidor, sin esperar a que el layout se repinte. */
  const adoptar = useCallback((t: ExchangeRateDto) => {
    setHistorial((h) => ({ ...h, tasas: [t, ...h.tasas.filter((x) => x.id !== t.id)] }));
  }, []);

  const capturar = useCallback(
    async (entrada: unknown) => {
      const r = await capturarTasa(entrada);
      if (r.ok) adoptar(r.valor);
      return r;
    },
    [adoptar],
  );

  const confirmar = useCallback(
    async (entrada: unknown, autorizacion?: unknown) => {
      const r = await confirmarTasa(entrada, autorizacion);
      if (r.ok) adoptar(r.valor);
      return r;
    },
    [adoptar],
  );

  const valor = useMemo(() => ({ historial, capturar, confirmar }), [historial, capturar, confirmar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTasas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTasas se usó fuera de TasasProvider");
  return v;
}

/** Qué día es hoy para las tasas, en la zona que manda el servidor. `null` antes de hidratar. */
export function useDiaDeTasas(): string | null {
  const { historial } = useTasas();
  const ahora = useAhoraLocal();
  // El día cambia una vez al día: redondeado al minuto no se recalcula en cada segundo.
  const minuto = Math.floor(ahora / 60_000) * 60_000;
  return useMemo(
    () => (minuto === 0 ? null : calendarDay(new Date(minuto).toISOString(), historial.zonaHoraria)),
    [minuto, historial.zonaHoraria],
  );
}

/**
 * La tasa con la que se cobra ahora: la **del día**, confirmada (F3-05). Sin ella, `null`, y la
 * caja bloquea el cobro en esa moneda. La de ayer no vale aunque sea la última confirmada.
 */
export function useTasaVigente(pair: RatePair): {
  tasa: ExchangeRateDto | null;
  congelada: FrozenRate | null;
} {
  const { historial } = useTasas();
  const dia = useDiaDeTasas();
  /**
   * El instante, redondeado al minuto **hacia arriba**: una tasa se confirma con el minuto en
   * curso, y hacia abajo quedaría «en el futuro» durante el resto de ese minuto.
   */
  const minuto = Math.ceil(useAhoraLocal() / 60_000) * 60_000;

  const vigente = useMemo(() => {
    if (!dia) return null;
    const registro = rateOfDay(historial.tasas, pair, dia, new Date(minuto).toISOString());
    return registro ? (historial.tasas.find((t) => t.id === registro.id) ?? null) : null;
  }, [historial, pair, dia, minuto]);

  const congelada = useMemo(() => (vigente ? frozenRateOf(vigente) : null), [vigente]);

  return { tasa: vigente, congelada };
}
