"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  CortesiaSchema,
  type AccountLineDto,
  type CortesiaDto,
  type UserSummaryDto,
} from "@l2/contracts";
import {
  DEFAULT_LOCKOUT_POLICY,
  can,
  canAuthorize,
  computeLockout,
  describeLockout,
  type Actor,
} from "@l2/domain-identity";
import { Button, Dialog, Input, MoneyDisplay, cn } from "@l2/ui";
import { money, toMajor } from "@l2/domain-money";
import type { OperadorEnSesion } from "../identity/operador.ts";
import { toActor } from "../identity/permisos.ts";
import { useActorEnSesion } from "../identity/sesion.ts";

const PIN_LONGITUD = 4;

/**
 * El motivo en palabras. Vive aquí y se exporta porque lo usan tres sitios —el
 * diálogo, el ticket y el recibo— y en ninguno se puede enseñar
 * `ERROR_DE_COCINA` tal cual a una persona.
 */
export const TEXTO_MOTIVO: Readonly<Record<CortesiaDto["motivo"], string>> = {
  INVITACION: "invitación de la casa",
  ERROR_DE_COCINA: "error de cocina",
  CONSUMO_DE_PERSONAL: "consumo de personal",
  OTRO: "otro",
};

const MOTIVOS: { id: CortesiaDto["motivo"]; texto: string }[] = [
  { id: "INVITACION", texto: "Invitación de la casa" },
  { id: "ERROR_DE_COCINA", texto: "Error de cocina o merma" },
  { id: "CONSUMO_DE_PERSONAL", texto: "Consumo de personal" },
  { id: "OTRO", texto: "Otro (explicar)" },
];

