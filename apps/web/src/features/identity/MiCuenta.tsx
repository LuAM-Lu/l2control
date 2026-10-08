"use client";

import { useState, type ReactNode } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { Button, Dialog, Input, avisar, cn } from "@l2/ui";
import { cambiarMiPin } from "./acceso.acciones";

/**
 * «Mi cuenta» (T-14, M-27, P-17): cada persona cambia su PIN desde su sesión, sin pedírselo a administración.
 *
 * Se abre tocando el propio nombre (en el pie del panel o en la barra de la estación). El PIN actual cuenta para el
 * mismo bloqueo que el acceso, y el nuevo pasa las mismas reglas; lo comprueba el servidor. Nada de lo tecleado se
 * guarda en el navegador ni viaja en la URL: va en el cuerpo de la acción y se olvida al cerrar.
 */
export function MiCuenta({ nombre, rol, className, children }: { nombre: string; rol: string; className?: string; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Mi cuenta: ${nombre}`}
        title="Mi cuenta: cambiar mi PIN"
        className={cn(
          "cursor-pointer rounded-[var(--radius-control)] text-left transition-colors hover:bg-surface-2",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          className,
        )}
      >
        {children}
      </button>
      {abierto && <MiCuentaDialog nombre={nombre} rol={rol} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

const PIN_LENGTH = 4;
const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, PIN_LENGTH);

function MiCuentaDialog({ nombre, rol, onCerrar }: { nombre: string; rol: string; onCerrar: () => void }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repetido, setRepetido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const completo = actual.length === PIN_LENGTH && nuevo.length === PIN_LENGTH && repetido.length === PIN_LENGTH;
  const noCoinciden = repetido.length === PIN_LENGTH && nuevo !== repetido;

  async function guardar() {
    if (!completo || enviando) return;
    if (noCoinciden) return setError("Los dos PIN nuevos no coinciden.");
    setEnviando(true);
    setError(null);
    const r = await cambiarMiPin(actual, nuevo).catch(() => null);
    setEnviando(false);
    if (r?.ok) {
      avisar.ok("Tu PIN cambió", { detalle: "La próxima vez entra con el nuevo." });
      return onCerrar();
    }
    // Errado o bloqueado: se vacía lo tecleado y se dice por qué.
    setActual("");
    setNuevo("");
    setRepetido("");
    setError(r ? r.mensaje : "El servidor no respondió: tu PIN no cambió. Inténtalo de nuevo.");
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Mi cuenta"
      descripcion={`${nombre} · ${rol}`}
      pie={
        <div className="flex gap-2">
          <Button surface="tablet" variant="ghost" className="flex-1" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" className="flex-1" onClick={() => void guardar()} disabled={!completo || noCoinciden || enviando}>
            <KeyRound size={16} aria-hidden="true" />
            {enviando ? "Guardando…" : "Cambiar mi PIN"}
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
        className="flex flex-col gap-3"
      >
        <h3 className="font-display text-[14px] font-bold text-ink">Cambiar mi PIN</h3>
        <p className="text-[12.5px] text-ink-3">
          Cuatro números que no sean fáciles de adivinar (ni 1234, ni 1111, ni tu PIN de ahora). Cada intento con el PIN
          actual errado cuenta como uno del acceso.
        </p>
        {(
          [
            ["PIN actual", actual, setActual, "current-password"],
            ["PIN nuevo", nuevo, setNuevo, "new-password"],
            ["Repite el PIN nuevo", repetido, setRepetido, "new-password"],
          ] as const
        ).map(([etiqueta, valor, poner, autocompletar]) => (
          <Input
            key={etiqueta}
            label={etiqueta}
            surface="tablet"
            type="password"
            inputMode="numeric"
            autoComplete={autocompletar}
            maxLength={PIN_LENGTH}
            className="tnum tracking-[0.4em]"
            value={valor}
            onChange={(e) => {
              poner(soloDigitos(e.target.value));
              setError(null);
            }}
            error={etiqueta === "Repite el PIN nuevo" && noCoinciden ? "No coincide con el PIN nuevo" : undefined}
          />
        ))}
        {error && (
          <p role="alert" className="flex items-start gap-2 text-[12.5px] font-medium text-state-crit">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
