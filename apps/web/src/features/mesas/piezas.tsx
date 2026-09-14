"use client";

import type { ElementoFijoDto } from "@l2/contracts";

/**
 * Lo que no se mueve del local: parque, puertas, barra y cocina — V3, V4.
 *
 * Vive aquí y no dentro de cada pantalla porque el **servicio y el editor
 * tienen que dibujar el mismo local**. Cuando eran dos copias, el editor
 * centraba el rótulo de las puertas y «Entrada» salía cortada contra la pared.
 */

const FIJO: Readonly<Record<ElementoFijoDto["kind"], { fondo: string; opacidad: number; rayado?: boolean }>> = {
  PARQUE: { fondo: "var(--color-brand)", opacidad: 1, rayado: true },
  CAJA: { fondo: "var(--color-surface-2)", opacidad: 0.9 },
  BARRA: { fondo: "var(--color-surface-2)", opacidad: 0.9 },
  COCINA: { fondo: "var(--color-surface-2)", opacidad: 0.9 },
  PUERTA: { fondo: "var(--color-base)", opacidad: 1 },
  PARED: { fondo: "var(--color-line-strong)", opacidad: 1 },
};

/** El rayado del parque. Va una vez por SVG, dentro de `<defs>`. */
export function TramaParque() {
  return (
    <pattern id="l2-rayado" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="12" stroke="var(--color-brand)" strokeWidth="2" opacity="0.28" />
    </pattern>
  );
}

export function PiezaFija({ f, atenuada = false }: { f: ElementoFijoDto; atenuada?: boolean }) {
  const p = FIJO[f.kind];
  const relleno = p.rayado ? "url(#l2-rayado)" : p.fondo;
  const esPuerta = f.kind === "PUERTA";
  return (
    <g opacity={atenuada ? 0.55 : 1}>
      {f.points ? (
        <polygon
          points={f.points.map((q) => `${q.x},${q.y}`).join(" ")}
          fill={relleno}
          fillOpacity={p.opacidad}
          stroke="var(--color-line-strong)"
          strokeOpacity={0.6}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      ) : (
        <rect
          x={f.x}
          y={f.y}
          width={f.width}
          height={f.height}
          rx={esPuerta ? 3 : 10}
          fill={relleno}
          fillOpacity={p.opacidad}
          stroke="var(--color-line-strong)"
          strokeOpacity={0.6}
          strokeWidth={2}
        />
      )}
      {f.label &&
        (esPuerta ? (
          // El nombre de una puerta no cabe dentro de la puerta: va al lado, y
          // hacia dentro de la zona que abre, donde no hay mesas ni sillas.
          <text
            x={f.width >= f.height ? f.x + f.width / 2 : f.x + f.width + 8}
            y={f.width >= f.height ? f.y - 14 : f.y + f.height / 2}
            textAnchor={f.width >= f.height ? "middle" : "start"}
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
            fill="var(--color-ink-3)"
          >
            {f.label}
          </text>
        ) : (
          <text
            x={f.x + f.width / 2}
            y={f.kind === "PARQUE" ? f.y + f.height / 2 : f.y + 24}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={15}
            fontWeight={700}
            letterSpacing="2.5"
            fill="var(--color-ink-3)"
          >
            {f.label.toUpperCase()}
          </text>
        ))}
    </g>
  );
}

/** El suelo del local: el rectángulo sobre el que va todo lo demás. */
export function Suelo({ width, height }: { width: number; height: number }) {
  return (
    <rect
      x="1"
      y="1"
      width={width - 2}
      height={height - 2}
      rx="14"
      fill="var(--color-surface)"
      stroke="var(--color-line)"
      strokeWidth="2"
    />
  );
}
