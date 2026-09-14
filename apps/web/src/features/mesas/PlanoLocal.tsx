"use client";

import type { ElementoFijoDto, PlanoLocalDto } from "@l2/contracts";
import { cn } from "@l2/ui";
import type { EstadoVisible, MesaVista } from "./mesas.ts";

/**
 * El plano del local, como está de verdad — V3 (UX-MEJORAS §2).
 *
 * Antes las mesas eran una rejilla ordenada por zonas: se entendía, pero no se
 * parecía al local, y el mesero traduce de cabeza «la 6» a «la del fondo». Aquí
 * cada mesa está donde está, con el parque arriba, la entrada a la izquierda y
 * la caja y la cocina a la derecha.
 *
 * DECISIONES QUE IMPORTAN
 *
 * - **Un SVG con las medidas del local** (cm), no píxeles: el mismo plano vale
 *   a 1366, en tablet y en móvil, y las medidas reales del relevamiento
 *   (F0-03) entran tal cual. Sin librería de diagramas: con ocho mesas, un
 *   `<svg>` y dos manejadores bastan.
 * - **En servicio no se arrastra nada** (§2.2): tocar una mesa la elige, nunca
 *   la mueve. Mover mesas es del editor, solo para administración (D10).
 * - **Color, icono y texto** (§8.2): la mesa lleva su número, su estado escrito
 *   y su marca; quien no distingue colores lee lo mismo.
 * - **Teclado y lectores**: cada mesa es un grupo con rol de botón, foco propio
 *   y nombre accesible («Mesa 3, Junto al parque, ocupada, 2 personas, 12
 *   minutos»); y quien prefiera leer, tiene el conmutador Plano | Lista.
 */

type Pinta = Readonly<{ fondo: string; borde: string; texto: string; punteado?: boolean }>;

const PINTA: Readonly<Record<EstadoVisible, Pinta>> = {
  LIBRE: { fondo: "var(--color-surface-2)", borde: "var(--color-line-strong)", texto: "var(--color-ink-2)" },
  OCUPADA: { fondo: "var(--color-brand)", borde: "var(--color-brand)", texto: "var(--color-on-brand)" },
  PIDE_CUENTA: { fondo: "var(--color-state-warn-bg)", borde: "var(--color-state-warn)", texto: "var(--color-state-warn)" },
  POR_LIMPIAR: {
    fondo: "var(--color-surface)",
    borde: "var(--color-line-strong)",
    texto: "var(--color-ink-3)",
    punteado: true,
  },
};

const TEXTO: Readonly<Record<EstadoVisible, string>> = {
  LIBRE: "Libre",
  OCUPADA: "Ocupada",
  PIDE_CUENTA: "Cuenta",
  POR_LIMPIAR: "Limpiar",
};

/** Cómo se pinta cada pieza fija del local. */
const FIJO: Readonly<Record<ElementoFijoDto["kind"], { fondo: string; borde: string; rayado?: boolean }>> = {
  PARQUE: { fondo: "var(--color-brand)", borde: "var(--color-brand)", rayado: true },
  CAJA: { fondo: "var(--color-surface-2)", borde: "var(--color-line-strong)" },
  BARRA: { fondo: "var(--color-surface-2)", borde: "var(--color-line-strong)" },
  COCINA: { fondo: "var(--color-surface-2)", borde: "var(--color-line-strong)" },
  PUERTA: { fondo: "var(--color-base)", borde: "var(--color-line-strong)" },
  PARED: { fondo: "var(--color-line-strong)", borde: "var(--color-line-strong)" },
};

