"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AjustesPublicadosDto, AjustesSucursalDto, Resultado } from "@l2/contracts";
import { publicarAjustes } from "./ajustes.acciones";
import { useConElevacion } from "../identity/ElevacionProvider";
import { formatClock } from "../park/time-format.ts";

/**
 * Los ajustes de la sucursal — F5-08b, F4-04c, F6-13 (D8), en el servidor desde B4-4.
 *
 * Vive por encima de las dos cáscaras: lo escribe el back-office (el editor, solo administración) y
 * lo lee toda superficie (el formato de hora, la zona, el residuo de la caja, las horas de una
 * huérfana). El layout los lee en el servidor; cuando otro equipo publica, el canal en vivo repinta
 * el layout (tema `sucursal`) y aquí se adopta la versión nueva. Nada se guarda en el navegador.
 */

type Valor = Readonly<{
  ajustes: AjustesSucursalDto;
  /** Versión vigente en el servidor; 0 = nunca se publicaron (valores de fábrica). */
  version: number;
  publicadoEn: string | null;
  publicadoPor: string | null;
  /** Publica sobre la versión vigente. Nunca lanza por un rechazo: lo devuelve. */
  publicar: (ajustes: AjustesSucursalDto) => Promise<Resultado<AjustesPublicadosDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function SucursalProvider({ inicial, children }: { inicial: AjustesPublicadosDto; children: React.ReactNode }) {
  const [vigente, setVigente] = useState<AjustesPublicadosDto>(inicial);

  // `useState` solo mira su valor inicial una vez: cuando el layout se repinta con otra versión (esta
  // u otra estación publicó), se adopta. La versión identifica el contenido.
  useEffect(() => {
    setVigente(inicial);
  }, [inicial.version]);

  // Publicar exige confirmar identidad (F2-04): si el servidor la pide, se pide y se reintenta.
  const conElevacion = useConElevacion();
  const publicar = useCallback(
    async (ajustes: AjustesSucursalDto) => {
      const r = await conElevacion(() => publicarAjustes({ versionBase: vigente.version, ajustes }));
      if (r.ok) setVigente(r.valor);
      return r;
    },
    [conElevacion, vigente.version],
  );

  const valor = useMemo(
    () => ({ ajustes: vigente.ajustes, version: vigente.version, publicadoEn: vigente.publicadoEn, publicadoPor: vigente.publicadoPor, publicar }),
    [vigente, publicar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSucursal(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useSucursal se usó fuera de SucursalProvider");
  return v;
}

/** Cómo pinta el local fechas y horas: su formato (12 o 24 h) y su zona (F5-08b, B4-4). */
export type Reloj = Readonly<{
  zona: string;
  /** «2:00 pm» o «14:00». */
  hora: (epochMs: number) => string;
  /** «27 sept». */
  dia: (epochMs: number) => string;
  /** «27 sept 2026». */
  diaConAnio: (epochMs: number) => string;
  /** «27/09/2026». */
  diaNumerico: (epochMs: number) => string;
  /** «27 sept 2:00 pm». */
  diaYHora: (epochMs: number) => string;
}>;

/**
 * Fechas y horas como las quiere el local, en su zona y no en la del navegador. Cambiar los ajustes
 * cambia todas las pantallas a la vez.
 */
export function useReloj(): Reloj {
  const { formatoHora, zonaHoraria } = useSucursal().ajustes;
  return useMemo(() => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-VE", { ...o, timeZone: zonaHoraria });
    const corto = f({ day: "numeric", month: "short" });
    const conAnio = f({ day: "numeric", month: "short", year: "numeric" });
    const numerico = f({ day: "2-digit", month: "2-digit", year: "numeric" });
    const hora = (t: number) => formatClock(t, formatoHora, zonaHoraria);
    return {
      zona: zonaHoraria,
      hora,
      dia: (t) => corto.format(t),
      diaConAnio: (t) => conAnio.format(t),
      diaNumerico: (t) => numerico.format(t),
      diaYHora: (t) => `${corto.format(t)} ${hora(t)}`,
    };
  }, [formatoHora, zonaHoraria]);
}

/** La hora de un instante como la quiere el local (atajo de `useReloj().hora`). */
export function useHora(): (epochMs: number) => string {
  return useReloj().hora;
}
