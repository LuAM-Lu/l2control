"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Armchair, CalendarClock, LayoutGrid, Plus, Redo2, RotateCw, Save, Trash2, TriangleAlert, Undo2, Users, X } from "lucide-react";
import { PlanoLocalSchema, type DiningTableDto, type ElementoFijoDto, type PlanoLocalDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Badge, Button, Cifra, Confirmacion, Container, EmptyState, Input, PageHeader, Resumen, Tabs, avisar, cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { PiezaFija, Suelo, TramaParque } from "./piezas.tsx";
import { usePlano } from "./PlanoProvider.tsx";
import { PASO_CM, PASO_LARGO_CM, REJILLA_CM, ajustar, dentroDelLocal, huecoLibre, mesasConProblema, siguienteNumero } from "./geometria.ts";

/**
 * Ajustes → Plano del local — V4 (UX-MEJORAS §2.2 y §2.3), D10; en el servidor desde B6-1, con el
 * patrón de Ajustes (M-17).
 *
 * MODO EDICIÓN, NUNCA MEZCLADO CON EL SERVICIO. Lo que se toca aquí es un **borrador**: el salón sigue
 * viendo el plano publicado hasta que se pulsa «Publicar», que guarda una versión nueva en el servidor
 * (con quién y cuándo) y la lleva en vivo a todas las pantallas. Si otra persona publicó mientras tanto,
 * el servidor choca en vez de pisarla.
 *
 * LO QUE HACE QUE SE PUEDA USAR
 *
 * - **Ajuste a la rejilla** de 10 cm al soltar: un plano a ojo queda torcido.
 * - **Sin arrastre también se puede** (WCAG 2.5.7): las flechas mueven la mesa elegida 10 cm, con
 *   Mayús 50, y el panel de la derecha permite teclear la posición.
 * - **Los problemas se ven antes de publicar**: una mesa fuera de las paredes o encima de otra se marca
 *   en rojo, y «Publicar» se niega mientras haya alguna. El servidor vuelve a comprobarlo.
 * - **Deshacer y rehacer**, y «Descartar» para volver a lo publicado.
 * - **Nada se borra**: una mesa se RETIRA y conserva su número, porque los pedidos y cobros del pasado
 *   la nombran (regla 5); la hora la pone el servidor. Con su cuenta abierta no se retira.
 */

type Borrador = PlanoLocalDto;
type Vista = "plano" | "mesas" | "local";

/** Un local sin plano empieza vacío, con medidas de partida que se cambian en «Local» (F0-03). */
const LOCAL_VACIO: Borrador = { width: 800, height: 600, tables: [], fixtures: [] };

const FIJOS: readonly { kind: ElementoFijoDto["kind"]; nombre: string }[] = [
  { kind: "PARED", nombre: "Pared" },
  { kind: "PUERTA", nombre: "Puerta" },
  { kind: "PARQUE", nombre: "Parque" },
  { kind: "CAJA", nombre: "Caja" },
  { kind: "COCINA", nombre: "Cocina" },
  { kind: "BARRA", nombre: "Barra" },
];

export function EditorPlano() {
  const { plano: publicado, version, publicadoEn, publicadoPor, publicar } = usePlano();
  const actor = useActorEnSesion();
  const puede = actor !== null && can(actor, "catalogo.modificar") !== "DENEGADO";
  const reloj = useReloj();
  const { cuentas } = useCuentas();
  // Las mesas con su cuenta abierta: no se retiran (el servidor lo vuelve a comprobar).
  const ocupadas = useMemo(
    () => new Set(cuentas.filter((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR") && c.tableId).map((c) => c.tableId!)),
    [cuentas],
  );

  const base = publicado ?? LOCAL_VACIO;
  const [historial, setHistorial] = useState<Borrador[]>([base]);
  const [paso, setPaso] = useState(0);
  const [elegida, setElegida] = useState<string | null>(null);
  const [errores, setErrores] = useState<readonly string[]>([]);
  const [vista, setVista] = useState<Vista>("plano");
  const [publicando, setPublicando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const arrastrando = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const borrador = historial[paso]!;
  const sucio = JSON.stringify(borrador) !== JSON.stringify(base);
  // Otra persona publicó (llega en vivo): sin cambios propios se adopta; con cambios, se avisa.
  useEffect(() => {
    if (!sucio) {
      setHistorial([base]);
      setPaso(0);
    }
  }, [version]);
  const [versionDelBorrador, setVersionDelBorrador] = useState(version);
  useEffect(() => {
    if (!sucio) setVersionDelBorrador(version);
  }, [version, sucio]);
  const otraVersion = sucio && versionDelBorrador !== version;

  const problemas = mesasConProblema(borrador);
  const mesa = borrador.tables.find((m) => m.id === elegida) ?? null;
  const enSalon = borrador.tables.filter((m) => !m.retiredAt);
  const retiradas = borrador.tables.filter((m) => m.retiredAt);
  const aRetirar = (publicado?.tables ?? []).filter((m) => !m.retiredAt && borrador.tables.find((t) => t.id === m.id)?.retiredAt);

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
    const label = siguienteNumero(borrador);
    // Un id legible («mesa-5») mientras esté libre, también entre las retiradas y lo ya publicado; si
    // no, uno al azar. Es la identidad de la mesa: renumerarla después no la cambia.
    const usados = new Set([...borrador.tables, ...(publicado?.tables ?? [])].map((m) => m.id));
    const id = usados.has(`mesa-${label}`) ? `mesa-${globalThis.crypto.randomUUID().slice(0, 8)}` : `mesa-${label}`;
    const nueva: DiningTableDto = {
      id,
      label,
      zone: mesa?.zone ?? enSalon[0]?.zone ?? "Salón",
      seats: 4,
      shape: "REDONDA",
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      rotation: 0,
    };
    const hueco = huecoLibre(borrador, nueva);
    cambiar({ ...borrador, tables: [...borrador.tables, { ...nueva, ...hueco }] });
    setElegida(id);
    setVista("plano");
  }

  /**
   * Retirar no borra: la mesa deja el salón y conserva su número y su historia. Una mesa que nunca se
   * publicó sí se quita del borrador: nadie la nombra todavía.
   */
  function retirar(m: DiningTableDto) {
    if (ocupadas.has(m.id)) {
      avisar.error(`La mesa ${m.label} tiene su cuenta abierta: se retira cuando se cobre.`);
      return;
    }
    const publicada = (publicado?.tables ?? []).some((t) => t.id === m.id);
    if (publicada) cambiarMesa(m.id, { retiredAt: new Date().toISOString() });
    else cambiar({ ...borrador, tables: borrador.tables.filter((t) => t.id !== m.id) });
    setElegida(null);
  }

  function devolver(m: DiningTableDto) {
    const { retiredAt: _, ...sinFecha } = m;
    const hueco = huecoLibre({ ...borrador, tables: borrador.tables.filter((t) => t.id !== m.id) }, sinFecha);
    const numeroLibre = !enSalon.some((t) => t.label === m.label);
    cambiar({
      ...borrador,
      tables: borrador.tables.map((t) => (t.id === m.id ? { ...sinFecha, ...hueco, label: numeroLibre ? m.label : siguienteNumero(borrador) } : t)),
    });
    setElegida(m.id);
    setVista("plano");
  }

  function pedirPublicar() {
    const r = PlanoLocalSchema.safeParse(borrador);
    if (!r.success) {
      setErrores([...new Set(r.error.issues.map((i) => i.message))]);
      return;
    }
    if (aRetirar.length > 0) setConfirmar(true);
    else void alPublicar(r.data);
  }

  async function alPublicar(plano: PlanoLocalDto) {
    setPublicando(true);
    try {
      const r = await publicar(plano);
      if (!r.ok) {
        setErrores([r.mensaje]);
        return;
      }
      const nuevo = r.valor.plano ?? plano;
      setHistorial([nuevo]);
      setPaso(0);
      setErrores([]);
      setConfirmar(false);
      setVersionDelBorrador(r.valor.version);
      avisar.ok(`Plano publicado · versión ${r.valor.version}`, { detalle: "El salón ya ve la nueva distribución." });
    } catch {
      setErrores(["No se pudo hablar con el servidor: el plano no se publicó."]);
    } finally {
      setPublicando(false);
    }
  }

  function descartar() {
    setHistorial([base]);
    setPaso(0);
    setElegida(null);
    setErrores([]);
    setVersionDelBorrador(version);
  }

  /* ── arrastre con puntero, con ajuste al soltar ── */
  const aCm = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    const p = m ? pt.matrixTransform(m.inverse()) : pt;
    return { x: p.x, y: p.y };
  };

  const sillas = enSalon.reduce((n, m) => n + m.seats, 0);
  const ocupadasEnSalon = enSalon.filter((m) => ocupadas.has(m.id)).length;

  /* ── pestaña Plano: el lienzo y la mesa elegida ── */
  const lienzo = (
    <div className="grid min-h-0 gap-4 md:h-full lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-h-0 flex-col gap-2">
        {puede && (
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            <Button surface="admin" variant="neutral" onClick={anadir}>
              <Plus size={15} aria-hidden="true" />
              Añadir mesa
            </Button>
            <Button surface="admin" variant="ghost" aria-label="Deshacer" title="Deshacer" onClick={() => setPaso((p) => Math.max(0, p - 1))} disabled={paso === 0}>
              <Undo2 size={15} aria-hidden="true" />
            </Button>
            <Button surface="admin" variant="ghost" aria-label="Rehacer" title="Rehacer" onClick={() => setPaso((p) => Math.min(historial.length - 1, p + 1))} disabled={paso >= historial.length - 1}>
              <Redo2 size={15} aria-hidden="true" />
            </Button>
            <Button surface="admin" variant="ghost" onClick={descartar} disabled={!sucio}>
              Descartar cambios
            </Button>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${borrador.width} ${borrador.height}`}
          role="group"
          aria-label="Plano en edición"
          className="min-h-[14rem] w-full flex-1 touch-none rounded-[var(--radius-card)] border border-line bg-surface md:min-h-0"
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
              <path d={`M ${REJILLA_CM * 5} 0 L 0 0 0 ${REJILLA_CM * 5}`} fill="none" stroke="var(--color-line)" strokeWidth="1" />
            </pattern>
          </defs>
          <Suelo width={borrador.width} height={borrador.height} />
          <rect x="0" y="0" width={borrador.width} height={borrador.height} fill="url(#l2-rejilla)" />
          {/* La estructura se edita en la pestaña «Local» (§2.3). */}
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
                aria-label={`Mesa ${m.label}, ${m.zone}, en ${m.x} por ${m.y} centímetros${ocupadas.has(m.id) ? ", ocupada" : ""}`}
                className={cn(puede ? "cursor-grab" : "cursor-pointer", "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand")}
                onPointerDown={(e) => {
                  setElegida(m.id);
                  if (!puede) return;
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const p = aCm(e);
                  arrastrando.current = { id: m.id, dx: p.x - m.x, dy: p.y - m.y };
                }}
                onKeyDown={(e) => {
                  if (!puede) return;
                  const salto = e.shiftKey ? PASO_LARGO_CM : PASO_CM;
                  const d: Record<string, [number, number]> = { ArrowLeft: [-salto, 0], ArrowRight: [salto, 0], ArrowUp: [0, -salto], ArrowDown: [0, salto] };
                  const paso2 = d[e.key];
                  if (!paso2) return;
                  e.preventDefault();
                  setElegida(m.id);
                  mover(m.id, m.x + paso2[0], m.y + paso2[1]);
                }}
              >
                {activa && <circle cx={m.x} cy={m.y} r={r + 8} fill="none" stroke="var(--color-brand)" strokeWidth={4} />}
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
        <p className="shrink-0 px-1 text-[11.5px] text-ink-3">
          {enSalon.length === 0
            ? "Sin mesas todavía: añade la primera. Las medidas del local y su estructura se cambian en «Local»."
            : `Arrastra una mesa, o elígela y muévela con las flechas (${PASO_CM} cm, con Mayús ${PASO_LARGO_CM}). Se ajusta sola a la rejilla de ${REJILLA_CM} cm.`}
        </p>
      </div>

      {/* ── propiedades de la mesa elegida ── */}
      <aside className="flex h-fit flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 lg:max-h-full lg:overflow-y-auto">
        {mesa && !mesa.retiredAt ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-[17px] font-bold text-ink">Mesa {mesa.label}</h3>
              {ocupadas.has(mesa.id) && (
                <Badge tone="idle" icon={<Users size={12} aria-hidden="true" />}>
                  Con su cuenta abierta
                </Badge>
              )}
            </div>
            <fieldset disabled={!puede} className="grid grid-cols-2 gap-3">
              <Input label="Número" surface="admin" value={mesa.label} maxLength={20} onChange={(e) => cambiarMesa(mesa.id, { label: e.target.value })} />
              <Input label="Zona" surface="admin" value={mesa.zone} maxLength={40} list="l2-zonas" onChange={(e) => cambiarMesa(mesa.id, { zone: e.target.value })} />
              <datalist id="l2-zonas">
                {[...new Set(enSalon.map((m) => m.zone))].map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              <Numero etiqueta="Sillas" valor={mesa.seats} min={1} max={20} paso={1} onCambio={(v) => cambiarMesa(mesa.id, { seats: v })} />
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
            </fieldset>
            {puede && (
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
                <Button surface="admin" variant="neutral" onClick={() => cambiarMesa(mesa.id, { rotation: (mesa.rotation + 15) % 360 })}>
                  <RotateCw size={15} aria-hidden="true" />
                  Girar 15°
                </Button>
                <Button surface="admin" variant="danger" className="ml-auto" disabled={ocupadas.has(mesa.id)} onClick={() => retirar(mesa)}>
                  <Trash2 size={15} aria-hidden="true" />
                  Retirar
                </Button>
              </div>
            )}
            <p className="text-[11.5px] text-ink-3">
              {ocupadas.has(mesa.id)
                ? "Tiene su cuenta abierta: se retira cuando se cobre."
                : "Retirar no borra: la mesa sale del salón y conserva su número, porque los pedidos y cobros de antes la nombran. Se puede volver a poner."}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-ink-3">
            {puede ? "Elige una mesa del plano para cambiar su número, su zona, sus sillas o su sitio. O añade una nueva." : "Elige una mesa para ver sus datos. El plano lo cambia la administración."}
          </p>
        )}
      </aside>
    </div>
  );

  /* ── pestaña Mesas: todas, también las retiradas ── */
  const listaDeMesas =
    borrador.tables.length === 0 ? (
      <EmptyState icon={<LayoutGrid size={20} />} title="Todavía no hay mesas" hint="Añádelas en el plano: cada una con su número, su zona y sus sillas." />
    ) : (
      <div className="min-h-0 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card md:h-full">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              {["Mesa", "Zona", "Sillas", "Forma", "Estado"].map((t) => (
                <th key={t} className="px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] whitespace-nowrap text-ink-3 uppercase">
                  {t}
                </th>
              ))}
              <th className="w-full px-3 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {[...enSalon, ...retiradas].map((m) => {
              const ocupada = ocupadas.has(m.id);
              return (
                <tr key={m.id} className={cn("border-t border-line", m.retiredAt && "text-ink-3")}>
                  <td className="font-display px-3 py-2 text-[15px] font-bold whitespace-nowrap text-ink">{m.label}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.zone}</td>
                  <td className="tnum px-3 py-2">{m.seats}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.shape.toLowerCase()}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.retiredAt ? (
                      <span>Retirada{publicado?.tables.find((t) => t.id === m.id)?.retiredAt ? ` el ${reloj.dia(Date.parse(m.retiredAt))}` : " (sin publicar)"}</span>
                    ) : ocupada ? (
                      <span className="flex items-center gap-1.5 font-semibold text-ink">
                        <Users size={13} aria-hidden="true" /> Con su cuenta abierta
                      </span>
                    ) : (
                      <span className="text-ink-2">En el salón</span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    {m.retiredAt ? (
                      puede && (
                        <Button surface="admin" variant="ghost" onClick={() => devolver(m)}>
                          <X size={13} aria-hidden="true" /> Devolver al salón
                        </Button>
                      )
                    ) : (
                      <>
                        <Button
                          surface="admin"
                          variant="ghost"
                          onClick={() => {
                            setElegida(m.id);
                            setVista("plano");
                          }}
                        >
                          Ver en el plano
                        </Button>
                        {puede && (
                          <Button surface="admin" variant="ghost" disabled={ocupada} title={ocupada ? "Se retira cuando se cobre" : "Retirar del salón"} onClick={() => retirar(m)}>
                            <Trash2 size={13} aria-hidden="true" /> Retirar
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  /* ── pestaña Local: medidas y estructura ── */
  const cambiarFijo = (id: string, cambio: Partial<ElementoFijoDto>) =>
    cambiar({ ...borrador, fixtures: borrador.fixtures.map((f) => (f.id === id ? { ...f, ...cambio } : f)) });
  const local = (
    <div className="flex min-h-0 flex-col gap-4 md:h-full md:overflow-y-auto">
      <fieldset disabled={!puede} className="grid max-w-md shrink-0 grid-cols-2 gap-3">
        <legend className="font-display mb-2 text-[14px] font-bold text-ink">Medidas del local</legend>
        <Numero etiqueta="Ancho (cm)" valor={borrador.width} min={200} max={5000} paso={10} onCambio={(v) => cambiar({ ...borrador, width: v })} />
        <Numero etiqueta="Fondo (cm)" valor={borrador.height} min={200} max={5000} paso={10} onCambio={(v) => cambiar({ ...borrador, height: v })} />
      </fieldset>
      <section aria-label="Estructura" className="flex shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-[14px] font-bold text-ink">Estructura</h3>
          {puede && (
            <Button
              surface="admin"
              variant="neutral"
              onClick={() =>
                cambiar({
                  ...borrador,
                  fixtures: [...borrador.fixtures, { id: `fijo-${globalThis.crypto.randomUUID().slice(0, 8)}`, kind: "PARED", x: 0, y: 0, width: 200, height: 20, label: "" }],
                })
              }
            >
              <Plus size={14} aria-hidden="true" /> Añadir elemento
            </Button>
          )}
        </div>
        <p className="text-[12px] text-ink-3">Paredes, puertas, el parque, la caja y la cocina: lo que no se mueve en servicio. Medidas en cm desde la esquina de arriba a la izquierda.</p>
        {borrador.fixtures.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-3">Sin elementos: el plano enseña solo las mesas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {borrador.fixtures.map((f) => (
              <li key={f.id} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
                <fieldset disabled={!puede} className="grid grid-cols-2 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_repeat(4,5.5rem)_auto] sm:items-end">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Qué es</span>
                    <select
                      className="min-h-9 rounded-[var(--radius-control)] border border-line bg-surface px-2 text-[14px] text-ink"
                      value={f.kind}
                      onChange={(e) => cambiarFijo(f.id, { kind: e.target.value as ElementoFijoDto["kind"] })}
                    >
                      {FIJOS.map((k) => (
                        <option key={k.kind} value={k.kind}>
                          {k.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Input label="Rótulo" surface="admin" maxLength={40} value={f.label ?? ""} onChange={(e) => cambiarFijo(f.id, { label: e.target.value })} />
                  {f.points ? (
                    <p className="col-span-2 self-center text-[12px] text-ink-3 sm:col-span-4">Forma propia de {f.points.length} puntos: se conserva tal cual.</p>
                  ) : (
                    <>
                      <Numero etiqueta="X" valor={f.x} min={0} max={borrador.width} paso={10} onCambio={(v) => cambiarFijo(f.id, { x: v })} />
                      <Numero etiqueta="Y" valor={f.y} min={0} max={borrador.height} paso={10} onCambio={(v) => cambiarFijo(f.id, { y: v })} />
                      <Numero etiqueta="Ancho" valor={f.width} min={10} max={borrador.width} paso={10} onCambio={(v) => cambiarFijo(f.id, { width: v })} />
                      <Numero etiqueta="Alto" valor={f.height} min={10} max={borrador.height} paso={10} onCambio={(v) => cambiarFijo(f.id, { height: v })} />
                    </>
                  )}
                  {puede && (
                    <Button
                      surface="admin"
                      variant="ghost"
                      aria-label={`Quitar ${f.label || FIJOS.find((k) => k.kind === f.kind)?.nombre}`}
                      onClick={() => cambiar({ ...borrador, fixtures: borrador.fixtures.filter((x) => x.id !== f.id) })}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </Button>
                  )}
                </fieldset>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Plano del local" }]}
        titulo="Plano del local"
        descripcion="Lo que cambies aquí es un borrador: el salón lo verá cuando publiques."
        acciones={
          puede ? (
            <Button surface="admin" variant="primary" onClick={pedirPublicar} disabled={!sucio || problemas.size > 0 || enSalon.length === 0 || publicando}>
              <Save size={15} aria-hidden="true" />
              {publicando ? "Publicando…" : "Publicar"}
            </Button>
          ) : undefined
        }
      />

      <Resumen etiqueta="Resumen del plano">
        <Cifra
          etiqueta="Mesas en el salón"
          icono={<LayoutGrid aria-hidden="true" />}
          tono={enSalon.length === 0 ? "warn" : "idle"}
          valor={String(enSalon.length)}
          pie={enSalon.length === 0 ? "Sin mesas el mesero no atiende" : `${sillas} sillas · ${[...new Set(enSalon.map((m) => m.zone))].join(", ")}`}
          activo={vista === "plano"}
          onClick={() => setVista("plano")}
        />
        <Cifra
          etiqueta="Ocupadas ahora"
          icono={<Users aria-hidden="true" />}
          valor={String(ocupadasEnSalon)}
          pie={ocupadasEnSalon > 0 ? "Con su cuenta abierta: no se retiran" : "Ninguna con cuenta abierta"}
          activo={vista === "mesas"}
          onClick={() => setVista("mesas")}
        />
        <Cifra
          etiqueta="Retiradas"
          icono={<Armchair aria-hidden="true" />}
          valor={String(retiradas.length)}
          pie={retiradas.length > 0 ? "Conservan su número para el historial" : "Ninguna"}
          onClick={() => setVista("mesas")}
        />
        <Cifra
          etiqueta="Publicado"
          icono={<CalendarClock aria-hidden="true" />}
          tono={sucio ? "warn" : version === null ? "warn" : "idle"}
          valor={sucio ? "Cambios sin publicar" : version === null ? "Sin publicar" : `Versión ${version}`}
          pie={version !== null && publicadoEn ? `${reloj.diaYHora(Date.parse(publicadoEn))} · ${publicadoPor ?? ""}` : "El salón todavía no tiene plano"}
        />
      </Resumen>

      {otraVersion && (
        <p role="alert" className="mt-3 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[13px] text-state-warn">
          <TriangleAlert size={16} aria-hidden="true" />
          Otra persona publicó un plano mientras editabas. Descarta tus cambios para ver el vigente; publicar ahora chocaría.
        </p>
      )}
      {problemas.size > 0 && (
        <p role="alert" className="mt-3 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          Hay {problemas.size === 1 ? "una mesa mal colocada" : `${problemas.size} mesas mal colocadas`}: fuera de las paredes o encima de otra. Se marcan en rojo y no se
          puede publicar así.
        </p>
      )}
      {errores.map((e) => (
        <p key={e} role="alert" className="mt-3 flex shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {e}
        </p>
      ))}

      <Tabs
        etiqueta="Plano del local"
        surface="admin"
        className="mt-4 min-h-0 flex-1"
        activa={vista}
        onCambiar={(id) => setVista(id as Vista)}
        pestanas={[
          { id: "plano", etiqueta: "Plano", contenido: lienzo },
          { id: "mesas", etiqueta: "Mesas", contador: borrador.tables.length, contenido: listaDeMesas },
          { id: "local", etiqueta: "Local", contenido: local },
        ]}
      />

      <Confirmacion
        abierto={confirmar}
        onCerrar={() => setConfirmar(false)}
        titulo={aRetirar.length === 1 ? `¿Retirar la mesa ${aRetirar[0]!.label}?` : `¿Retirar ${aRetirar.length} mesas?`}
        confirmar={publicando ? "Publicando…" : "Sí, publicar"}
        ocupado={publicando}
        onConfirmar={() => void alPublicar(borrador)}
      >
        <p>
          {aRetirar.length === 1 ? "La mesa sale" : `Las mesas ${aRetirar.map((m) => m.label).join(", ")} salen`} del salón al publicar: el mesero deja de verlas. No se
          borran: conservan su número para los pedidos y cobros de antes, y se pueden devolver al salón.
        </p>
      </Confirmacion>
    </Container>
  );
}

/** Un número con sus flechas: sirve con teclado y sin arrastrar nada. */
function Numero({ etiqueta, valor, min, max, paso, onCambio }: { etiqueta: string; valor: number; min: number; max: number; paso: number; onCambio: (v: number) => void }) {
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