export function PlanoLocal({
  plano,
  mesas,
  elegida,
  onElegir,
  className,
}: {
  plano: PlanoLocalDto;
  mesas: readonly MesaVista[];
  elegida: string | null;
  onElegir: (id: string) => void;
  className?: string;
}) {
  const porId = new Map(mesas.map((m) => [m.mesa.id, m]));

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${plano.width} ${plano.height}`}
        role="group"
        aria-label="Plano del local"
        className="h-auto max-h-full w-full rounded-[var(--radius-card)] border border-line bg-surface"
        style={{ aspectRatio: `${plano.width} / ${plano.height}` }}
      >
        <defs>
          {/* El parque se raya en vez de rellenarse: es una zona, no un mueble. */}
          <pattern id="l2-rayado" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="var(--color-brand)" strokeWidth="2" opacity="0.35" />
          </pattern>
        </defs>

        {/* ── la estructura: no se toca en servicio ── */}
        {plano.fixtures.map((f) => {
          const p = FIJO[f.kind];
          return (
            <g key={f.id}>
              <rect
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                rx={f.kind === "PUERTA" ? 4 : 8}
                fill={p.rayado ? "url(#l2-rayado)" : p.fondo}
                fillOpacity={p.rayado ? 1 : 0.6}
                stroke={p.borde}
                strokeOpacity={0.5}
                strokeWidth={2}
              />
              {f.label &&
                // El nombre de una puerta no cabe dentro de la puerta: va al
                // lado, y del lado por el que se entra.
                (f.kind === "PUERTA" ? (
                  <text
                    x={f.width >= f.height ? f.x + f.width / 2 : f.x + f.width + 8}
                    y={f.width >= f.height ? f.y + f.height + 16 : f.y + f.height / 2}
                    textAnchor={f.width >= f.height ? "middle" : "start"}
                    dominantBaseline="central"
                    fontSize={13}
                    fontWeight={600}
                    fill="var(--color-ink-3)"
                  >
                    {f.label}
                  </text>
                ) : (
                  <text
                    x={f.x + f.width / 2}
                    y={f.y + f.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={20}
                    fontWeight={600}
                    fill="var(--color-ink-3)"
                  >
                    {f.label}
                  </text>
                ))}
            </g>
          );
        })}

        {/* ── las mesas ── */}
        {plano.tables.map((t) => {
          const vista = porId.get(t.id);
          const estado: EstadoVisible = vista?.estado ?? "LIBRE";
          const pinta = PINTA[estado];
          const activa = t.id === elegida;
          const r = Math.min(t.width, t.height) / 2;
          const detalle =
            estado === "OCUPADA" && vista?.ocupacion
              ? `, ${vista.ocupacion.comensales} personas, ${vista.minutos} minutos`
              : "";
          return (
            <g key={t.id} transform={`rotate(${t.rotation} ${t.x} ${t.y})`}>
              <g
                role="button"
                tabIndex={0}
                aria-pressed={activa}
                aria-label={`Mesa ${t.label}, ${t.zone}, ${TEXTO[estado].toLowerCase()}${detalle}`}
                onClick={() => onElegir(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onElegir(t.id);
                  }
                }}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {/* Aro de selección: se ve sin depender del relleno. */}
                {activa && (
                  <circle cx={t.x} cy={t.y} r={r + 10} fill="none" stroke="var(--color-brand)" strokeWidth={4} />
                )}
                {t.shape === "REDONDA" ? (
                  <circle
                    cx={t.x}
                    cy={t.y}
                    r={r}
                    fill={pinta.fondo}
                    fillOpacity={estado === "OCUPADA" ? 0.9 : 1}
                    stroke={pinta.borde}
                    strokeWidth={3}
                    strokeDasharray={pinta.punteado ? "8 6" : undefined}
                  />
                ) : (
                  <rect
                    x={t.x - t.width / 2}
                    y={t.y - t.height / 2}
                    width={t.width}
                    height={t.height}
                    rx={10}
                    fill={pinta.fondo}
                    fillOpacity={estado === "OCUPADA" ? 0.9 : 1}
                    stroke={pinta.borde}
                    strokeWidth={3}
                    strokeDasharray={pinta.punteado ? "8 6" : undefined}
                  />
                )}
                <text
                  x={t.x}
                  y={t.y - 6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={30}
                  fontWeight={700}
                  fill={pinta.texto}
                  className="font-display"
                >
                  {t.label}
                </text>
                <text
                  x={t.x}
                  y={t.y + 20}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={15}
                  fontWeight={600}
                  fill={pinta.texto}
                >
                  {estado === "OCUPADA" && vista ? `${vista.minutos} min` : TEXTO[estado]}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* La leyenda dice lo mismo que el color, con palabras. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px] text-ink-3">
        {(Object.keys(TEXTO) as EstadoVisible[]).map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-3 rounded-full border-2"
              style={{
                backgroundColor: PINTA[e].fondo,
                borderColor: PINTA[e].borde,
                borderStyle: PINTA[e].punteado ? "dashed" : "solid",
              }}
            />
            {TEXTO[e]}
          </li>
        ))}
      </ul>
    </div>
  );
}
