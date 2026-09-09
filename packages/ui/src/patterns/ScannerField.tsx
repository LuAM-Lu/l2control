"use client";

import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { cn } from "../cn";

/**
 * Nivel 2 — patrón (§9.4). Implementa F1-11.
 *
 * El lector es HID keyboard wedge (DEC-8): "teclea" el código y pulsa Enter,
 * sin drivers. Este componente captura esas pulsaciones GLOBALMENTE, sin que
 * haga falta poner el foco en un campo — que es justo lo que necesita un
 * monitor de parque con las manos ocupadas.
 *
 * SEGURIDAD (§7.7): ese buffer global ES UNA ENTRADA NO CONFIABLE. Cualquier
 * teclado conectado puede escribir en él. Por eso valida longitud, alfabeto y
 * formato antes de emitir nada, y limita la frecuencia.
 */
const MAX_BUFFER = 64;
const INTER_KEY_TIMEOUT_MS = 120; // un humano no teclea así de rápido
const MIN_INTERVAL_MS = 250; // límite de frecuencia

export function ScannerField({
  onScan,
  validate = (code) => /^[A-Za-z0-9\-]{4,32}$/.test(code),
  placeholder = "Pasa la pulsera por el lector…",
  className,
}: {
  onScan: (code: string) => void;
  /** Formato esperado del código. Rechazar es el comportamiento por defecto. */
  validate?: (code: string) => boolean;
  placeholder?: string;
  className?: string;
}) {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  const lastEmitAt = useRef(0);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // No interferir cuando la persona está escribiendo de verdad.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastKeyAt.current > INTER_KEY_TIMEOUT_MS) buffer.current = "";
      lastKeyAt.current = now;

      if (event.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";
        if (code.length === 0) return;

        if (now - lastEmitAt.current < MIN_INTERVAL_MS) return; // límite de frecuencia

        if (!validate(code)) {
          setFeedback({ kind: "error", text: `Código no reconocido: ${code.slice(0, 16)}` });
          return;
        }
        lastEmitAt.current = now;
        setFeedback({ kind: "ok", text: `Leído ${code}` });
        onScan(code);
        return;
      }

      if (event.key.length === 1 && buffer.current.length < MAX_BUFFER) {
        buffer.current += event.key;
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onScan, validate]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(id);
  }, [feedback]);

  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-[var(--radius-control)] border px-4",
        feedback?.kind === "error"
          ? "border-state-crit/50 bg-state-crit-bg"
          : feedback?.kind === "ok"
            ? "border-state-ok/50 bg-state-ok-bg"
            : "border-dashed border-line bg-surface",
        className,
      )}
    >
      <ScanLine
        size={20}
        aria-hidden="true"
        className={
          feedback?.kind === "error"
            ? "text-state-crit"
            : feedback?.kind === "ok"
              ? "text-state-ok"
              : "text-ink-3"
        }
      />
      <span
        role="status"
        className={cn(
          "text-sm",
          feedback?.kind === "error"
            ? "text-state-crit"
            : feedback?.kind === "ok"
              ? "text-state-ok"
              : "text-ink-3",
        )}
      >
        {feedback?.text ?? placeholder}
      </span>
    </div>
  );
}