export function CortesiaDialog({
  linea,
  usuarios,
  operador,
  quitar,
  onCortesia,
  onCerrar,
}: {
  linea: AccountLineDto | null;
  /** El directorio de personas de la sucursal: de ahí salen los autorizadores. */
  usuarios: readonly UserSummaryDto[];
  operador: OperadorEnSesion | null;
  quitar?: boolean;
  /** Aplica la cortesía o la quita. Lanza si no se puede: el diálogo lo muestra. */
  onCortesia: (linea: AccountLineDto, cortesia?: CortesiaDto) => void;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<CortesiaDto["motivo"] | null>(null);
  const [nota, setNota] = useState("");
  const [autorizadorId, setAutorizadorId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [fallos, setFallos] = useState(0);
  const [ultimoFallo, setUltimoFallo] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [para, setPara] = useState<string | null>(null);

  // Cada línea abre el formulario limpio. Derivado en el render, sin efecto.
  if ((linea?.id ?? null) !== para) {
    setPara(linea?.id ?? null);
    setMotivo(null);
    setNota("");
    setAutorizadorId(null);
    setPin("");
    setErrores({});
  }

  const solicitante: Actor | null = useActorEnSesion();
  const permiso = solicitante
    ? can(solicitante, "cuenta.cortesia")
    : "DENEGADO";

  /** Quién puede dar la autorización: el propio administrador, o supervisores y administradores activos. */
  const autorizadores = useMemo(() => {
    if (!solicitante || !operador) return [];
    if (permiso === "PERMITIDO")
      return [
        { id: operador.id, nombre: operador.nombre, role: operador.role },
      ];
    return usuarios
      .filter(
        (u) =>
          u.active && canAuthorize(toActor(u), solicitante, "cuenta.cortesia"),
      )
      .map((u) => ({
        id: u.id,
        nombre: u.fullName,
        role: u.role,
      }));
  }, [solicitante, operador, permiso, usuarios]);
  const autorizador =
    autorizadores.find((a) => a.id === autorizadorId) ??
    (autorizadores.length === 1 ? autorizadores[0]! : null);

  const bloqueo = computeLockout(
    fallos,
    ultimoFallo,
    ahora,
    DEFAULT_LOCKOUT_POLICY,
  );
  useEffect(() => {
    if (!bloqueo.locked) return;
    const id = window.setInterval(() => setAhora(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [bloqueo.locked]);

  if (!linea) return null;

  function confirmar() {
    if (!linea || !operador) return;
    const nuevos: Record<string, string> = {};
    if (!quitar && !motivo) nuevos.motivo = "Elige el motivo";
    if (!autorizador) nuevos.autorizador = "Elige quién autoriza";
    if (bloqueo.locked)
      nuevos.pin = describeLockout(bloqueo) ?? "PIN bloqueado";
    else if (pin.length !== PIN_LONGITUD)
      nuevos.pin = "Escribe el PIN de 4 dígitos";

    let formaData: CortesiaDto | undefined;

    // El mando solo se construye si hay motivo y hay quien autorice: un actor
    // de relleno «que Zod ya atrapará» es la clase de atajo que acaba colándose.
    if (!quitar && motivo && autorizador) {
      const cortesia = {
        motivo,
        ...(nota.trim() ? { detalle: nota.trim() } : {}),
        autorizadaPor: {
          id: autorizador.id,
          name: autorizador.nombre,
          role: autorizador.role,
        },
        en: new Date().toISOString(),
      };

      // Todo lo que falta, de una vez, junto a su campo.
      const forma = CortesiaSchema.safeParse(cortesia);
      for (const issue of forma.success ? [] : forma.error.issues) {
        const [raiz] = issue.path;
        if (raiz === "detalle") nuevos.nota ??= issue.message;
        else if (raiz === "motivo" || raiz === "autorizadaPor")
          continue; // ya dichos arriba
        else nuevos.general ??= issue.message;
      }
      if (forma.success) formaData = forma.data;
    }

    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }

    // TODO(F2-03/backend): verificación real del PIN del autorizador.
    if (pin !== "1970") {
      setFallos((f) => f + 1);
      setUltimoFallo(Date.now());
      setAhora(Date.now());
      setPin("");
      setErrores({ pin: "PIN incorrecto" });
      return;
    }

    try {
      onCortesia(linea, formaData);
    } catch (e) {
      setErrores({
        general:
          e instanceof Error ? e.message : "No se pudo aplicar la cortesía",
      });
    }
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={quitar ? "Quitar cortesía" : "Dar como cortesía"}
      descripcion={
        quitar
          ? "La línea volverá a cobrarse en la cuenta."
          : "El importe de la línea se mantiene, pero no se cobrará."
      }
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            surface="pos"
            variant={quitar ? "danger" : "primary"}
            onClick={confirmar}
            disabled={permiso === "DENEGADO"}
          >
            {quitar ? "Quitar cortesía" : "Regalar"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-[var(--radius-control)] border border-line p-3">
          <p className="font-semibold text-ink">{linea.concept}</p>
          <p className="text-ink-2">
            <MoneyDisplay
              value={toMajor(
                money(BigInt(linea.amount.minor), linea.amount.currency),
              )}
              currency={linea.amount.currency}
            />
          </p>
        </div>
        {/* ── 1. por qué ── */}
        {!quitar && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              1 · Motivo
            </legend>
            <div
              role="radiogroup"
              aria-label="Motivo de la cortesía"
              className="grid grid-cols-2 gap-1.5"
            >
              {MOTIVOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={motivo === m.id}
                  onClick={() => {
                    setMotivo(m.id);
                    setErrores((e) => ({ ...e, motivo: "" }));
                  }}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-left text-[13px] leading-tight transition-colors",
                    motivo === m.id
                      ? "border-brand bg-brand/12 font-semibold text-ink"
                      : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  {m.texto}
                </button>
              ))}
            </div>
            {errores.motivo && (
              <p className="text-[12px] text-state-crit">{errores.motivo}</p>
            )}
            {motivo === "OTRO" && (
              <Input
                label="Explicación (obligatoria)"
                surface="tablet"
                value={nota}
                maxLength={120}
                onChange={(e) => setNota(e.target.value)}
                error={errores.nota || undefined}
              />
            )}
          </fieldset>
        )}

        {/* ── 2. quién autoriza ── */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <ShieldCheck size={13} aria-hidden="true" /> {quitar ? "1" : "2"} ·
            Autorización
          </legend>
          {permiso === "DENEGADO" ? (
            <p className="text-[12.5px] text-state-crit">
              Tu puesto no puede conceder ni quitar cortesías.
            </p>
          ) : autorizadores.length === 0 ? (
            <p className="text-[12.5px] text-state-crit">
              No hay un supervisor ni un administrador activo que pueda
              autorizarlo.
            </p>
          ) : (
            <>
              {permiso === "PERMITIDO" ? (
                <p className="text-[12.5px] text-ink-2">
                  Autorizas tú, como administración. Confirma con tu PIN.
                </p>
              ) : (
                <div
                  role="radiogroup"
                  aria-label="Quién autoriza"
                  className="flex flex-wrap gap-1.5"
                >
                  {autorizadores.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={autorizador?.id === a.id}
                      onClick={() => {
                        setAutorizadorId(a.id);
                        setPin("");
                      }}
                      className={cn(
                        "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                        autorizador?.id === a.id
                          ? "border-brand bg-brand/12 text-ink"
                          : "border-line text-ink-2 hover:text-ink",
                      )}
                    >
                      <span className="text-[13px] font-semibold">
                        {a.nombre}
                      </span>
                      <span className="text-[11px] text-ink-3">
                        {a.role === "ADMIN" ? "Administración" : "Supervisión"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {errores.autorizador && (
                <p className="text-[12px] text-state-crit">
                  {errores.autorizador}
                </p>
              )}
              <Input
                label={
                  autorizador
                    ? `PIN de ${autorizador.nombre}`
                    : "PIN de quien autoriza"
                }
                surface="tablet"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={PIN_LONGITUD}
                value={pin}
                disabled={!autorizador || bloqueo.locked}
                onChange={(e) =>
                  setPin(
                    e.target.value.replace(/\D/g, "").slice(0, PIN_LONGITUD),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmar();
                  }
                }}
                error={
                  bloqueo.locked
                    ? (describeLockout(bloqueo) ?? "Bloqueado")
                    : errores.pin
                      ? errores.pin +
                        (fallos > 0
                          ? ` · quedan ${bloqueo.attemptsRemaining} intentos`
                          : "")
                      : undefined
                }
                hint="Prototipo: el PIN de prueba es 1970."
              />
            </>
          )}
        </fieldset>

        {errores.general && (
          <p
            role="alert"
            className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit"
          >
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
