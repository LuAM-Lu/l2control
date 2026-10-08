"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, CircleHelp, Lightbulb, MessageSquareWarning, PlayCircle, Search, TriangleAlert } from "lucide-react";
import { Button, Input, Sheet, cn } from "@l2/ui";
import { buscar, codigoDelProblema, entradaDe, problemaDe, type EntradaDelManual, type Problema } from "./manual.ts";
import { MisReportes } from "../soporte/MisReportes.tsx";
import { recorridoDe, RECORRIDOS, type RecorridoDePantalla } from "./recorridos.ts";

/**
 * La hoja de ayuda — T-12 (M-27, P-4).
 *
 * Sin buscar, enseña la pantalla en la que se está: para qué sirve, cómo se usa, su recorrido y sus problemas
 * frecuentes. Si se abrió desde un aviso de error que el manual conoce, empieza por esa solución. Buscando, recorre
 * todo el manual. Sin IA: lo que dice es lo que está escrito en `manual.ts` (D-SOP decidirá si se suma un asistente).
 */
export function AyudaPanel({
  abierto,
  onCerrar,
  ruta,
  consulta,
  onRecorrido,
  onReportar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  ruta: string;
  /** El texto del error con que se abrió, si se abrió desde un aviso. */
  consulta: string | null;
  onRecorrido: (r: RecorridoDePantalla) => void;
  /** Abre «Reportar un problema» (T-11), con el código del error si se reporta desde su ayuda. Sin sesión, no hay. */
  onReportar: ((codigoError: string | null) => void) | null;
}) {
  const [texto, setTexto] = useState("");
  /** La pantalla que se está leyendo: la actual, o una elegida en la búsqueda. */
  const [leyendo, setLeyendo] = useState<EntradaDelManual | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setTexto("");
    setLeyendo(null);
  }, [abierto]);

  const actual = leyendo ?? entradaDe(ruta);
  const delError = consulta ? problemaDe(consulta, ruta) : null;
  const resultados = useMemo(() => buscar(texto), [texto]);
  const recorrido = actual ? (actual.recorrido ? (RECORRIDOS.find((r) => r.id === actual.recorrido) ?? null) : null) : recorridoDe(ruta);
  const enEstaPantalla = actual !== null && actual === entradaDe(ruta);

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Ayuda"
      descripcion={actual ? actual.titulo : "El manual del sistema"}
      pie={
        onReportar ? (
          // T-11: el problema llega al soporte con la pantalla, la versión, los últimos errores y la captura.
          <Button variant="neutral" surface="tablet" className="w-full" onClick={() => onReportar(null)}>
            <MessageSquareWarning size={17} aria-hidden="true" />
            Reportar un problema
          </Button>
        ) : (
          <p className="w-full text-nota text-ink-3">¿No se resuelve? Avisa a administración con lo que dice el aviso. F1 abre esta ayuda desde cualquier pantalla.</p>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Buscar en la ayuda"
          surface="tablet"
          leading={<Search size={16} aria-hidden="true" />}
          placeholder="Pulsera, turno, imprimir, mesa…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoComplete="off"
        />

        {texto.trim().length >= 2 ? (
          <section aria-label="Resultados">
            {resultados.length === 0 ? (
              <p className="text-[13.5px] text-ink-3">Nada en el manual con esas palabras. Prueba con otra, o avisa a administración.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {resultados.map((r) => (
                  <li key={`${r.entrada.id}-${r.problema?.sintoma ?? ""}`}>
                    {r.problema ? (
                      <ProblemaPlegable problema={r.problema} pantalla={r.entrada.titulo} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setLeyendo(r.entrada);
                          setTexto("");
                        }}
                        className="flex min-h-12 w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-base/40 px-3 text-left hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        <CircleHelp size={16} aria-hidden="true" className="shrink-0 text-brand" />
                        <span className="min-w-0 flex-1 text-[14px] font-semibold text-ink">{r.entrada.titulo}</span>
                        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            {delError?.problema && (
              <section aria-label="Lo que pasó" className="rounded-[var(--radius-card)] border border-state-warn/50 bg-state-warn-bg/40 p-3">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-state-warn uppercase">
                  <TriangleAlert size={14} aria-hidden="true" />
                  Lo que pasó
                </p>
                <p className="mt-1 text-[14px] font-semibold text-ink">{delError.problema.sintoma}</p>
                <p className="mt-1 flex gap-1.5 text-[14px] leading-relaxed text-ink-2">
                  <Lightbulb size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-brand" />
                  {delError.problema.solucion}
                </p>
                {onReportar && (
                  <button
                    type="button"
                    onClick={() => onReportar(codigoDelProblema(delError))}
                    className="mt-2 min-h-12 cursor-pointer text-detalle font-semibold text-brand hover:underline"
                  >
                    ¿No se resolvió? Repórtalo
                  </button>
                )}
              </section>
            )}

            {actual ? (
              <>
                <section aria-label="Para qué sirve">
                  {!enEstaPantalla && (
                    <button type="button" onClick={() => setLeyendo(null)} className="mb-2 cursor-pointer text-[13px] font-semibold text-brand hover:underline">
                      ← Volver a la ayuda de esta pantalla
                    </button>
                  )}
                  <p className="text-[14.5px] leading-relaxed text-ink">{actual.proposito}</p>
                </section>

                <section aria-label="Cómo se usa">
                  <h3 className="mb-2 text-[12px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Cómo se usa</h3>
                  <ol className="flex flex-col gap-2">
                    {actual.pasos.map((p, i) => (
                      <li key={p} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                        <span className="tnum grid size-6 shrink-0 place-content-center rounded-full bg-brand/15 text-[12px] font-bold text-brand">{i + 1}</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ol>
                  {recorrido && enEstaPantalla && (
                    <Button variant="neutral" surface="tablet" className="mt-3 w-full" onClick={() => onRecorrido(recorrido)}>
                      <PlayCircle size={17} aria-hidden="true" />
                      Ver el recorrido de esta pantalla
                    </Button>
                  )}
                </section>

                {actual.problemas.length > 0 && (
                  <section aria-label="Problemas frecuentes">
                    <h3 className="mb-2 text-[12px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Problemas frecuentes</h3>
                    <ul className="flex flex-col gap-1.5">
                      {actual.problemas.map((p) => (
                        <li key={p.sintoma}>
                          <ProblemaPlegable problema={p} abierto={p === delError?.problema} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <p className="text-[14px] text-ink-2">Esta pantalla todavía no tiene su página en el manual. Busca arriba lo que necesitas.</p>
            )}

            {/* T-11: lo que reportó esta persona, y cómo va. */}
            {onReportar && (
              <section aria-label="Mis reportes">
                <h3 className="mb-2 text-[12px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Mis reportes</h3>
                <MisReportes />
              </section>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Un problema: el síntoma se ve siempre; la solución, al tocarlo (o abierta si es el del aviso). */
function ProblemaPlegable({ problema, pantalla, abierto = false }: { problema: Problema; pantalla?: string; abierto?: boolean }) {
  return (
    <details open={abierto} className={cn("group rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2.5", abierto && "border-brand/50")}>
      <summary className="flex cursor-pointer list-none items-start gap-2 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-3 transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1">
          {problema.sintoma}
          {pantalla && <span className="block text-[12px] font-normal text-ink-3">{pantalla}</span>}
        </span>
      </summary>
      <p className="mt-2 pl-6 text-[14px] leading-relaxed text-ink-2">{problema.solucion}</p>
    </details>
  );
}
