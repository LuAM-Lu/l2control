"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MedioCommand, MediosDePagoDto, Resultado } from "@l2/contracts";
import { offeredMethods } from "@l2/domain-cash";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { aplicarMedio } from "./medios.acciones";
import type { MedioPago } from "./medios.ts";

type Valor = Readonly<{
  /** `null`: nadie en sesión, o el servidor no los pudo leer. La caja no ofrece nada. */
  config: MediosDePagoDto | null;
  /** Un cambio, en el servidor y con elevación si hace falta. Adopta lo que devuelve. */
  aplicar: (cmd: MedioCommand) => Promise<Resultado<MediosDePagoDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

/**
 * Los medios de pago del local (B3-2): los lee el layout en el servidor y los cambia la acción
 * `aplicarMedio`. Nada de esto se guarda en el navegador: lo que ve la caja es lo de la base.
 */
export function MediosProvider({ inicial, children }: { inicial: MediosDePagoDto | null; children: React.ReactNode }) {
  const [config, setConfig] = useState<MediosDePagoDto | null>(inicial);
  const conElevacion = useConElevacion();

  // Cuando el layout se vuelve a pintar con otra configuración (se cambió aquí o en otro equipo y
  // se navegó), se adopta. La huella dice si cambió algo: el objeto es nuevo en cada pintado.
  const huella = JSON.stringify(inicial);
  useEffect(() => {
    setConfig(inicial);
  }, [huella]);

  const aplicar = useCallback(
    async (cmd: MedioCommand) => {
      const r = await conElevacion(() => aplicarMedio(cmd));
      if (r.ok) setConfig(r.valor);
      return r;
    },
    [conElevacion],
  );

  const valor = useMemo(() => ({ config, aplicar }), [config, aplicar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useMedios(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useMedios se usó fuera de MediosProvider");
  return v;
}

/** Los medios que la caja puede ofrecer ahora: encendidos y con los datos del local (dominio). */
export function useMediosActivos(): readonly MedioPago[] {
  const { config } = useMedios();
  return useMemo(() => {
    if (!config) return [];
    const listo = { pagoMovil: config.pagoMovil !== undefined, zelle: config.zelle !== undefined, terminals: config.terminales.length };
    const medios = config.medios.map((m) => ({ ...m, active: m.activo, dataKind: m.datos ?? null }));
    return offeredMethods(medios, listo).map((m) => ({
      code: m.code,
      label: m.label,
      currency: m.currency,
      triggersIgtf: m.triggersIgtf,
      canGiveChange: m.canGiveChange,
      ...(m.datos ? { datos: m.datos } : {}),
    }));
  }, [config]);
}
