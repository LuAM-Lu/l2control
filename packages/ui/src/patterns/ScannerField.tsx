"use client";

import { useEffect, useRef, useState } from "react";
import { Keyboard, ScanLine, X } from "lucide-react";
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
/** Cuánto espera una lectura terminada a que se monte la pantalla que la recibe. */
const ESPERA_PENDIENTE_MS = 1500;

/* ─────────────────────────────────────────── un solo oyente ──
 *
 * POR QUÉ A NIVEL DE MÓDULO Y NO POR COMPONENTE
 *
 * Antes cada lector montado instalaba su propio oyente al montarse. Al navegar
 * —volver de caja a entrada— quedaba una ventana entre que la pantalla aparecía
 * y el oyente se instalaba. Si el operador ya estaba escaneando, el primer
 * carácter se perdía: «AK-0911» llegaba como «K-0911», que TAMBIÉN es un código
 * válido, así que nada avisaba. Una pulsera mal leída es un niño cargado en la
 * estancia de otro. Comprobado en navegador: sin pausa tras navegar se perdía
 * el primer carácter; con 300 ms, no.
 *
 * Ahora el oyente se instala UNA vez, al cargar este código en el navegador, y
 * no se quita nunca: el búfer sobrevive a la navegación. Si una lectura termina
 * mientras no hay ninguna pantalla escuchando, espera hasta 1,5 s a la
 * siguiente que se monte.
 */
type Receptor = (code: string) => void;

const bus = {
  buffer: "",
  lastKeyAt: 0,
  lastEmitAt: 0,
  /** Campo enfocado al empezar la ráfaga, y su valor previo. */
  campo: null as HTMLInputElement | HTMLTextAreaElement | null,
  valorCampo: "",
  /**
   * Quién recibe: el último que se montó. Una pila y no un solo receptor: una hoja que escucha encima
   * de una pantalla que también escucha (la ficha de un producto sobre la lista) recibe mientras está
   * abierta y, al cerrarse, devuelve el turno a la pantalla en vez de dejar el lector sin nadie.
   */
  pila: [] as Receptor[],
  pendiente: null as { code: string; at: number } | null,
  instalado: false,
};

