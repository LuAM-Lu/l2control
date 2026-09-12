"use client";

import type { ReactNode } from "react";
import { CircleCheckBig, Info, TriangleAlert, OctagonAlert } from "lucide-react";
import { Toaster, toast } from "sonner";

/**
 * Nivel 2 — patrón (§9.4). Avisos pasajeros («toasts»). docs/UX-MEJORAS.md §4.2.
 *
 * CUÁNDO SE USA Y CUÁNDO NO
 * Un toast dice que **algo terminó**: «Mesa 3 abierta», «Cobrados USD 11,02».
 * No sirve para nada que el operador tenga que corregir o que siga pasando:
 *
 *  · un dato que no vale → junto al campo, y se queda hasta corregirlo;
 *  · un estado que degrada o bloquea (sin tasa, impresora sin papel) → banner fijo;
 *  · una decisión sin vuelta atrás → diálogo.
 *
 * Regla fail-closed: un error que impide operar NUNCA es solo un toast. Se va
 * solo, y lo que se va solo nadie lo vuelve a ver. Por eso `avisar.error` dura
 * más, pero no reemplaza el aviso en su sitio.
 *
 * Por qué Sonner: apila, pausa al pasar el ratón o enfocar, anuncia por
 * `aria-live` y se descarta deslizando. Aquí solo se viste con los tokens.
 */

const BASE =
  "pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start gap-2.5 rounded-[var(--radius-card)] " +
  "border border-line-strong bg-surface px-3.5 py-3 text-[13.5px] text-ink shadow-lift";

export function Avisos({
  posicion,
  desdeArriba = 16,
}: {
  /** Estaciones: arriba al centro, lejos de la acción principal. Back-office: arriba a la derecha. */
  posicion: "top-center" | "top-right";
  /** Separación desde arriba, en px: en las estaciones, lo que mide su barra. */
  desdeArriba?: number;
}) {
  return (
    <Toaster
      position={posicion}
      offset={{ top: desdeArriba, right: 16, left: 16 }}
      mobileOffset={{ top: desdeArriba, right: 16, left: 16 }}
      visibleToasts={3}
      gap={8}
      theme="dark"
      containerAriaLabel="Avisos"
      icons={{
        success: <CircleCheckBig size={17} className="text-state-ok" aria-hidden="true" />,
        info: <Info size={17} className="text-ink-2" aria-hidden="true" />,
        warning: <TriangleAlert size={17} className="text-state-warn" aria-hidden="true" />,
        error: <OctagonAlert size={17} className="text-state-crit" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Cerrar aviso",
        classNames: {
          toast: BASE,
          error: "border-state-crit/50",
          warning: "border-state-warn/50",
          icon: "mt-px shrink-0",
          content: "min-w-0 flex-1",
          title: "font-medium leading-snug",
          description: "mt-0.5 text-[12.5px] text-ink-2",
          actionButton:
            "ml-1 shrink-0 cursor-pointer self-center rounded-[var(--radius-control)] border-l border-line pl-3 " +
            "min-h-9 font-semibold text-brand hover:text-brand-2 focus-visible:outline-2 focus-visible:outline-brand",
        },
      }}
    />
  );
}

type Opciones = {
  detalle?: ReactNode;
  /** Un solo paso siguiente, con verbo: «Ver en el monitor», «Deshacer». */
  accion?: { texto: string; alPulsar: () => void };
};

function opciones(o: Opciones | undefined, base: number) {
  return {
    description: o?.detalle,
    // Con acción, más tiempo: hay que leer y decidir si se pulsa.
    duration: o?.accion ? Math.max(base, 8000) : base,
    ...(o?.accion ? { action: { label: o.accion.texto, onClick: o.accion.alPulsar } } : {}),
  };
}

export const avisar = {
  ok: (texto: string, o?: Opciones) => toast.success(texto, opciones(o, 4000)),
  info: (texto: string, o?: Opciones) => toast.info(texto, opciones(o, 5000)),
  aviso: (texto: string, o?: Opciones) => toast.warning(texto, opciones(o, 6000)),
  error: (texto: string, o?: Opciones) => toast.error(texto, opciones(o, 8000)),
};
