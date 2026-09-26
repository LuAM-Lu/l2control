"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { DeviceCommand, DevicesDirectoryDto } from "@l2/contracts";
import { ordenarDispositivo } from "./dispositivos.acciones";
import { useConElevacion } from "./ElevacionProvider";

/**
 * Los equipos de la sucursal — F2-02, en el servidor desde B1-3.
 *
 * El directorio llega del servidor (`dispositivosDelLocal`) y cada cambio es una acción de
 * servidor: el servidor comprueba el permiso, guarda el cambio con su motivo y su asiento, y al
 * revocar cierra las sesiones abiertas en ese equipo. Aquí solo se refleja lo que respondió.
 */

type Valor = Readonly<{
  dispositivos: DevicesDirectoryDto;
  /**
   * Aplica un cambio a un equipo y devuelve el error si no se pudo. Devuelve el mensaje en vez
   * de lanzarlo: quien llama es un diálogo abierto con el motivo escrito. `null` es «hecho».
   */
  aplicar: (cmd: DeviceCommand) => Promise<string | null>;
}>;

const Contexto = createContext<Valor | null>(null);

export function DispositivosProvider({ inicial, children }: { inicial: DevicesDirectoryDto; children: React.ReactNode }) {
  const [dispositivos, setDispositivos] = useState<DevicesDirectoryDto>(inicial);
  // Si el servidor vuelve a pintar la sección con otro directorio, se adopta.
  useEffect(() => setDispositivos(inicial), [inicial]);

  const conElevacion = useConElevacion();
  const aplicar = useCallback(
    async (cmd: DeviceCommand): Promise<string | null> => {
      const r = await conElevacion(() => ordenarDispositivo(cmd)).catch(() => null);
      if (!r) return "El servidor no respondió. El cambio no se guardó; inténtalo de nuevo.";
      if (!r.ok) return r.problemas?.[0]?.message ?? r.mensaje;
      setDispositivos((d) => ({ devices: d.devices.map((x) => (x.id === r.valor.id ? r.valor : x)) }));
      return null;
    },
    [conElevacion],
  );

  const valor = useMemo(() => ({ dispositivos, aplicar }), [dispositivos, aplicar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDispositivos(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useDispositivos se usó fuera de DispositivosProvider");
  return v;
}