function esCampo(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  const node = el as HTMLElement | null;
  return Boolean(node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA"));
}

function alTeclear(event: KeyboardEvent) {
  // Al rellenar un campo solo (el gestor de contraseñas, el autocompletado), el navegador lanza un
  // `keydown` que no es de ninguna tecla: llega sin `key`. No lo tecleó nadie ni lo leyó un lector.
  if (typeof event.key !== "string") return;
  const now = Date.now();
  const gap = now - bus.lastKeyAt;
  bus.lastKeyAt = now;

  // CUALQUIER pausa a velocidad humana reinicia el buffer. Así el contenido
  // siempre es «la última secuencia contigua tecleada a velocidad de máquina»,
  // y el operador puede escribir un nombre y escanear la siguiente pulsera
  // acto seguido sin que se mezclen.
  if (gap > SCAN_MAX_GAP_MS) {
    bus.buffer = "";
    bus.campo = esCampo(event.target) ? event.target : null;
    bus.valorCampo = bus.campo?.value ?? "";
  }

  if (event.key === "Enter") {
    const code = bus.buffer;
    bus.buffer = "";

    // Enter escrito por una persona: no es asunto nuestro, que lo maneje el
    // formulario.
    if (code.length < MIN_SCAN_LENGTH) return;
    if (now - bus.lastEmitAt < MIN_INTERVAL_MS) return;

    // Si el lector «escribió» dentro de un campo de texto, se deshace: el
    // código pertenece al escáner, no al nombre del niño.
    const field = bus.campo;
    if (field && field.value !== bus.valorCampo) {
      const previo = bus.valorCampo;
      // Se usa EXCLUSIVAMENTE el setter nativo del prototipo.
      //
      // React parchea la propiedad `value` del nodo para llevar la cuenta del
      // último valor que él escribió. Asignar `field.value = previo` pasa por
      // ese parche y actualiza su rastreador; cuando después se emite el
      // evento, React compara, no ve cambio y lo descarta — el campo se queda
      // con el código pegado al nombre. Saltarse el parche con el setter del
      // prototipo es lo que hace que React sí se entere.
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
    bus.lastEmitAt = now;
    entregar(code, now);
    return;
  }

  if (event.key.length === 1 && bus.buffer.length < MAX_BUFFER) {
    bus.buffer += event.key;
  }
}

/** Da el código a quien escucha ahora, o lo deja esperando a la siguiente pantalla que se monte. */
function entregar(code: string, now: number) {
  const receptor = bus.pila.at(-1);
  if (receptor) receptor(code);
  else bus.pendiente = { code, at: now };
}

/** Pone a escuchar a `receptor` encima de los demás; devuelve cómo quitarlo. */
function escuchar(receptor: Receptor): () => void {
  instalarLector();
  bus.pila.push(receptor);
  // Una lectura que terminó durante el cambio de pantalla llega aquí.
  const p = bus.pendiente;
  bus.pendiente = null;
  if (p && Date.now() - p.at < ESPERA_PENDIENTE_MS) receptor(p.code);
  return () => {
    const i = bus.pila.lastIndexOf(receptor);
    if (i >= 0) bus.pila.splice(i, 1);
  };
}

function instalarLector() {
  if (bus.instalado || typeof window === "undefined") return;
  window.addEventListener("keydown", alTeclear, true);
  bus.instalado = true;
}

// Al evaluarse el módulo en el navegador: antes que cualquier efecto de React.
if (typeof window !== "undefined") instalarLector();

/**
 * Entrega un código leído por OTRO medio que el teclado (la cámara, B4-5) al mismo receptor que el
 * lector: pasa por la misma validación de la pantalla y el mismo límite de frecuencia (§7.7), y si
 * no hay pantalla escuchando espera a la siguiente. Devuelve si se entregó.
 */
export function leerCodigo(code: string): boolean {
  const limpio = code.trim();
  if (limpio.length < MIN_SCAN_LENGTH || limpio.length > MAX_BUFFER) return false;
  const now = Date.now();
  if (now - bus.lastEmitAt < MIN_INTERVAL_MS) return false;
  bus.lastEmitAt = now;
  entregar(limpio, now);
  return true;
}

/**
 * Escuchar al lector sin pintar el campo (B9-6): una hoja o una pantalla que ya enseña dónde leer
 * (la ficha de un producto, una entrada, un conteo). Mientras `activo`, recibe ella; al dejar de
 * estarlo, vuelve a recibir quien escuchaba antes. `onScan` recibe el código tal cual se leyó: la
 * validación es de quien lo usa, con el contrato de lo que espera.
 */
export function useLectorDeCodigos(onScan: (code: string) => void, activo = true): void {
  const alLeer = useRef(onScan);
  useEffect(() => {
    alLeer.current = onScan;
  });
  useEffect(() => {
    if (!activo) return;
    return escuchar((code) => alLeer.current(code));
  }, [activo]);
}

/* ─────────────────────────────────────────────────── componente ── */

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
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  /**
   * Escribir el código a mano (T-15, P-8): una pulsera que el lector no lee (doblada, mojada) o un equipo sin lector.
   * Pasa por el MISMO camino que una lectura: se valida igual y llega igual a la pantalla. Se escribe a velocidad de
   * persona, así que el lector global no lo toma por una lectura.
   */
  const [escribiendo, setEscribiendo] = useState(false);
  const [escrito, setEscrito] = useState("");

  // Las funciones más recientes, sin reinstalar el receptor en cada render.
  const alLeer = useRef(onScan);
  const validar = useRef(validate);
  useEffect(() => {
    alLeer.current = onScan;
    validar.current = validate;
  });

  /** Una lectura, del lector o escrita: se valida y se entrega. Devuelve si valió. */
  const leer = useRef((code: string) => {
    if (!validar.current(code)) {
      setFeedback({ kind: "error", text: `Código no reconocido: ${code.slice(0, 16)}` });
      return false;
    }
    setFeedback({ kind: "ok", text: `Leído ${code}` });
    alLeer.current(code);
    return true;
  });

  useEffect(() => escuchar((code) => void leer.current(code)), []);

  const usarEscrito = () => {
    const code = escrito.trim().toUpperCase();
    if (code === "") return;
    if (leer.current(code)) {
      setEscrito("");
      setEscribiendo(false);
    }
  };

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), 2600);
    return () => clearTimeout(id);
  }, [feedback]);

  const tone =
    feedback?.kind === "error" ? "crit" : feedback?.kind === "ok" ? "ok" : "idle";

  if (escribiendo) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          usarEscrito();
        }}
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-control)] border py-1.5 pr-1.5 pl-3",
          tone === "crit" ? "border-state-crit/50 bg-state-crit-bg" : "border-brand bg-surface",
          className,
        )}
      >
        <Keyboard size={18} aria-hidden="true" className={tone === "crit" ? "shrink-0 text-state-crit" : "shrink-0 text-brand"} />
        <input
          // Abrir «Escribir» es pedir el teclado: el foco va al campo.
          autoFocus
          value={escrito}
          onChange={(e) => setEscrito(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEscribiendo(false);
              setEscrito("");
            }
          }}
          aria-label="Código de la pulsera"
          aria-invalid={tone === "crit" || undefined}
          placeholder="Escribe el código de la pulsera"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={MAX_BUFFER}
          className="min-h-12 min-w-0 flex-1 bg-transparent font-mono text-[15px] text-ink uppercase outline-none placeholder:font-sans placeholder:text-[13px] placeholder:normal-case placeholder:text-ink-3"
        />
        <button
          type="submit"
          disabled={escrito.trim() === ""}
          className="min-h-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] bg-brand px-3 text-[13px] font-semibold text-on-brand disabled:cursor-not-allowed disabled:opacity-40"
        >
          Usar
        </button>
        <button
          type="button"
          onClick={() => {
            setEscribiendo(false);
            setEscrito("");
          }}
          aria-label="Volver al lector"
          className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <X size={16} aria-hidden="true" />
        </button>
        {feedback?.kind === "error" && (
          <span role="status" className="sr-only">
            {feedback.text}
          </span>
        )}
      </form>
    );
  }

  return (
    <div
      className={cn(
        // Contenedor: en una columna estrecha (la cola de la caja) «Escribir» se queda en su icono.
        "@container/lector flex items-center gap-3 rounded-[var(--radius-control)] border px-4 py-2.5",
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
      {/* La pista y «Escribir» (T-15), juntas a la derecha. */}
      <span className="ml-auto flex shrink-0 items-center gap-3">
        {!feedback && (
          <span data-pista className="hidden text-[11px] text-ink-3 lg:block">
            No hace falta hacer clic en ningún campo
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setFeedback(null);
            setEscribiendo(true);
          }}
          title="Escribir el código a mano"
          aria-label="Escribir el código a mano"
          className={cn(
            "-my-1 flex min-h-12 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-[13px] font-semibold text-ink-2",
            "transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
          )}
        >
          <Keyboard size={16} aria-hidden="true" />
          <span className="hidden @[16rem]/lector:inline">Escribir</span>
        </button>
      </span>
    </div>
  );
}
