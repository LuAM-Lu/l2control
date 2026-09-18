"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  HistorialTasasSchema,
  TasaCommandSchema,
  type HistorialTasasDto,
  type TasaCommand,
  type RatePair,
  type ExchangeRateDto,
} from "@l2/contracts";
import { currentRate, frozenRateOf, needsDoubleCheck } from "@l2/domain-rates";
import type { FrozenRate } from "@l2/domain-money";
import { useAhoraLocal } from "../simulacion/SimulacionProvider.tsx";

const CLAVE = "l2:tasas:v1";

type Valor = Readonly<{
  historial: HistorialTasasDto;
  aplicar: (cmd: TasaCommand) => string | null;
}>;

const Contexto = createContext<Valor | null>(null);

/**
 * Proveedor de tasas de cambio.
 * TODO(F3-03/F3-04 backend): el historial será append-only en el servidor y la sincronización con el BCV entra por ahí.
 */
export function TasasProvider({
  inicial,
  children,
}: {
  inicial: HistorialTasasDto;
  children: React.ReactNode;
}) {
  const [historial, setHistorial] = useState<HistorialTasasDto>(inicial);
  const ahora = useAhoraLocal();
  /**
   * El instante, leído al aplicar el mando y no en cada pintado.
   *
   * `useAhoraLocal` avanza cada segundo; si `aplicar` dependiera de él, el
   * valor del contexto sería nuevo sesenta veces por minuto y la caja se
   * repintaría entera mientras alguien está cobrando.
   */
  const ahoraRef = useRef(ahora);
  useEffect(() => {
    ahoraRef.current = ahora;
  }, [ahora]);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = HistorialTasasSchema.safeParse(JSON.parse(crudo));
        if (r.success) setHistorial(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Bloqueado o roto, sigue con el inicial
    }
  }, []);

  const aplicar = useCallback(
    (cmd: TasaCommand): string | null => {
      const r = TasaCommandSchema.safeParse(cmd);
      if (!r.success) {
        return r.error.issues[0]?.message ?? "Mando no válido";
      }
      const mando = r.data;
      let nuevasTasas = [...historial.tasas];

      if (mando.kind === "CAPTURAR") {
        const nueva: ExchangeRateDto = {
          id: crypto.randomUUID(),
          pair: mando.pair,
          value: mando.value,
          source: mando.source,
          capturedAt: new Date(ahoraRef.current).toISOString(),
          capturedBy: mando.capturedBy,
          confirmed: false,
        };
        nuevasTasas = [nueva, ...nuevasTasas];
      } else if (mando.kind === "CONFIRMAR") {
        const indice = nuevasTasas.findIndex((t) => t.id === mando.rateId);
        if (indice === -1) return "La tasa no existe en el historial.";

        const tasa = nuevasTasas[indice]!;
        if (tasa.confirmed) return "La tasa ya estaba confirmada.";

        // Buscar la vigente ANTES de esta para ver si el salto es grande
        const vigente = currentRate(
          historial.tasas,
          tasa.pair,
          new Date(ahoraRef.current).toISOString(),
        );
        const requiereVerificacion = needsDoubleCheck(
          vigente,
          tasa,
          historial.umbralVariacionBasisPoints,
        );

        if (requiereVerificacion) {
          if (!mando.valorVerificado) {
            return "Esta tasa se aparta demasiado de la anterior. Debe teclear el valor nuevamente para confirmar.";
          }
          if (mando.valorVerificado !== tasa.value) {
            return "El valor de verificación no coincide con el valor capturado.";
          }
        }

        nuevasTasas[indice] = {
          ...tasa,
          confirmed: true,
          confirmedBy: mando.confirmadaPor,
          confirmedAt: new Date(ahora).toISOString(),
        };
      }

      const nuevoHistorial = {
        ...historial,
        tasas: nuevasTasas,
      };

      const hRes = HistorialTasasSchema.safeParse(nuevoHistorial);
      if (!hRes.success) {
        return (
          hRes.error.issues[0]?.message ??
          "El historial resultante no es válido."
        );
      }

      setHistorial(hRes.data);
      try {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(hRes.data));
      } catch {
        // En memoria si falla
      }
      return null;
    },
    [historial],
  );

  const valor = useMemo(() => ({ historial, aplicar }), [historial, aplicar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useTasas(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useTasas se usó fuera de TasasProvider");
  return v;
}

export function useTasaVigente(pair: RatePair): {
  tasa: ExchangeRateDto | null;
  congelada: FrozenRate | null;
} {
  const { historial } = useTasas();
  /**
   * El instante, redondeado al minuto: una tasa se publica cuando alguien la
   * confirma, no con el segundero, y así la fracción que recibe la caja no es
   * un objeto nuevo en cada tic del reloj.
   *
   * Se redondea **hacia arriba**. Hacia abajo, la tasa que se acaba de
   * capturar quedaba «en el futuro» durante el resto del minuto y la caja
   * seguía cobrando con la anterior: comprobado en el navegador.
   */
  const minuto = Math.ceil(useAhoraLocal() / 60_000) * 60_000;

  const vigente = useMemo(() => {
    return currentRate(historial.tasas, pair, new Date(minuto).toISOString());
  }, [historial, pair, minuto]);

  const congelada = useMemo(() => {
    return vigente ? frozenRateOf(vigente) : null;
  }, [vigente]);

  return { tasa: vigente, congelada };
}
