"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { avisar, cn } from "@l2/ui";
import { cambiarTema } from "./tema.acciones";

/**
 * El interruptor del tema de este equipo. Lo que rige lo dice el servidor en `data-tema` de
 * <html>; aquí solo se lee para saber a cuál se cambia. `compacto` deja solo el icono (el pie del
 * menú del panel); sin él lleva su texto (el acceso).
 */
export function BotonTema({ compacto = false, className }: { compacto?: boolean; className?: string }) {
  // Hasta montar no se sabe cuál rige (lo pinta el servidor en <html>): se asume el predeterminado.
  const [claro, setClaro] = useState(true);
  const [cambiando, setCambiando] = useState(false);
  useEffect(() => setClaro(document.documentElement.dataset.tema === "claro"), []);

  async function alternar() {
    setCambiando(true);
    const r = await cambiarTema(claro ? "oscuro" : "claro").catch(() => null);
    setCambiando(false);
    if (!r?.ok) return avisar.error("No se pudo cambiar el tema: el servidor no respondió.");
    // Se aplica ya, sin esperar a que el servidor vuelva a pintar <html>: la cookie ya dice lo mismo.
    document.documentElement.dataset.tema = r.valor.tema;
    setClaro(r.valor.tema === "claro");
  }

  const a = claro ? "Cambiar al tema oscuro" : "Cambiar al tema claro";
  const Icono = claro ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={() => void alternar()}
      disabled={cambiando}
      title={a}
      aria-label={a}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] text-ink-2",
        "transition-colors duration-[var(--dur-rapida)] hover:bg-surface-2 hover:text-ink disabled:cursor-wait disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        compacto ? "size-8" : "min-h-12 border border-line bg-surface px-4 text-[13px] font-medium",
        className,
      )}
    >
      <Icono size={compacto ? 16 : 15} aria-hidden="true" />
      {!compacto && (claro ? "Tema oscuro" : "Tema claro")}
    </button>
  );
}
