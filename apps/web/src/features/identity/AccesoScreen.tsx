"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Lock, MonitorSmartphone, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  DEFAULT_LOCKOUT_POLICY,
  checkDevice,
  computeLockout,
  describeLockout,
  type Device,
} from "@l2/domain-identity";
import { Badge, Button, Initial, NumericKeypad, cn } from "@l2/ui";

/**
 * Acceso por PIN atado a dispositivo — F2-03, ADR-013.
 *
 * ⚠️ LO QUE ESTA PANTALLA **NO** ES
 * El límite de intentos que ves aquí es **experiencia de usuario, no
 * seguridad**. Quien controle el navegador puede saltárselo. El límite que
 * cuenta lo impone el servidor con Better Auth, y este componente solo lo
 * explica para que el operador entienda por qué está esperando.
 *
 * Está escrito así a propósito: hacer creer que un contador en React protege
 * algo es peor que no tenerlo.
 *
 * LO QUE SÍ IMPONE EL DISEÑO
 * El dispositivo es el PRIMER FACTOR. Se comprueba **antes** de mostrar
 * siquiera el teclado: desde un aparato desconocido no hay PIN que valga.
 */

export type Operador = Readonly<{
  id: string;
  nombre: string;
  rol: string;
}>;

const PIN_LENGTH = 4;

