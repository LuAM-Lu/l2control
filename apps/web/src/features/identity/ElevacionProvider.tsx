"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { MonitorCheck, ShieldCheck } from "lucide-react";
import type { OpcionesDeConfirmacion } from "@l2/application";
import type { Resultado } from "@l2/contracts";
import { Button, Dialog } from "@l2/ui";
import { desafioParaElevar, elevar, opcionesDeConfirmacion } from "./acceso.acciones";
import { CamposDeIdentidad, useSegundoFactor, type Modo } from "./SegundoFactor";

/**
 * Confirmar identidad — F2-04.
 *
 * Configuración, precios, personas y reportes globales exigen, además del permiso, la contraseña y
 * un segundo factor (ADR-029): en el equipo de confianza basta la contraseña; si no, el código de la
 * app, la llave de acceso o un código de recuperación. El servidor lo dice con `ELEVACION_REQUERIDA`; este
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

/** Lo que ofrece el diálogo, en orden: lo más cómodo primero. */
function modosDe(o: OpcionesDeConfirmacion | null): Modo[] {
  if (!o) return ["APP", "LLAVE", "CODIGO"];
  const modos: Modo[] = [];
  if (o.deConfianza) modos.push("EQUIPO");
  if (o.app) modos.push("APP");
  if (o.llaves) modos.push("LLAVE");
  if (o.codigos > 0) modos.push("CODIGO");
  return modos.length > 0 ? modos : ["CODIGO"];
}

function DialogoElevacion({ onCerrar }: { onCerrar: (elevada: boolean) => void }) {
  const [opciones, setOpciones] = useState<OpcionesDeConfirmacion | null>(null);
  const [errorOpciones, setErrorOpciones] = useState<string | null>(null);
  const factor = useSegundoFactor(modosDe(opciones));
  // Desmarcado: un equipo compartido (la caja) no debe quedar de confianza sin querer.
  const [confiar, setConfiar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    opcionesDeConfirmacion()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setOpciones(r.valor);
        else setErrorOpciones(r.mensaje);
      })
      .catch(() => vivo && setErrorOpciones("El servidor no respondió. Cierra y vuelve a intentarlo."));
    return () => {
      vivo = false;
    };
  }, []);

  // Se ofrece confiar en un equipo aprobado que aún no lo es, al confirmar con un factor de verdad.
  const ofrecerConfianza = opciones?.puedeConfiar === true && factor.modo !== "EQUIPO";

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    // Primero la llave (o el código), luego todo junto al servidor: él comprueba los dos.
    const presentado = await factor.presentar(desafioParaElevar);
    if (!presentado.ok) {
      setEnviando(false);
      return setError(presentado.mensaje);
    }
    const r = await elevar(factor.contrasena, presentado.factor, ofrecerConfianza && confiar).catch(() => null);
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
      <Button surface="admin" variant="primary" className="flex-1" onClick={() => void confirmar()} disabled={!opciones || !factor.listo || enviando}>
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
      descripcion="Para configuración, precios y personas. Vale 15 minutos en esta sesión."
      pie={pie}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (factor.listo && !enviando) void confirmar();
        }}
      >
        {errorOpciones ? (
          <p role="alert" className="text-[13px] text-state-crit">
            {errorOpciones}
          </p>
        ) : !opciones ? (
          <p className="text-[13px] text-ink-3">Comprobando cómo puedes confirmar…</p>
        ) : (
          <>
            <CamposDeIdentidad factor={factor} surface="admin" error={error} />
            {ofrecerConfianza && (
              <label className="mt-3 flex min-h-8 cursor-pointer items-start gap-2 text-[13px] text-ink-2">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-brand)]" checked={confiar} onChange={(e) => setConfiar(e.target.checked)} />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    <MonitorCheck size={14} aria-hidden="true" />
                    Confiar en este equipo
                  </span>
                  La próxima vez, aquí te bastará tu contraseña. Márcalo solo en un equipo tuyo.
                </span>
              </label>
            )}
          </>
        )}
        {/* Enviar con Intro desde cualquier campo. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
