"use client";

import type { DiningTableDto, PlanoLocalDto } from "@l2/contracts";
import { cn } from "@l2/ui";
import { PiezaFija, Suelo, TramaParque } from "./piezas.tsx";
import type { EstadoVisible, MesaVista } from "./mesas.ts";

/**
 * El plano del local, como está de verdad — V3 (UX-MEJORAS §2).
 *
 * Antes las mesas eran una rejilla ordenada por zonas: se entendía, pero no se
 * parecía al local, y el mesero traduce de cabeza «la 6» a «la del fondo». Aquí
 * cada mesa está donde está, con el parque arriba, la entrada a la izquierda y
 * la barra y la cocina a la derecha.
 *
 * DECISIONES QUE IMPORTAN
 *
 * - **Un SVG con las medidas del local** (cm), no píxeles: el mismo plano vale
 *   a 1366, en tablet y en móvil, y las medidas del relevamiento (F0-03)
 *   entran tal cual. Sin librería de diagramas: con ocho mesas basta un `<svg>`.
 * - **Las sillas se dibujan** y las ocupadas se rellenan: de un vistazo se ve
 *   si una mesa de cuatro tiene dos personas o está a tope, que es lo que el
 *   mesero mira al entrar al salón.
 * - **Una barra en L es UNA pieza**, con su contorno, no dos cajas pegadas.
 * - **En servicio no se arrastra nada** (§2.2): tocar una mesa la elige, nunca
 *   la mueve. Mover es del editor, solo para administración (D10).
 * - **Color, icono y texto** (§8.2): la mesa lleva número, sillas ocupadas y
 *   minutos o estado en palabras; quien no distingue colores lee lo mismo.
 * - **Teclado y lectores**: cada mesa es un grupo con rol de botón, foco propio
 *   y nombre accesible («Mesa 3, Junto al parque, ocupada, 2 de 4 sillas, 12
 *   minutos»).
 *
 * El dibujo es sobrio a propósito: el local en grises y el color reservado para
 * lo que pide atención. Un plano lleno de colores se deja de mirar.
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
        className="mx-auto h-auto max-h-full w-full"
        style={{ aspectRatio: `${plano.width} / ${plano.height}` }}
      >
        <defs>
          <TramaParque />
          {/* Sombra corta: da relieve sin convertir el plano en una maqueta. */}
          <filter id="l2-relieve" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
          </filter>
        </defs>

        <Suelo width={plano.width} height={plano.height} />

        {/* ── la estructura: no se toca en servicio ── */}
        {plano.fixtures.map((f) => (
          <PiezaFija key={f.id} f={f} />
        ))}

        {/* ── las mesas ── */}
        {plano.tables
          .filter((t) => !t.retiredAt)
          .map((t) => (
          <Mesa
            key={t.id}
            t={t}
            vista={porId.get(t.id) ?? null}
            activa={t.id === elegida}
            onElegir={() => onElegir(t.id)}
          />
          ))}
      </svg>

      {/* La leyenda dice lo mismo que el color, con palabras. */}
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 px-1 text-[11px] text-ink-3">
        {(Object.keys(TEXTO) as EstadoVisible[]).map((e) => (
          <li key={e} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-full border-2"
              style={{
                backgroundColor: PINTA[e].fondo,
                borderColor: PINTA[e].borde,
                borderStyle: PINTA[e].punteado ? "dashed" : "solid",
              }}
            />
            {TEXTO[e]}
          </li>
        ))}
        <li className="ml-auto hidden lg:block">Las sillas rellenas son las ocupadas</li>
      </ul>
    </div>
  );
}

/**
 * Una mesa con sus sillas alrededor.
 *
 * Las sillas se reparten en círculo desde arriba y se rellenan tantas como
 * personas haya sentadas. Girar la mesa gira sus sillas con ella, pero el
 * número se queda derecho: un «6» girado se lee «9».
 */
function Mesa({
  t,
  vista,
  activa,
  onElegir,
}: {
  t: DiningTableDto;
  vista: MesaVista | null;
  activa: boolean;
  onElegir: () => void;
}) {
  const estado: EstadoVisible = vista?.estado ?? "LIBRE";
  const pinta = PINTA[estado];
  const r = Math.min(t.width, t.height) / 2;
  const sentados = vista?.ocupacion?.comensales ?? 0;
  const detalle =
    estado === "OCUPADA" && vista?.ocupacion ? `, ${sentados} de ${t.seats} sillas, ${vista.minutos} minutos` : "";

  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={activa}
      aria-label={`Mesa ${t.label}, ${t.zone}, ${TEXTO[estado].toLowerCase()}${detalle}`}
      onClick={onElegir}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onElegir();
        }
      }}
      className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
    >
      {/* Las sillas, girando con la mesa. */}
      <g transform={`rotate(${t.rotation} ${t.x} ${t.y})`}>
        {Array.from({ length: t.seats }, (_, i) => {
          const ocupada = i < sentados;
          return (
            <g key={i} transform={`rotate(${(360 / t.seats) * i} ${t.x} ${t.y})`}>
              <rect
                x={t.x - 13}
                y={t.y - r - 14}
                width={26}
                height={14}
                rx={5}
                fill={ocupada ? "var(--color-brand)" : "var(--color-surface-2)"}
                fillOpacity={ocupada ? 0.85 : 1}
                stroke={ocupada ? "var(--color-brand)" : "var(--color-line-strong)"}
                strokeWidth={2}
              />
            </g>
          );
        })}
      </g>

      {activa && <circle cx={t.x} cy={t.y} r={r + 8} fill="none" stroke="var(--color-brand)" strokeWidth={4} />}

      {t.shape === "REDONDA" ? (
        <circle
          cx={t.x}
          cy={t.y}
          r={r}
          fill={pinta.fondo}
          fillOpacity={estado === "OCUPADA" ? 0.92 : 1}
          stroke={pinta.borde}
          strokeWidth={2.5}
          strokeDasharray={pinta.punteado ? "7 5" : undefined}
          filter="url(#l2-relieve)"
        />
      ) : (
        <rect
          x={t.x - t.width / 2}
          y={t.y - t.height / 2}
          width={t.width}
          height={t.height}
          rx={12}
          fill={pinta.fondo}
          fillOpacity={estado === "OCUPADA" ? 0.92 : 1}
          stroke={pinta.borde}
          strokeWidth={2.5}
          strokeDasharray={pinta.punteado ? "7 5" : undefined}
          filter="url(#l2-relieve)"
          transform={`rotate(${t.rotation} ${t.x} ${t.y})`}
        />
      )}

      <text
        x={t.x}
        y={t.y - 7}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={28}
        fontWeight={700}
        fill={pinta.texto}
        className="font-display"
      >
        {t.label}
      </text>
      <text
        x={t.x}
        y={t.y + 17}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={600}
        fill={pinta.texto}
        opacity={0.85}
      >
        {estado === "OCUPADA" && vista ? `${sentados}/${t.seats} · ${vista.minutos}′` : TEXTO[estado]}
      </text>
    </g>
  );
}
