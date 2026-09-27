"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExchangeRateDto, HistorialTasasDto, RatePair, Resultado, SincronizacionTasaDto } from "@l2/contracts";
import { calendarDay, frozenRateOf, rateOfDay } from "@l2/domain-rates";
import type { FrozenRate } from "@l2/domain-money";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { capturarTasa, confirmarTasa, leerTasas, traerTasaDelBcv } from "./tasas.acciones";

/**
 * Las tasas de cambio — F3-03 a F3-05, en el servidor desde B2-1, en vivo desde B2-1c.
 *
 * El historial lo manda el layout desde la base. Capturar y confirmar son acciones del servidor:
 * él decide quién puede, si el salto exige teclear otra vez y deja el asiento. Aquí solo se
 * adopta lo que devuelve.
 *
 * EN VIVO (ADR-019 §6): toda pantalla que muestra o usa bolívares lee la tasa de aquí, y aquí se
 * pregunta al servidor cada 60 s y al volver el foco. Así una tasa que el BCV publica, o que otra
 * estación aplica, llega a la caja en menos de un minuto sin navegar. El tiempo real (B5-1) lo
 * empujará en menos de 2 s y retirará el sondeo.
 */

/** Cada cuánto se pregunta al servidor por la tasa. */
const SONDEO_MS = 60_000;

/** Lo que distingue un historial de otro para no repintar si nada cambió. */
const huellaDe = (h: HistorialTasasDto) =>
  [...h.tasas.map((t) => `${t.id}:${t.confirmed ? 1 : 0}`), ...h.alertas.map((a) => `${a.tipo}:${a.rateId ?? ""}:${a.mensaje}`)].join("|");

type Valor = Readonly<{
  historial: HistorialTasasDto;
  /** Nunca lanza por un rechazo: lo devuelve para que la pantalla lo pinte. */
  capturar: (entrada: unknown) => Promise<Resultado<ExchangeRateDto>>;
  confirmar: (entrada: unknown, autorizacion?: unknown) => Promise<Resultado<ExchangeRateDto>>;
  /** Trae la tasa del BCV de sus fuentes (F3-04). Lo traído entra pendiente. */
  traer: () => Promise<Resultado<SincronizacionTasaDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function TasasProvider({ inicial, children }: { inicial: HistorialTasasDto; children: React.ReactNode }) {
  const [historial, setHistorial] = useState<HistorialTasasDto>(inicial);

  // Cuando el layout se vuelve a pintar con otro historial (esta u otra estación capturó o
  // confirmó y se navegó), se adopta. La huella dice si cambió algo: el objeto es nuevo en cada pintado.
  const huella = huellaDe(inicial);
  useEffect(() => {
    setHistorial(inicial);
  }, [huella]);

  // El sondeo. Un fallo de red no borra la tasa que ya se tenía: se sigue con ella y se vuelve a
  // preguntar en el siguiente turno. Cuánto vale esa tasa lo decide `useTasaVigente` con el día,
  // no el sondeo: una del viernes deja de valer el lunes aunque no se pueda preguntar.
  useEffect(() => {
    let vivo = true;
    let enCurso = false;
    const preguntar = async () => {
      if (enCurso || document.visibilityState === "hidden") return;
      enCurso = true;
      try {
        const nuevo = await leerTasas();
        if (vivo) setHistorial((h) => (huellaDe(h) === huellaDe(nuevo) ? h : nuevo));
      } catch {
        // Sin servidor se sigue con lo que había; la barra de estación dice si hay conexión.
      } finally {
        enCurso = false;
      }
    };
    const id = window.setInterval(() => void preguntar(), SONDEO_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void preguntar();
    };
    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(id);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  /**
   * Vuelve a leer el historial tras escribir: las alertas (una retenida que se confirmó, la que ya
   * no falta) las calcula el servidor, y aquí no se adivinan. Si falla, queda lo adoptado.
   */
  const refrescar = useCallback(async () => {
    const nuevo = await leerTasas().catch(() => null);
    if (nuevo) setHistorial(nuevo);
  }, []);

  /** Sustituye o añade la tasa que devolvió el servidor, sin esperar a que el layout se repinte. */
  const adoptar = useCallback((t: ExchangeRateDto) => {
    setHistorial((h) => ({ ...h, tasas: [t, ...h.tasas.filter((x) => x.id !== t.id)] }));
  }, []);

  const capturar = useCallback(
    async (entrada: unknown) => {
      const r = await capturarTasa(entrada);
      if (r.ok) {
        adoptar(r.valor);
        await refrescar();
      }
      return r;
    },
    [adoptar, refrescar],
  );

  const confirmar = useCallback(
    async (entrada: unknown, autorizacion?: unknown) => {
      const r = await confirmarTasa(entrada, autorizacion);
      if (r.ok) {
        adoptar(r.valor);
        await refrescar();
      }
      return r;
    },
    [adoptar, refrescar],
  );

  const traer = useCallback(async () => {
    const r = await traerTasaDelBcv();
    if (r.ok) for (const t of [...r.valor.capturadas, ...r.valor.aplicadas]) adoptar(t);
    if (r.ok) await refrescar();
    return r;
  }, [adoptar, refrescar]);

  const valor = useMemo(() => ({ historial, capturar, confirmar, traer }), [historial, capturar, confirmar, traer]);
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
