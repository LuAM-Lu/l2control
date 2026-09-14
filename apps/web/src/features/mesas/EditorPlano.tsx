"use client";

import { useRef, useState } from "react";
import { Plus, Redo2, RotateCw, Save, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import { PlanoLocalSchema, type DiningTableDto, type PlanoLocalDto } from "@l2/contracts";
import { Button, Container, Input, PageHeader, avisar, cn } from "@l2/ui";
import { PiezaFija, Suelo, TramaParque } from "./piezas.tsx";
import { usePlano } from "./PlanoProvider.tsx";
import {
  PASO_CM,
  PASO_LARGO_CM,
  REJILLA_CM,
  ajustar,
  dentroDelLocal,
  huecoLibre,
  mesasConProblema,
  siguienteNumero,
} from "./geometria.ts";

/**
 * Editor del plano del local — V4 (UX-MEJORAS §2.2 y §2.3), D10.
 *
 * MODO EDICIÓN, NUNCA MEZCLADO CON EL SERVICIO. Vive en el back-office y solo
 * lo abre administración. Lo que se toca aquí es un **borrador**: el salón
 * sigue viendo el plano publicado hasta que se pulsa «Publicar». Cambiar el
 * plano en plena tarde dejaría a mesero, cocina y caja viendo cosas distintas.
 *
 * LO QUE HACE QUE SE PUEDA USAR
 *
 * - **Ajuste a la rejilla** de 10 cm al soltar: un plano a ojo queda torcido.
 * - **Sin arrastre también se puede** (WCAG 2.5.7): las flechas mueven la mesa
 *   elegida 10 cm, con Mayús 50, y el panel de la derecha permite teclear la
 *   posición. Nada depende de saber arrastrar.
 * - **Los problemas se ven antes de publicar**: una mesa fuera de las paredes o
 *   encima de otra se marca en rojo, y «Publicar» se niega mientras haya alguna.
 * - **Deshacer y rehacer**, y «Descartar» para volver a lo publicado.
 * - **Nada se borra**: una mesa se RETIRA y conserva su número, porque los
 *   pedidos y cobros del pasado la nombran (regla 5). Se puede volver a poner.
 *
 * TODO(F6-01/backend): publicar creará una versión con fecha y el historial de
 * planos; hoy sustituye el plano de esta sesión del navegador.
 */

type Borrador = PlanoLocalDto;

export function EditorPlano() {
  const { plano: publicado, publicar } = usePlano();
  const [historial, setHistorial] = useState<Borrador[]>([publicado]);
  const [paso, setPaso] = useState(0);
  const [elegida, setElegida] = useState<string | null>(null);
  const [errores, setErrores] = useState<readonly string[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrastrando = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const borrador = historial[paso]!;
  const problemas = mesasConProblema(borrador);
  const sucio = JSON.stringify(borrador) !== JSON.stringify(publicado);
  const mesa = borrador.tables.find((m) => m.id === elegida) ?? null;
  const enSalon = borrador.tables.filter((m) => !m.retiredAt);
  const retiradas = borrador.tables.filter((m) => m.retiredAt);

  /** Cada cambio entra en el historial: deshacer es barato y da confianza. */
  function cambiar(siguiente: Borrador) {
    setHistorial((h) => [...h.slice(0, paso + 1), siguiente]);
    setPaso((p) => p + 1);
    setErrores([]);
  }

  const cambiarMesa = (id: string, cambio: Partial<DiningTableDto>) =>
    cambiar({ ...borrador, tables: borrador.tables.map((m) => (m.id === id ? { ...m, ...cambio } : m)) });

  function mover(id: string, x: number, y: number) {
    const m = borrador.tables.find((t) => t.id === id);
    if (!m) return;
    const puesta = dentroDelLocal({ ...m, x: ajustar(x), y: ajustar(y) }, borrador);
    cambiarMesa(id, { x: puesta.x, y: puesta.y });
  }

  function anadir() {
    const id = `mesa-${globalThis.crypto.randomUUID().slice(0, 6)}`;
    const base: DiningTableDto = {
      id,
      label: siguienteNumero(borrador),
      zone: mesa?.zone ?? enSalon[0]?.zone ?? "Salón",
      seats: 4,
      shape: "REDONDA",
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      rotation: 0,
    };
    const hueco = huecoLibre(borrador, base);
    cambiar({ ...borrador, tables: [...borrador.tables, { ...base, ...hueco }] });
    setElegida(id);
  }

  /** Retirar no borra: la mesa deja el salón y conserva su número y su historia. */
  function retirar(m: DiningTableDto) {
    cambiarMesa(m.id, { retiredAt: new Date().toISOString() });
    setElegida(null);
  }

  function devolver(m: DiningTableDto) {
    const sinFecha: DiningTableDto = { ...m };
    delete (sinFecha as { retiredAt?: string }).retiredAt;
    const hueco = huecoLibre({ ...borrador, tables: borrador.tables.filter((t) => t.id !== m.id) }, sinFecha);
    cambiar({
      ...borrador,
      tables: borrador.tables.map((t) => (t.id === m.id ? { ...sinFecha, ...hueco, label: siguienteNumero(borrador) } : t)),
    });
    setElegida(m.id);
  }

  function alPublicar() {
    const r = PlanoLocalSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([...new Set(r.error.issues.map((i) => i.message))]);
      return;
    }
    publicar(r.data);
    setHistorial([r.data]);
    setPaso(0);
    setErrores([]);
    avisar.ok("Plano publicado", { detalle: "El salón ya ve la nueva distribución." });
  }

  function descartar() {
    setHistorial([publicado]);
    setPaso(0);
    setElegida(null);
    setErrores([]);
  }

  /* ── arrastre con puntero, con ajuste al soltar ── */
  const aCm = (e: { clientX: number; clientY: number }) => {
    const caja = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - caja.left) / caja.width) * borrador.width,
      y: ((e.clientY - caja.top) / caja.height) * borrador.height,
    };
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Restaurante", href: "/panel/restaurante" },
          { texto: "Plano del local" },
        ]}
        titulo="Plano del local"
        descripcion="Lo que cambies aquí es un borrador: el salón lo verá cuando publiques."
        acciones={
          <div className="flex flex-wrap items-center gap-2">
          <Button surface="admin" variant="ghost" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
            <Undo2 size={15} aria-hidden="true" />
            Deshacer
          </Button>
          <Button
            surface="admin"
            variant="ghost"
            onClick={() => setPaso((p) => Math.min(historial.length - 1, p + 1))}
            disabled={paso >= historial.length - 1}
          >
            <Redo2 size={15} aria-hidden="true" />
            Rehacer
          </Button>
          <Button surface="admin" variant="neutral" onClick={anadir}>
            <Plus size={15} aria-hidden="true" />
            Añadir mesa
          </Button>
          <Button surface="admin" variant="ghost" onClick={descartar} disabled={!sucio}>
            Descartar
          </Button>
          <Button surface="admin" variant="primary" onClick={alPublicar} disabled={!sucio || problemas.size > 0}>
            <Save size={15} aria-hidden="true" />
            Publicar
          </Button>
          </div>
        }
      />

      {problemas.size > 0 && (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          Hay {problemas.size === 1 ? "una mesa mal colocada" : `${problemas.size} mesas mal colocadas`}: fuera de las
          paredes o encima de otra. Se marcan en rojo y no se puede publicar así.
        </p>
      )}
      {errores.map((e) => (
        <p key={e} role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          {e}
        </p>
      ))}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* ── el lienzo ── */}
        <div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${borrador.width} ${borrador.height}`}
            role="group"
            aria-label="Plano en edición"
            className="mx-auto max-h-[62vh] w-full touch-none rounded-[var(--radius-card)] border border-line bg-surface"
            style={{ aspectRatio: `${borrador.width} / ${borrador.height}` }}
            onPointerMove={(e) => {
              const a = arrastrando.current;
              if (!a) return;
              const p = aCm(e);
              mover(a.id, p.x - a.dx, p.y - a.dy);
            }}
            onPointerUp={() => {
              arrastrando.current = null;
            }}
          >
            <defs>
              <TramaParque />
              <pattern id="l2-rejilla" width={REJILLA_CM * 5} height={REJILLA_CM * 5} patternUnits="userSpaceOnUse">
                <path
                  d={`M ${REJILLA_CM * 5} 0 L 0 0 0 ${REJILLA_CM * 5}`}
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            {/* El mismo local que ve el salón, con la rejilla del editor encima. */}
            <Suelo width={borrador.width} height={borrador.height} />
            <rect x="0" y="0" width={borrador.width} height={borrador.height} fill="url(#l2-rejilla)" />

            {/* La estructura está bloqueada: se edita en otro sitio (§2.3). */}
            {borrador.fixtures.map((f) => (
              <PiezaFija key={f.id} f={f} atenuada />
            ))}

            {enSalon.map((m) => {
              const mala = problemas.has(m.id);
              const activa = m.id === elegida;
              const r = Math.min(m.width, m.height) / 2;
              return (
                <g
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={activa}
                  aria-label={`Mesa ${m.label}, ${m.zone}, en ${m.x} por ${m.y} centímetros`}
                  className="cursor-grab focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    const p = aCm(e);
                    arrastrando.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y };
                    setElegida(m.id);
                  }}
                  onKeyDown={(e) => {
                    const salto = e.shiftKey ? PASO_LARGO_CM : PASO_CM;
                    const d: Record<string, [number, number]> = {
                      ArrowLeft: [-salto, 0],
                      ArrowRight: [salto, 0],
                      ArrowUp: [0, -salto],
                      ArrowDown: [0, salto],
                    };
                    const paso2 = d[e.key];
                    if (!paso2) return;
                    e.preventDefault();
                    setElegida(m.id);
                    mover(m.id, m.x + paso2[0], m.y + paso2[1]);
                  }}
                >
                  {activa && (
                    <circle cx={m.x} cy={m.y} r={r + 8} fill="none" stroke="var(--color-brand)" strokeWidth={4} />
                  )}
                  {m.shape === "REDONDA" ? (
                    <circle
                      cx={m.x}
                      cy={m.y}
                      r={r}
                      fill={mala ? "var(--color-state-crit-bg)" : "var(--color-surface-2)"}
                      stroke={mala ? "var(--color-state-crit)" : "var(--color-line-strong)"}
                      strokeWidth={3}
                    />
                  ) : (
                    <rect
                      x={m.x - m.width / 2}
                      y={m.y - m.height / 2}
                      width={m.width}
                      height={m.height}
                      rx={10}
                      transform={`rotate(${m.rotation} ${m.x} ${m.y})`}
                      fill={mala ? "var(--color-state-crit-bg)" : "var(--color-surface-2)"}
                      stroke={mala ? "var(--color-state-crit)" : "var(--color-line-strong)"}
                      strokeWidth={3}
                    />
                  )}
                  <text
                    x={m.x}
                    y={m.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={26}
                    fontWeight={700}
                    fill={mala ? "var(--color-state-crit)" : "var(--color-ink)"}
                    className="font-display"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1.5 px-1 text-[11.5px] text-ink-3">
            Arrastra una mesa, o elígela y muévela con las flechas ({PASO_CM} cm, con Mayús {PASO_LARGO_CM}). Se ajusta
            sola a la rejilla de {REJILLA_CM} cm.
          </p>
        </div>

        {/* ── propiedades de la mesa elegida ── */}
        <aside className="flex h-fit flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          {mesa && !mesa.retiredAt ? (
            <>
              <h3 className="font-display text-[17px] font-bold text-ink">Mesa {mesa.label}</h3>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Número"
                  surface="admin"
                  value={mesa.label}
                  maxLength={20}
                  onChange={(e) => cambiarMesa(mesa.id, { label: e.target.value })}
                />
                <Input
                  label="Zona"
                  surface="admin"
                  value={mesa.zone}
                  maxLength={40}
                  list="l2-zonas"
                  onChange={(e) => cambiarMesa(mesa.id, { zone: e.target.value })}
                />
                <datalist id="l2-zonas">
                  {[...new Set(enSalon.map((m) => m.zone))].map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
                <Numero
                  etiqueta="Sillas"
                  valor={mesa.seats}
                  min={1}
                  max={20}
                  paso={1}
                  onCambio={(v) => cambiarMesa(mesa.id, { seats: v })}
                />
                <Numero
                  etiqueta="Tamaño (cm)"
                  valor={mesa.width}
                  min={40}
                  max={300}
                  paso={10}
                  onCambio={(v) => cambiarMesa(mesa.id, { width: v, height: mesa.shape === "REDONDA" ? v : mesa.height })}
                />
                <Numero etiqueta="X (cm)" valor={mesa.x} min={0} max={borrador.width} paso={PASO_CM} onCambio={(v) => mover(mesa.id, v, mesa.y)} />
                <Numero etiqueta="Y (cm)" valor={mesa.y} min={0} max={borrador.height} paso={PASO_CM} onCambio={(v) => mover(mesa.id, mesa.x, v)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  surface="admin"
                  variant="neutral"
                  onClick={() =>
                    cambiarMesa(mesa.id, {
                      shape: mesa.shape === "REDONDA" ? "CUADRADA" : mesa.shape === "CUADRADA" ? "RECTANGULAR" : "REDONDA",
                      height: mesa.shape === "CUADRADA" ? Math.round(mesa.width / 2) : mesa.width,
                    })
                  }
                >
                  Forma: {mesa.shape.toLowerCase()}
                </Button>
                <Button
                  surface="admin"
                  variant="neutral"
                  onClick={() => cambiarMesa(mesa.id, { rotation: (mesa.rotation + 15) % 360 })}
                >
                  <RotateCw size={15} aria-hidden="true" />
                  Girar 15°
                </Button>
                <Button surface="admin" variant="danger" className="ml-auto" onClick={() => retirar(mesa)}>
                  <Trash2 size={15} aria-hidden="true" />
                  Retirar
                </Button>
              </div>
              <p className="text-[11.5px] text-ink-3">
                Retirar no borra: la mesa sale del salón y conserva su número, porque los pedidos y cobros de antes la
                nombran. Se puede volver a poner.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-ink-3">
              Elige una mesa del plano para cambiar su número, su zona, sus sillas o su sitio. O añade una nueva.
            </p>
          )}

          {retiradas.length > 0 && (
            <div className="mt-2 border-t border-line pt-3">
              <h3 className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Retiradas</h3>
              <ul className="flex flex-wrap gap-2">
                {retiradas.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => devolver(m)}
                      className={cn(
                        "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line-strong px-2.5 text-[12.5px] text-ink-2",
                        "hover:border-brand hover:text-ink",
                      )}
                    >
                      <X size={13} aria-hidden="true" />
                      Mesa {m.label} · devolver al salón
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Container>
  );
}

/** Un número con sus flechas: sirve con teclado y sin arrastrar nada. */
function Numero({
  etiqueta,
  valor,
  min,
  max,
  paso,
  onCambio,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  onCambio: (v: number) => void;
}) {
  return (
    <Input
      label={etiqueta}
      surface="admin"
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={paso}
      value={String(valor)}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onCambio(Math.min(Math.max(Math.round(v), min), max));
      }}
    />
  );
}
