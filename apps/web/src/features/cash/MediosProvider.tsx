"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MediosDePagoSchema, MedioCommandSchema, type MediosDePagoDto, type MedioCommand } from "@l2/contracts";
import type { MedioPago } from "./medios.ts";

const CLAVE = "l2:medios:v1";

type Valor = Readonly<{
  config: MediosDePagoDto;
  aplicar: (cmd: MedioCommand) => string | null;
}>;

const Contexto = createContext<Valor | null>(null);

/**
 * Proveedor de la configuración de medios de pago del local.
 * TODO(F4-02/backend): La configuración vendrá del servidor.
 */
export function MediosProvider({
  inicial,
  children,
}: {
  inicial: MediosDePagoDto;
  children: React.ReactNode;
}) {
  const [config, setConfig] = useState<MediosDePagoDto>(inicial);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = MediosDePagoSchema.safeParse(JSON.parse(crudo));
        if (r.success) setConfig(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Bloqueado o roto
    }
  }, []);

  const aplicar = useCallback(
    (cmd: MedioCommand): string | null => {
      const r = MedioCommandSchema.safeParse(cmd);
      if (!r.success) {
        return r.error.issues[0]?.message ?? "Mando no válido";
      }
      const mando = r.data;
      const nueva = { ...config };

      if (mando.kind === "ACTIVAR") {
        nueva.medios = nueva.medios.map((m) =>
          m.code === mando.code ? { ...m, activo: mando.activo } : m
        );
      } else if (mando.kind === "DATOS_PAGO_MOVIL") {
        nueva.pagoMovil = mando.datos;
      } else if (mando.kind === "DATOS_ZELLE") {
        nueva.zelle = mando.datos;
      } else if (mando.kind === "AÑADIR_TERMINAL") {
        nueva.terminales = [...nueva.terminales, mando.terminal];
      } else if (mando.kind === "RETIRAR_TERMINAL") {
        nueva.terminales = nueva.terminales.filter((t) => t.id !== mando.terminalId);
      }

      // Valida fuera del actualizador de estado de React, fail-closed
      const hRes = MediosDePagoSchema.safeParse(nueva);
      if (!hRes.success) {
        return hRes.error.issues[0]?.message ?? "La configuración resultante no es válida.";
      }

      setConfig(hRes.data);
      try {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(hRes.data));
      } catch {
        // En memoria si falla
      }
      return null;
    },
    [config]
  );

  const valor = useMemo(() => ({ config, aplicar }), [config, aplicar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useMedios(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useMedios se usó fuera de MediosProvider");
  return v;
}

export function useMediosActivos(): readonly MedioPago[] {
  const { config } = useMedios();
  return useMemo(() => {
    return config.medios
      .filter((m) => m.activo)
      .filter((m) => {
        if (m.datos === "PAGO_MOVIL" && !config.pagoMovil) return false;
        if (m.datos === "ZELLE" && !config.zelle) return false;
        if (m.datos === "PUNTO" && config.terminales.length === 0) return false;
        return true;
      })
      .map((m) => ({
        code: m.code,
        label: m.label,
        currency: m.currency,
        triggersIgtf: m.triggersIgtf,
        canGiveChange: m.canGiveChange,
        ...(m.datos ? { datos: m.datos } : {}),
      }));
  }, [config]);
}
