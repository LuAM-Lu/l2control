"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Resultado } from "@l2/contracts";
import { Button, Dialog } from "@l2/ui";
import { desafioParaElevar, elevar } from "./acceso.acciones";
import { CamposDeIdentidad, useSegundoFactor } from "./SegundoFactor";

/**
 * Confirmar identidad — F2-04.
 *
 * Configuración, precios, personas y reportes globales exigen, además del permiso, la
 * contraseña y la llave de acceso, o un código de recuperación (ADR-020). El servidor lo dice con `ELEVACION_REQUERIDA`; este
 * proveedor abre el diálogo, eleva la sesión y reintenta lo que se había pedido, UNA vez. Si la
 * persona cancela, se devuelve el rechazo tal cual: la pantalla lo enseña y no se pierde nada.
 */

type PedirElevacion = () => Promise<boolean>;
const Contexto = createContext<PedirElevacion | null>(null);

export function ElevacionProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const resolver = useRef<((elevada: boolean) => void) | null>(null);

  const pedir = useCallback<PedirElevacion>(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setAbierto(true);
      }),
    [],
  );

  const cerrar = (elevada: boolean) => {
    setAbierto(false);
    resolver.current?.(elevada);
    resolver.current = null;
  };

  return (
    <Contexto.Provider value={pedir}>
      {children}
      {abierto && <DialogoElevacion onCerrar={cerrar} />}
    </Contexto.Provider>
  );
}

/** Abre el diálogo de confirmación. `true` si la sesión quedó elevada. */
export function usePedirElevacion(): PedirElevacion {
  const v = useContext(Contexto);
  if (!v) throw new Error("usePedirElevacion se usó fuera de ElevacionProvider");
  return v;
}

/**
 * Envuelve una acción de servidor: si responde `ELEVACION_REQUERIDA`, pide confirmar identidad
 * y la repite una vez. Cualquier otro resultado pasa tal cual.
 */
export function useConElevacion() {
  const pedir = usePedirElevacion();
  return useCallback(
    async <T,>(accion: () => Promise<Resultado<T>>): Promise<Resultado<T>> => {
      const r = await accion();
      if (r.ok || r.motivo !== "ELEVACION_REQUERIDA") return r;
      return (await pedir()) ? accion() : r;
    },
    [pedir],
  );
}

function DialogoElevacion({ onCerrar }: { onCerrar: (elevada: boolean) => void }) {
  const factor = useSegundoFactor();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    // Primero la llave (o el código), luego todo junto al servidor: él comprueba los dos.
    const presentado = await factor.presentar(desafioParaElevar);
    if (!presentado.ok) {
      setEnviando(false);
      return setError(presentado.mensaje);
    }
    const r = await elevar(factor.contrasena, presentado.factor).catch(() => null);
    setEnviando(false);
    if (r?.ok) return onCerrar(true);
    factor.vaciar();
    setError(r ? r.mensaje : "El servidor no respondió. Inténtalo de nuevo.");
  };

  const pie = (
    <div className="flex gap-2">
      <Button surface="admin" variant="ghost" className="flex-1" onClick={() => onCerrar(false)} disabled={enviando}>
        Cancelar
      </Button>
      <Button surface="admin" variant="primary" className="flex-1" onClick={() => void confirmar()} disabled={!factor.listo || enviando}>
        <ShieldCheck size={15} aria-hidden="true" />
        {enviando ? "Comprobando…" : "Confirmar"}
      </Button>
    </div>
  );

  return (
    <Dialog
      abierto
      onCerrar={() => onCerrar(false)}
      titulo="Confirma que eres tú"
      descripcion="Para configuración, precios y personas hace falta tu contraseña y tu llave de acceso. Vale 15 minutos en esta sesión."
      pie={pie}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (factor.listo && !enviando) void confirmar();
        }}
      >
        <CamposDeIdentidad factor={factor} surface="admin" error={error} />
        {/* Enviar con Intro desde cualquier campo. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
