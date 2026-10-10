"use client";

import { useEffect, useRef, useState } from "react";
import { UserRoundCheck } from "lucide-react";
import type { FirmaDeLaPersonaDto, PersonaDelLocalDto } from "@l2/contracts";
import type { Role } from "@l2/domain-identity";
import { toMajor, type Money } from "@l2/domain-money";
import { Button, Dialog, Input, MoneyDisplay, cn } from "@l2/ui";
import { NOMBRE_ROL } from "../identity/permisos.ts";
import { personasQueConsumen } from "./personal.acciones";

/**
 * El consumo del personal — B3-17 (M-37).
 *
 * Quien consumió firma con su PIN: se elige a la persona (las del local, no la cuenta de soporte) y ella lo escribe. La
 * lista y el PIN son del servidor; el PIN no se guarda en ninguna parte de la pantalla después de enviarlo.
 */

const PIN_LONGITUD = 4;

/** La lista de las personas del local, leída del servidor cada vez que se abre. `null` mientras llega. */
export function usePersonasDelLocal(abierto: boolean) {
  const [personas, setPersonas] = useState<PersonaDelLocalDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setPersonas(null);
    setError(null);
    personasQueConsumen()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setPersonas(r.valor);
        else {
          setPersonas([]);
          setError(r.mensaje);
        }
      })
      .catch(() => {
        if (!vivo) return;
        setPersonas([]);
        setError("Sin conexión con el servidor: no se pudo leer quién es del equipo.");
      });
    return () => {
      vivo = false;
    };
  }, [abierto]);
  return { personas, error };
}

/** Elegir a la persona y su PIN: lo usan el cobro y «Ver mis vales». */
export function PersonaYPin({
  personas,
  elegida,
  onElegir,
  pin,
  onPin,
  error,
  deshabilitado,
  onConfirmar,
  pregunta = "¿Quién consumió?",
}: {
  personas: readonly PersonaDelLocalDto[] | null;
  elegida: string | null;
  onElegir: (id: string) => void;
  pin: string;
  onPin: (pin: string) => void;
  error?: string | null;
  deshabilitado?: boolean;
  onConfirmar: () => void;
  pregunta?: string;
}) {
  const persona = personas?.find((p) => p.id === elegida) ?? null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1.5 text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">
        <UserRoundCheck className="size-(--icono-etiqueta)" aria-hidden="true" /> {pregunta}
      </legend>
      {personas === null ? (
        <p role="status" className="text-detalle text-ink-3">
          Leyendo quién es del equipo…
        </p>
      ) : personas.length === 0 ? (
        <p className="text-detalle text-state-crit">No hay personas del equipo con PIN en este local.</p>
      ) : (
        <div role="radiogroup" aria-label={pregunta} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={elegida === p.id}
              onClick={() => onElegir(p.id)}
              disabled={deshabilitado}
              className={cn(
                "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 py-1.5 text-left transition-colors",
                elegida === p.id ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <span className="text-cuerpo font-semibold">{p.nombre}</span>
              <span className="text-nota text-ink-3">{NOMBRE_ROL[p.rol as Role] ?? p.rol}</span>
            </button>
          ))}
        </div>
      )}
      <Input
        label={persona ? `PIN de ${persona.nombre}` : "Su PIN"}
        surface="tablet"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LONGITUD}
        value={pin}
        disabled={!persona || deshabilitado}
        onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LONGITUD))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirmar();
          }
        }}
        error={error || undefined}
      />
    </fieldset>
  );
}

/**
 * Cobrar la cuenta como consumo del personal: a precio normal, en dólares, sin dinero. `onFirmar` lo cobra en el
 * servidor y devuelve el error, o `null` si quedó cobrado.
 */
export function ConsumoDelPersonalDialog({
  abierto,
  total,
  onCerrar,
  onFirmar,
}: {
  abierto: boolean;
  total: Money;
  onCerrar: () => void;
  onFirmar: (firma: FirmaDeLaPersonaDto) => Promise<string | null>;
}) {
  const { personas, error: errorDeLista } = usePersonasDelLocal(abierto);
  const [elegida, setElegida] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abiertoAntes = useRef(false);

  // Cada vez que se abre, desde cero: nadie elegido y sin PIN.
  if (abierto !== abiertoAntes.current) {
    abiertoAntes.current = abierto;
    if (abierto) {
      setElegida(null);
      setPin("");
      setError(null);
    }
  }

  const listo = elegida !== null && pin.length === PIN_LONGITUD && !enviando;

  async function firmar() {
    if (!listo || !elegida) return;
    setEnviando(true);
    setError(null);
    const e = await onFirmar({ staffUserId: elegida, pin });
    setEnviando(false);
    setPin("");
    if (e) setError(e);
  }

  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Consumo del personal"
      descripcion="Sale del inventario a precio normal y no entra dinero: no cuenta en la gaveta. Quien consumió firma con su PIN y se imprime su vale, que se queda en la caja."
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void firmar()} disabled={!listo}>
            <UserRoundCheck className="size-(--icono-pos)" aria-hidden="true" />
            {enviando ? "Cobrando…" : "Firmar y cobrar"}
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex items-baseline justify-between rounded-[var(--radius-control)] border border-line bg-base/40 px-3 py-2.5">
        <span className="text-detalle font-semibold text-ink-2">Total, en dólares</span>
        <MoneyDisplay value={toMajor(total)} currency="USD" size="lg" />
      </div>
      <PersonaYPin
        personas={personas}
        elegida={elegida}
        onElegir={(id) => {
          setElegida(id);
          setPin("");
          setError(null);
        }}
        pin={pin}
        onPin={setPin}
        error={error}
        deshabilitado={enviando}
        onConfirmar={() => void firmar()}
      />
      {errorDeLista && (
        <p role="alert" className="mt-3 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2.5 text-detalle text-state-crit">
          {errorDeLista}
        </p>
      )}
    </Dialog>
  );
}
