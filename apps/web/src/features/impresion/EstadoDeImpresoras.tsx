"use client";

import { useEffect, useMemo, useRef } from "react";
import { PrinterCheck, PrinterX, TriangleAlert } from "lucide-react";
import type { ImpresoraEnLaColaDto } from "@l2/contracts";
import { cn } from "@l2/ui";
import { useCola } from "./ColaProvider.tsx";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { prepararSonido, sonar, useSilencioHasta, useSonidoDeAvisos } from "../park/sonidoDeAvisos.ts";

/** Lo que el agente dijo hace más de esto ya no se sabe: si se cayó, lo dice «en espera» (ADR-015). */
const VIGENTE_MS = 5 * 60_000;

/** Para quién avisa: la caja (sus recibos) o el salón (las comandas de cocina y de barra). */
export type Para = "caja" | "salon";

/** `corto` (T-21): lo que cabe en la barra; `texto`, al pasar el ratón. */
export type AvisoDeImpresoras = Readonly<{ tono: "crit" | "warn"; texto: string; corto: string; detalle: string }>;

/**
 * Cómo salen los papeles de esta estación (B5-6): la principal de su oficio y su respaldo. Sin papel, en rojo (el rollo
 * es el mismo por los dos caminos); la principal sin responder y el respaldo sí, en ámbar, «por el respaldo»; las dos
 * sin responder, en rojo; poco papel, en ámbar. Sin nada que decir, `null`.
 */
export function avisoDeImpresoras(impresoras: readonly ImpresoraEnLaColaDto[], para: Para, ahora: number, hora: (ms: number) => string): AvisoDeImpresoras | null {
  const vigente = (i: ImpresoraEnLaColaDto | undefined) => (i?.estado && ahora - Date.parse(i.estado.en) < VIGENTE_MS ? i.estado.estado : null);
  const principales = impresoras.filter((i) => i.respaldoDe === null && (para === "caja" ? i.recibos : i.comandas || i.barra));
  let peor: AvisoDeImpresoras | null = null;
  for (const p of principales) {
    const b = impresoras.find((i) => i.respaldoDe === p.id);
    const [ep, eb] = [vigente(p), vigente(b)];
    const detalle = `${p.nombre}: ${p.estado?.detalle ?? p.estado?.estado ?? ""} (${p.estado ? hora(Date.parse(p.estado.en)) : ""})`;
    if (ep === "SIN_PAPEL" || eb === "SIN_PAPEL") {
      return { tono: "crit", texto: para === "caja" ? "Impresora sin papel" : "Las comandas no están saliendo", corto: "Sin papel", detalle: eb === "SIN_PAPEL" && b ? `${b.nombre}: sin papel` : detalle };
    }
    if (ep === "NO_RESPONDE") {
      const sale = b && eb !== "NO_RESPONDE";
      if (!sale) return { tono: "crit", texto: para === "caja" ? "Impresora no responde" : "Las comandas no están saliendo", corto: "No responde", detalle };
      peor ??= { tono: "warn", texto: para === "caja" ? `Imprime por «${b.nombre}»` : `Comandas por «${b.nombre}»`, corto: "Por respaldo", detalle: `${detalle} · sale por su respaldo` };
    } else if (ep === "POCO_PAPEL") {
      peor ??= { tono: "warn", texto: "Queda poco papel", corto: "Poco papel", detalle };
    }
  }
  return peor;
}

/**
 * El estado de las impresoras en la barra de la estación (B5-6, M-38, W-1): color + icono + texto, y suena una vez al
 * ponerse en rojo (con el sonido de los avisos del equipo: «Silenciar» lo calla igual). Lo de cada impresora, al pasar.
 */
export function EstadoDeImpresoras({ para, className }: { para: Para; className?: string }) {
  const { impresoras } = useCola();
  const hora = useHora();
  const ahora = useAhoraLocal();
  const [suena] = useSonidoDeAvisos();
  const [calladoHasta] = useSilencioHasta();
  const aviso = useMemo(() => (ahora === 0 ? null : avisoDeImpresoras(impresoras, para, ahora, hora)), [impresoras, para, ahora, hora]);
  useEffect(() => prepararSonido(), []);
  // Suena al pasar a rojo, no cada segundo que sigue en rojo.
  const antes = useRef<string | null>(null);
  useEffect(() => {
    const clave = aviso?.tono === "crit" ? aviso.texto : null;
    if (clave && clave !== antes.current && suena && Date.now() >= calladoHasta) sonar(true);
    antes.current = clave;
  }, [aviso, suena, calladoHasta]);

  if (!aviso) return null;
  const Icono = aviso.tono === "crit" ? PrinterX : aviso.texto.startsWith("Queda") ? TriangleAlert : PrinterCheck;
  return (
    <span
      role="status"
      title={`${aviso.texto} · ${aviso.detalle}`}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 text-[13px] font-semibold whitespace-nowrap",
        aviso.tono === "crit" ? "border-state-crit/40 bg-state-crit-bg text-state-crit" : "border-state-warn/40 bg-state-warn-bg text-state-warn",
        className,
      )}
    >
      <Icono size={15} aria-hidden="true" className={cn(aviso.tono === "crit" && "l2-pulse")} />
      {/* T-21: corto en la barra; lo que dice entero, al pasar el ratón. */}
      <span>{aviso.corto}</span>
      <span className="sr-only">. {aviso.detalle}</span>
    </span>
  );
}
