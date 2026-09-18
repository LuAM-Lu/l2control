"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DevicesDirectorySchema, DeviceCommandSchema, type DevicesDirectoryDto, type DeviceCommand } from "@l2/contracts";

/**
 * Los equipos autorizados — F2-02, ADR-013.
 *
 * El dispositivo es el primer factor del acceso. El PIN solo abre sesión en un equipo
 * aprobado.
 *
 * TODO(F2-02/backend): El registro y la revocación serán del servidor. Revocar cerrará
 * las sesiones activas en ese equipo. La persistencia aquí en sessionStorage es solo para demo.
 */

const CLAVE = "l2:dispositivos:v1";

type Valor = Readonly<{
  dispositivos: DevicesDirectoryDto;
  /**
   * Aplica un cambio a un equipo y devuelve el error si no se pudo.
   *
   * Devuelve el mensaje en vez de lanzarlo: quien llama es un diálogo abierto
   * con el motivo escrito, y una excepción lo tiraría entero. `null` es «hecho».
   */
  aplicar: (cmd: DeviceCommand, autor: { id: string; nombre: string }) => string | null;
}>;

const Contexto = createContext<Valor | null>(null);

export function DispositivosProvider({ inicial, children }: { inicial: DevicesDirectoryDto; children: React.ReactNode }) {
  const [dispositivos, setDispositivos] = useState<DevicesDirectoryDto>(inicial);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    try {
      const crudo = window.sessionStorage.getItem(CLAVE);
      if (crudo) {
        const r = DevicesDirectorySchema.safeParse(JSON.parse(crudo));
        if (r.success) setDispositivos(r.data);
        else window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Almacenamiento bloqueado o JSON roto: se sigue con el inicial.
    }
    setCargado(true);
  }, []);

  const aplicar = useCallback(
    (cmd: DeviceCommand, autor: { id: string; nombre: string }): string | null => {
      const mando = DeviceCommandSchema.safeParse(cmd);
      if (!mando.success) return mando.error.issues[0]?.message ?? "El cambio no es válido";

      const rastro = {
        by: autor.id,
        byName: autor.nombre,
        reason: mando.data.reason,
        at: new Date().toISOString(),
      };

      // Se calcula y se valida FUERA del actualizador de estado: dentro, un
      // error de contrato reventaría el pintado en vez de poder contarse.
      const devices = dispositivos.devices.map((dev) => {
        if (dev.id !== mando.data.deviceId) return dev;
        switch (mando.data.kind) {
          case "APROBAR":
            return { ...dev, status: "APROBADO" as const, changes: [{ kind: "APROBADO" as const, ...rastro }, ...dev.changes] };
          case "REVOCAR":
            return { ...dev, status: "REVOCADO" as const, changes: [{ kind: "REVOCADO" as const, ...rastro }, ...dev.changes] };
          case "RENOMBRAR":
            return {
              ...dev,
              label: mando.data.label,
              changes: [{ kind: "RENOMBRADO" as const, label: mando.data.label, ...rastro }, ...dev.changes],
            };
        }
      });

      const valido = DevicesDirectorySchema.safeParse({ devices });
      if (!valido.success) return valido.error.issues[0]?.message ?? "El cambio deja el directorio inválido";

      setDispositivos(valido.data);
      try {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(valido.data));
      } catch {
        // Sin almacenamiento, el directorio vive en memoria hasta recargar.
      }
      return null;
    },
    [dispositivos],
  );

  const valor = useMemo(() => ({ dispositivos, aplicar }), [dispositivos, aplicar]);
  // `cargado` no cambia lo que se pinta: el inicial y el guardado tienen la
  // misma forma, y así servidor y navegador coinciden al hidratar.
  void cargado;
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDispositivos(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useDispositivos se usó fuera de DispositivosProvider");
  return v;
}