export function AccesoScreen({
  device,
  operadores,
}: {
  /** `null` simula un dispositivo no registrado. */
  device: Device | null;
  operadores: readonly Operador[];
}) {
  const [operador, setOperador] = useState<Operador | null>(null);
  const [pin, setPin] = useState("");
  const [fallos, setFallos] = useState(0);
  const [ultimoFallo, setUltimoFallo] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [entrado, setEntrado] = useState(false);

  const revision = useMemo(() => checkDevice(device), [device]);
  const bloqueo = computeLockout(fallos, ultimoFallo, ahora, DEFAULT_LOCKOUT_POLICY);

  // Late el reloj solo mientras hay un bloqueo que contar hacia atrás.
  useEffect(() => {
    if (!bloqueo.locked) return;
    const id = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(id);
  }, [bloqueo.locked]);

  function intentar() {
    if (bloqueo.locked || pin.length !== PIN_LENGTH) return;

    // TODO(F2-03/backend): aquí va la llamada a Better Auth. El PIN se envía
    // por POST sobre TLS y NUNCA aparece en la URL, en un log ni en el estado
    // que se persiste (§7.6).
    // Mientras tanto se simula: "1970" entra, cualquier otro falla.
    if (pin === "1970") {
      setEntrado(true);
      setPin("");
      return;
    }

    setFallos((n) => n + 1);
    setUltimoFallo(Date.now());
    setAhora(Date.now());
    setPin("");
  }

  /* ------------------------------------- dispositivo no autorizado */

  if (!revision.ok) {
    return (
      <div className="grid min-h-dvh place-content-center bg-base px-6">
        <div className="max-w-md rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-8 text-center">
          <ShieldAlert size={36} className="mx-auto text-state-crit" aria-hidden="true" />
          <h1 className="font-display mt-4 text-2xl font-bold text-ink">
            Este dispositivo no puede entrar
          </h1>
          <p className="mt-3 text-sm text-ink-2">{revision.message}</p>
          <p className="mt-5 border-t border-state-crit/25 pt-4 text-[12.5px] text-ink-3">
            El dispositivo es el primer factor de acceso. Sin él, un PIN correcto tampoco sirve —
            así, un PIN visto por encima del hombro no abre nada desde otro aparato.
          </p>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------- entrado */

  if (entrado && operador) {
    return (
      <div className="grid min-h-dvh place-content-center bg-base px-6">
        <div className="max-w-md rounded-[var(--radius-card)] border border-state-ok/40 bg-state-ok-bg p-8 text-center">
          <Initial name={operador.nombre} tone="ok" className="mx-auto size-14 text-2xl" />
          <h1 className="font-display mt-4 text-2xl font-bold text-ink">
            Hola, {operador.nombre.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-ink-2">{operador.rol}</p>
          <p className="mt-5 border-t border-state-ok/25 pt-4 text-[12.5px] text-ink-3">
            Prototipo: aquí empezaría el turno y se abriría la superficie que corresponde al rol.
          </p>
          <Button
            surface="tablet"
            variant="neutral"
            className="mt-4 w-full"
            onClick={() => {
              setEntrado(false);
              setOperador(null);
              setFallos(0);
              setUltimoFallo(null);
            }}
          >
            Salir
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------ elegir persona */

  if (!operador) {
    return (
      <div className="grid min-h-dvh place-content-center bg-base px-6 py-10">
        <div className="w-full max-w-lg">
          <div className="mb-6 text-center">
            <Badge tone="ok" icon={<MonitorSmartphone size={13} aria-hidden="true" />}>
              {device!.label}
            </Badge>
            <h1 className="font-display mt-4 text-3xl font-bold text-ink">¿Quién entra?</h1>
            <p className="mt-1.5 text-sm text-ink-2">Toca tu nombre para escribir el PIN</p>
          </div>

          <ul className="grid grid-cols-2 gap-3">
            {operadores.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setOperador(o)}
                  className={cn(
                    "flex min-h-20 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-card)]",
                    "border border-line bg-surface px-4 text-left transition-colors",
                    "hover:border-brand/50 hover:bg-surface-2",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  )}
                >
                  <Initial name={o.nombre} tone="brand" />
                  <span className="min-w-0">
                    <span className="font-display block truncate font-semibold text-ink">
                      {o.nombre}
                    </span>
                    <span className="block text-[12px] text-ink-3">{o.rol}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------- el PIN */

  return (
    <div className="grid min-h-dvh place-content-center bg-base px-6 py-10">
      <div className="w-full max-w-xs">
        <button
          type="button"
          onClick={() => {
            setOperador(null);
            setPin("");
          }}
          className="mb-5 flex cursor-pointer items-center gap-2 text-sm text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Cambiar de persona
        </button>

        <div className="mb-6 flex items-center gap-3">
          <Initial name={operador.nombre} tone="brand" />
          <div className="min-w-0">
            <p className="font-display truncate font-bold text-ink">{operador.nombre}</p>
            <p className="text-[12px] text-ink-3">{operador.rol}</p>
          </div>
        </div>

        {/* El PIN se muestra como puntos: se teclea de cara al público. */}
        <div className="mb-5 flex justify-center gap-3" aria-live="polite">
          <span className="sr-only">
            {pin.length} de {PIN_LENGTH} dígitos escritos
          </span>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "size-3.5 rounded-full transition-colors",
                i < pin.length ? "bg-brand" : "bg-line",
              )}
            />
          ))}
        </div>

        {bloqueo.locked ? (
          <div className="rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-5 text-center">
            <Lock size={24} className="mx-auto text-state-crit" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink">Demasiados intentos</p>
            <p className="tnum mt-1 text-sm text-state-crit">{describeLockout(bloqueo)}</p>
            <p className="mt-4 border-t border-state-crit/25 pt-3 text-[12px] text-ink-3">
              Cada intento fallido queda registrado en la auditoría, con la hora y el dispositivo.
            </p>
          </div>
        ) : (
          <>
            <NumericKeypad
              value={pin}
              onChange={setPin}
              maxLength={PIN_LENGTH}
              surface="pos"
              onSubmit={intentar}
              submitLabel="Entrar"
            />

            {fallos > 0 && (
              <p
                role="alert"
                className="mt-4 flex items-center justify-center gap-2 text-[12.5px] text-state-warn"
              >
                <TriangleAlert size={14} aria-hidden="true" />
                PIN incorrecto · quedan {bloqueo.attemptsRemaining}{" "}
                {bloqueo.attemptsRemaining === 1 ? "intento" : "intentos"}
              </p>
            )}
          </>
        )}

        <p className="mt-6 text-center text-[11.5px] text-ink-3">
          Prototipo: el PIN de prueba es 1970. En producción lo verifica el servidor con Argon2 y
          nunca viaja en la URL ni aparece en un log.
        </p>
      </div>
    </div>
  );
}
