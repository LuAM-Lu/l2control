"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { Recorrido, anotarErrorReciente, cn, erroresRecientes, registrarAyudaDeErrores, registrarReporteDeErrores } from "@l2/ui";
import { useOperador } from "../identity/operador.ts";
import { problemaDe } from "./manual.ts";
import { recorridoDe, type RecorridoDePantalla } from "./recorridos.ts";
import { marcarRecorridoVisto } from "./ayuda.acciones.ts";
import { AyudaPanel } from "./AyudaPanel.tsx";
import { capturarPantalla } from "../soporte/captura.ts";
import { ReportarDialog, type PedidoDeReporte } from "../soporte/ReportarDialog.tsx";

/**
 * La ayuda dentro de la app — T-12 (M-27, P-4).
 *
 * Tres cosas, en un solo sitio por encima de todas las pantallas:
 *  · la hoja de ayuda de la pantalla en la que se está, que abre el botón de ayuda o F1;
 *  · «Cómo se resuelve» en cada aviso de error que el manual reconoce (lo registra en `avisar`);
 *  · el recorrido guiado de una pantalla de operación, que se enseña solo la primera vez que cada persona la abre
 *    (lo guarda el servidor, por persona) y a petición desde la ayuda;
 *  · «Reportar un problema» (T-11): desde la ayuda, desde la ayuda de un error y desde el aviso de un error que el
 *    manual no conoce. La captura se toma de la pantalla, con la ayuda ya cerrada.
 */

type Ayuda = Readonly<{ abrir: () => void }>;
const Contexto = createContext<Ayuda>({ abrir: () => undefined });

/** Lo que tarda en irse la hoja de ayuda: la captura es de la pantalla, no de la ayuda. */
const ESPERA_CAPTURA_MS = 350;

/** Espera a que la pantalla se pinte antes de señalar sus elementos. */
const ESPERA_RECORRIDO_MS = 900;

export function AyudaProvider({ vistos: inicial, children }: { vistos: readonly string[]; children: React.ReactNode }) {
  const operador = useOperador();
  const ruta = usePathname();
  const clave = inicial.join(",");
  const [vistos, setVistos] = useState<ReadonlySet<string>>(() => new Set(inicial));
  // Otra persona en el equipo trae sus propios vistos.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setVistos(new Set(inicial)), [clave]);

  const [abierto, setAbierto] = useState(false);
  /** El texto del error con que se abrió la ayuda, si se abrió desde un aviso. */
  const [consulta, setConsulta] = useState<string | null>(null);
  const [recorrido, setRecorrido] = useState<RecorridoDePantalla | null>(null);

  const abrir = useCallback(() => {
    setConsulta(null);
    setAbierto(true);
  }, []);

  /** El reporte en curso (T-11): se abre con la captura ya tomada. */
  const [pedido, setPedido] = useState<PedidoDeReporte | null>(null);
  const reportar = useCallback(
    async (codigoError: string | null) => {
      setAbierto(false);
      await new Promise((listo) => window.setTimeout(listo, ESPERA_CAPTURA_MS));
      const captura = await capturarPantalla();
      setPedido({ ruta, codigoError, errores: erroresRecientes(), captura });
    },
    [ruta],
  );

  // Un error sin solución conocida trae «Reportar» en su aviso; y los errores del propio navegador cuentan como
  // recientes (solo su mensaje).
  useEffect(() => {
    if (!operador) return;
    registrarReporteDeErrores(() => void reportar(null));
    const deVentana = (e: ErrorEvent) => anotarErrorReciente(e.message);
    const dePromesa = (e: PromiseRejectionEvent) => anotarErrorReciente(e.reason instanceof Error ? e.reason.message : String(e.reason ?? ""));
    window.addEventListener("error", deVentana);
    window.addEventListener("unhandledrejection", dePromesa);
    return () => {
      registrarReporteDeErrores(null);
      window.removeEventListener("error", deVentana);
      window.removeEventListener("unhandledrejection", dePromesa);
    };
  }, [operador, reportar]);

  // La primera vez que esta persona abre una pantalla con recorrido, se enseña solo.
  useEffect(() => {
    if (!operador) return;
    const r = recorridoDe(ruta);
    if (!r || vistos.has(`${r.id}@${r.version}`)) return;
    const t = window.setTimeout(() => setRecorrido((actual) => actual ?? r), ESPERA_RECORRIDO_MS);
    return () => window.clearTimeout(t);
  }, [ruta, operador, vistos]);

  const terminar = useCallback(
    (completo: boolean) => {
      const r = recorrido;
      setRecorrido(null);
      if (!r) return;
      setVistos((prev) => new Set(prev).add(`${r.id}@${r.version}`));
      void marcarRecorridoVisto({ recorrido: r.id, version: r.version, completo }).catch(() => null);
    },
    [recorrido],
  );

  // Un error que el manual conoce trae su solución en el aviso.
  useEffect(() => {
    registrarAyudaDeErrores((texto) =>
      problemaDe(texto, ruta)
        ? () => {
            setConsulta(texto);
            setAbierto(true);
          }
        : null,
    );
    return () => registrarAyudaDeErrores(null);
  }, [ruta]);

  // F1 abre la ayuda, como en cualquier programa de escritorio.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abrir]);

  const valor = useMemo(() => ({ abrir }), [abrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <AyudaPanel
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        ruta={ruta}
        consulta={consulta}
        onRecorrido={(r) => {
          setAbierto(false);
          setRecorrido(r);
        }}
        onReportar={operador ? (codigo) => void reportar(codigo) : null}
      />
      <ReportarDialog
        pedido={pedido}
        onCerrar={() => setPedido(null)}
        onMisReportes={() => {
          setPedido(null);
          abrir();
        }}
      />
      <Recorrido pasos={recorrido?.pasos ?? []} abierto={recorrido !== null} onTerminar={terminar} etiqueta="Recorrido de esta pantalla" />
    </Contexto.Provider>
  );
}

export function useAyuda(): Ayuda {
  return useContext(Contexto);
}

/** El botón de ayuda de las barras: abre la ayuda de la pantalla en la que se está (también con F1). */
export function BotonAyuda({ className }: { className?: string }) {
  const { abrir } = useAyuda();
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label="Ayuda de esta pantalla (F1)"
      title="Ayuda (F1)"
      className={cn(
        "grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3",
        "transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
      )}
    >
      <CircleHelp size={18} aria-hidden="true" />
    </button>
  );
}
