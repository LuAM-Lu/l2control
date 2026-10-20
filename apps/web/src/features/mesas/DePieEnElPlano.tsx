"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, User } from "lucide-react";
import type { MoverDePieCommand, PosicionDePieDto, Rechazo, Resultado, PosicionesDePieDto } from "@l2/contracts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { leerPosicionesDePie, moverDePie } from "./mesas.acciones.ts";

/**
 * De pie en el plano — B6-19 (M-39, X-10).
 *
 * Cada cuenta de pie es un icono en el plano del mesero, con su nombre: se arrastra a donde está la gente y el candado lo
 * fija (solo a ese icono). Moverlo no cambia la cuenta (no le sube la versión ni choca con la caja): va en su propio
 * registro y llega en vivo a las otras tablets. Cobrada o liberada, desaparece.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: el icono no se movió." };

/** Las posiciones del servidor, releídas cuando el canal dice que cambiaron las mesas o las cuentas. */
export function usePosicionesDePie() {
  const [posiciones, setPosiciones] = useState<readonly PosicionDePieDto[]>([]);
  const leer = useCallback(() => {
    void leerPosicionesDePie()
      .then((r) => r.ok && setPosiciones(r.valor.posiciones))
      .catch(() => undefined);
  }, []);
  useEffect(() => leer(), [leer]);
  useAlCambiar(["mesas", "cuentas"], leer);
  const mover = useCallback(async (cmd: MoverDePieCommand): Promise<Resultado<PosicionesDePieDto>> => {
    const r = await moverDePie(cmd).catch(() => sinConexion);
    if (r.ok) setPosiciones(r.valor.posiciones);
    return r;
  }, []);
  return { posiciones, mover };
}

export type IconoDePie = Readonly<{ id: string; nombre: string; x: number; y: number; fijo: boolean; pideCuenta: boolean }>;

const R = 30;
/** Cuánto hay que arrastrar (en cm del plano) para que sea mover y no tocar. */
const UMBRAL = 6;
/** Medio nombre a cada lado del icono: hasta aquí llega al borde del plano. */
const MARGEN_X = 75;

/** Un icono de cuenta de pie, dentro del `<svg>` del plano: arrastrable si no tiene el candado. */
export function IconoDePieEnElPlano({
  icono,
  ancho,
  alto,
  activo,
  onElegir,
  onMover,
}: {
  icono: IconoDePie;
  ancho: number;
  alto: number;
  activo: boolean;
  onElegir: () => void;
  onMover: (x: number, y: number, fijo: boolean) => void;
}) {
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);
  const inicio = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  // v0.143.1: con el dedo, el navegador desplazaba la página y cancelaba el arrastre: `touch-action` en un elemento de
  // dentro del SVG no lo respeta. Mientras el icono se puede mover, tocarlo no desplaza nada; fijo, la página se desplaza.
  const grupo = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = grupo.current;
    if (!g || icono.fijo) return;
    const quieto = (e: TouchEvent) => e.preventDefault();
    g.addEventListener("touchstart", quieto, { passive: false });
    g.addEventListener("touchmove", quieto, { passive: false });
    return () => {
      g.removeEventListener("touchstart", quieto);
      g.removeEventListener("touchmove", quieto);
    };
  }, [icono.fijo]);
  const x = arrastre?.x ?? icono.x;
  const y = arrastre?.y ?? icono.y;

  const enElPlano = (e: React.PointerEvent<SVGGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(m.inverse());
    return { x: q.x, y: q.y };
  };
  // Dentro del plano, con su nombre entero a la vista (el nombre es más ancho que el icono).
  const dentro = (v: number, max: number, margen: number) => Math.round(Math.min(Math.max(v, margen), max - margen));

  const fondo = icono.pideCuenta ? "var(--color-state-warn-bg)" : "var(--color-brand)";
  const borde = icono.pideCuenta ? "var(--color-state-warn)" : "var(--color-brand)";
  const tinta = icono.pideCuenta ? "var(--color-state-warn)" : "var(--color-on-brand)";
  const corto = icono.nombre.length > 14 ? `${icono.nombre.slice(0, 13)}.` : icono.nombre;

  return (
    <g>
      <g
        ref={grupo}
        role="button"
        tabIndex={0}
        aria-pressed={activo}
        aria-label={`De pie · ${icono.nombre}${icono.pideCuenta ? ", pide la cuenta" : ""}${icono.fijo ? ", fijo" : ", se puede arrastrar"}`}
        style={{ touchAction: "none", cursor: icono.fijo ? "pointer" : arrastre ? "grabbing" : "grab" }}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onElegir();
          }
        }}
        onPointerDown={(e) => {
          const p = enElPlano(e);
          if (!p) return;
          inicio.current = { x: p.x, y: p.y, dx: icono.x - p.x, dy: icono.y - p.y };
          if (!icono.fijo) e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const i = inicio.current;
          if (!i || icono.fijo) return;
          const p = enElPlano(e);
          if (!p) return;
          if (!arrastre && Math.hypot(p.x - i.x, p.y - i.y) < UMBRAL) return;
          setArrastre({ x: dentro(p.x + i.dx, ancho, MARGEN_X), y: dentro(p.y + i.dy, alto, R + 24) });
        }}
        onPointerUp={() => {
          const movido = arrastre;
          inicio.current = null;
          setArrastre(null);
          if (movido) onMover(movido.x, movido.y, icono.fijo);
          else onElegir();
        }}
        onPointerCancel={() => {
          inicio.current = null;
          setArrastre(null);
        }}
      >
        {activo && <circle cx={x} cy={y} r={R + 8} fill="none" stroke="var(--color-brand)" strokeWidth={4} />}
        <circle cx={x} cy={y} r={R} fill={fondo} stroke={borde} strokeWidth={2.5} filter="url(#l2-relieve)" />
        <User x={x - 15} y={y - 15} width={30} height={30} color={tinta} strokeWidth={2.2} aria-hidden="true" />
        <text x={x} y={y + R + 18} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--color-ink)" stroke="var(--color-surface)" strokeWidth={4} paintOrder="stroke">
          {corto}
        </text>
      </g>
      {/* El candado: fija o suelta solo este icono. */}
      <g
        role="button"
        tabIndex={0}
        aria-label={icono.fijo ? `Soltar a ${icono.nombre}` : `Fijar a ${icono.nombre}`}
        style={{ cursor: "pointer" }}
        className="outline-none focus-visible:outline-2 focus-visible:outline-brand"
        onClick={() => onMover(icono.x, icono.y, !icono.fijo)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onMover(icono.x, icono.y, !icono.fijo);
          }
        }}
      >
        <circle cx={x + R * 0.85} cy={y - R * 0.85} r={13} fill="var(--color-surface)" stroke="var(--color-line-strong)" strokeWidth={2} />
        {icono.fijo ? (
          <Lock x={x + R * 0.85 - 8} y={y - R * 0.85 - 8} width={16} height={16} color="var(--color-ink)" strokeWidth={2.4} aria-hidden="true" />
        ) : (
          <LockOpen x={x + R * 0.85 - 8} y={y - R * 0.85 - 8} width={16} height={16} color="var(--color-ink-3)" strokeWidth={2.4} aria-hidden="true" />
        )}
      </g>
    </g>
  );
}
