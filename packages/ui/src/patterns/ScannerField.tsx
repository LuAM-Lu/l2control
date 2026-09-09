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
/**
 * Umbral que separa al lector de una persona.
 *
 * Un lector HID «teclea» el código en 10-30 ms por carácter (los de Bluetooth
 * o gama baja, hasta ~45 ms); una persona rápida no sostiene menos de ~80 ms.
 * Detectar por VELOCIDAD y no por dónde está el foco es lo que permite que el
 * operador escanee una pulsera mientras escribe el nombre del niño anterior —
 * que es justo lo que hace en taquilla con cola delante.
 *
 * ⚠ CALIBRAR CONTRA EL LECTOR REAL. Este valor depende del hardware, y el
 * criterio de F1-11 no está cumplido hasta comprobarlo con el aparato que
 * compró el cliente. 55 ms deja margen para lectores lentos sin acercarse a
 * la velocidad humana; si un lector concreto va más despacio, se sube, y si
 * alguien logra dispararlo tecleando, se baja.
 */
const SCAN_MAX_GAP_MS = 55;
const MIN_SCAN_LENGTH = 4;
const MIN_INTERVAL_MS = 250; // límite de frecuencia (§7.7)

export function ScannerField({
  onScan,
  validate,
  placeholder = "Pasa la pulsera por el lector…",
  className,
}: {
  onScan: (code: string) => void;
  /**
   * Formato esperado del código. **Obligatorio a propósito.**
   *
   * Antes había un valor por defecto con una expresión regular escrita aquí,
   * y eso era un doble error: duplicaba una regla que ya vive en
   * `@l2/contracts` (§9.7), y permitía montar un lector sin decidir qué es un
   * código válido. El camino fácil no puede ser el inseguro: quien use este
   * componente tiene que declarar qué acepta.
   */
  validate: (code: string) => boolean;
  placeholder?: string;
  className?: string;
}) {
  const buffer = useRef("");
  const lastKeyAt = useRef(0);
  const lastEmitAt = useRef(0);
  /** Campo enfocado al empezar la ráfaga, y su valor previo. */
  const burstField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const burstFieldValue = useRef("");

  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    function isTextField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
      const node = el as HTMLElement | null;
      return Boolean(node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA"));
    }

    function handleKey(event: KeyboardEvent) {
      const now = Date.now();
      const gap = now - lastKeyAt.current;
      lastKeyAt.current = now;

      // CUALQUIER pausa a velocidad humana reinicia el buffer. Así el
      // contenido siempre es «la última secuencia contigua tecleada a
      // velocidad de máquina», y el operador puede escribir un nombre y
      // escanear la siguiente pulsera acto seguido sin que se mezclen.
      if (gap > SCAN_MAX_GAP_MS) {
        buffer.current = "";
        burstField.current = isTextField(event.target) ? event.target : null;
        burstFieldValue.current = burstField.current?.value ?? "";
      }

      if (event.key === "Enter") {
        const code = buffer.current;
        buffer.current = "";

        // Enter escrito por una persona: no es asunto nuestro, que lo maneje
        // el formulario.
        if (code.length < MIN_SCAN_LENGTH) return;
        if (now - lastEmitAt.current < MIN_INTERVAL_MS) return;

        // Si el lector «escribió» dentro de un campo de texto, se deshace:
        // el código pertenece al escáner, no al nombre del niño.
        const field = burstField.current;
        if (field && field.value !== burstFieldValue.current) {
          const previo = burstFieldValue.current;
          // Se usa EXCLUSIVAMENTE el setter nativo del prototipo.
          //
          // React parchea la propiedad `value` del nodo para llevar la cuenta
          // del último valor que él escribió. Asignar `field.value = previo`
          // pasa por ese parche y actualiza su rastreador; cuando después se
          // emite el evento, React compara, no ve cambio y lo descarta — el
          // campo se queda con el código pegado al nombre. Saltarse el parche
          // con el setter del prototipo es lo que hace que React sí se entere.
          const proto =
            field instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) {
            setter.call(field, previo);
            field.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            field.value = previo;
          }
        }

        event.preventDefault();

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

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onScan, validate]);

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(id);
  }, [feedback]);

  const tone =
    feedback?.kind === "error" ? "crit" : feedback?.kind === "ok" ? "ok" : "idle";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] border px-4 py-2.5",
        tone === "crit"
          ? "border-state-crit/50 bg-state-crit-bg"
          : tone === "ok"
            ? "border-state-ok/50 bg-state-ok-bg"
            : "border-line bg-surface",
        className,
      )}
    >
      <ScanLine
        size={18}
        aria-hidden="true"
        className={
          tone === "crit" ? "text-state-crit" : tone === "ok" ? "text-state-ok" : "text-brand"
        }
      />
      <span
        role="status"
        className={cn(
          "text-sm",
          tone === "crit"
            ? "text-state-crit"
            : tone === "ok"
              ? "text-state-ok"
              : "text-ink-2",
        )}
      >
        {feedback?.text ?? placeholder}
      </span>
      {!feedback && (
        <span className="ml-auto hidden text-[11px] text-ink-3 sm:block">
          No hace falta hacer clic en ningún campo
        </span>
      )}
    </div>
  );
}
