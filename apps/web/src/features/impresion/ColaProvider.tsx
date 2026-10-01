"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Ban, CircleCheck, Clock3, Printer, RotateCcw, TriangleAlert } from "lucide-react";
import type { DescartarTrabajosCommand, Rechazo, Resultado, TrabajoDeImpresionDto, TrabajosDescartadosDto } from "@l2/contracts";
import { Button, avisar, cn } from "@l2/ui";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { descartarTrabajos, leerTrabajos, reintentarTrabajo } from "./impresion.acciones";

/**
 * La cola de impresión de la sucursal, en vivo — B5-2, ADR-015, ADR-026.
 *
 * Lo que se manda a imprimir no avanza por haberlo intentado: aquí se ve si salió (CONFIRMADO), si está
 * en camino o si falló, con su motivo, «Reintentar» y «Descartar». Se vuelve a leer cuando el canal dice que cambió
 * algo de la impresión (un agente confirmó, falló o se encoló otro). Nada se guarda en el navegador.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor." };

type Valor = Readonly<{
  trabajos: readonly TrabajoDeImpresionDto[];
  /** Vuelve a leer la cola (tras encolar algo, sin esperar al canal). */
  releer: () => Promise<void>;
  reintentar: (id: string) => Promise<Resultado<TrabajoDeImpresionDto>>;
  /** Lo que falló o espera y ya no importa: no se imprime y deja de avisar (queda en el historial). */
  descartar: (cmd: DescartarTrabajosCommand) => Promise<Resultado<TrabajosDescartadosDto>>;
}>;

const Contexto = createContext<Valor | null>(null);

export function ColaProvider({ inicial, children }: { inicial: readonly TrabajoDeImpresionDto[]; children: React.ReactNode }) {
  const [trabajos, setTrabajos] = useState<readonly TrabajoDeImpresionDto[]>(inicial);
  const huella = JSON.stringify(inicial.map((t) => [t.id, t.estado]));
  useEffect(() => {
    setTrabajos(inicial);
  }, [huella]);

  const releer = useCallback(async () => {
    const r = await leerTrabajos().catch(() => null);
    if (r?.ok) setTrabajos(r.valor.trabajos);
  }, []);
  useAlCambiar(["impresion"], () => void releer());

  const reintentar = useCallback(
    async (id: string) => {
      const r = await reintentarTrabajo({ trabajoId: id }).catch(() => sinConexion);
      if (r.ok) void releer();
      return r;
    },
    [releer],
  );

  const descartar = useCallback(
    async (cmd: DescartarTrabajosCommand) => {
      const r = await descartarTrabajos(cmd).catch(() => sinConexion);
      if (r.ok) void releer();
      return r;
    },
    [releer],
  );

  const valor = useMemo(() => ({ trabajos, releer, reintentar, descartar }), [trabajos, releer, reintentar, descartar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCola(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useCola se usó fuera de ColaProvider");
  return v;
}

/** Los trabajos de la cola que fallaron y nadie ha reintentado. */
export function useFallidos(): readonly TrabajoDeImpresionDto[] {
  const { trabajos } = useCola();
  return useMemo(() => trabajos.filter((t) => t.estado === "FALLIDO"), [trabajos]);
}

/** Cómo se dice cada estado: texto, icono y tono (nunca solo color). */
export const ESTADO_DE_TRABAJO = {
  PENDIENTE: { texto: "En cola", Icono: Clock3, tono: "text-ink-2" },
  ENVIADO: { texto: "Imprimiendo…", Icono: Printer, tono: "text-ink-2" },
  CONFIRMADO: { texto: "Impreso", Icono: CircleCheck, tono: "text-state-ok" },
  FALLIDO: { texto: "No salió", Icono: TriangleAlert, tono: "text-state-crit" },
  DESCARTADO: { texto: "Descartado", Icono: Ban, tono: "text-ink-3" },
} as const;

/**
 * Cómo va la última impresión de algo (un recibo, un corte): estado con icono y texto, la hora, el
 * motivo si falló y «Reintentar». Sin trabajos, nada.
 */
export function EstadoDeImpresion({
  ventaId,
  corteId,
  impresoraId,
  className,
}: {
  ventaId?: string;
  corteId?: string;
  /** El último trabajo de esa impresora, sea cual sea. */
  impresoraId?: string;
  className?: string;
}) {
  const { trabajos, reintentar } = useCola();
  const hora = useHora();
  const [reintentando, setReintentando] = useState(false);
  const t = trabajos.find((x) => (ventaId && x.ventaId === ventaId) || (corteId && x.corteId === corteId) || (impresoraId && x.impresora.id === impresoraId));
  if (!t) return null;
  const e = ESTADO_DE_TRABAJO[t.estado];
  return (
    <div role="status" className={cn("flex min-h-10 items-center gap-2 text-[12.5px]", className)}>
      <e.Icono size={15} className={cn("shrink-0", e.tono)} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={cn("font-semibold", e.tono)}>{e.texto}</span>
        <span className="text-ink-3">
          {" "}
          · {t.copia ? "copia · " : ""}
          {t.impresora.nombre} · {hora(Date.parse(t.terminadoEn ?? t.creadoEn))}
        </span>
        {t.estado === "DESCARTADO" ? (
          <span className="block truncate text-ink-3">Lo descartó {t.descartadoPor}</span>
        ) : (
          t.estado !== "CONFIRMADO" && t.error && <span className="block truncate text-ink-2">{t.error}</span>
        )}
      </span>
      {t.estado === "FALLIDO" && (
        <Button
          surface="tablet"
          variant="neutral"
          className="shrink-0 text-[13px]"
          disabled={reintentando}
          onClick={async () => {
            setReintentando(true);
            const r = await reintentar(t.id);
            setReintentando(false);
            if (!r.ok) avisar.error(r.mensaje);
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          Reintentar
        </Button>
      )}
    </div>
  );
}
