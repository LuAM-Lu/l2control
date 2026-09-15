"use client";

import { useEffect, useState } from "react";
import { KeyRound, TriangleAlert, UserMinus, UserPlus, UserRoundCog } from "lucide-react";
import type { UserCommand, UserSummaryDto } from "@l2/contracts";
import type { Role } from "@l2/domain-identity";
import { Button, Dialog, Input, cn } from "@l2/ui";
import { NOMBRE_ROL } from "./permisos.ts";

/**
 * Pedir un cambio sobre una persona — F2-11.
 *
 * Los cinco cambios en una sola capa, porque los cinco piden lo mismo: qué se
 * va a hacer, sobre quién, y **por qué**. El motivo no es un campo de adorno:
 * es lo que responde «¿por qué se le repuso el PIN a la cajera el día del
 * descuadre?», y por eso el contrato lo exige con diez caracteres de contenido
 * en los cinco casos (§7.4).
 *
 * Cada uno dice además **qué va a pasar de verdad** antes de confirmar: dar de
 * baja no borra a nadie, reponer el PIN no enseña ninguno. Un botón que no
 * explica su consecuencia se pulsa una vez y se teme el resto del año.
 */

export type Cambio =
  | Readonly<{ kind: "ALTA" }>
  | Readonly<{ kind: "BAJA"; usuario: UserSummaryDto }>
  | Readonly<{ kind: "REINGRESO"; usuario: UserSummaryDto }>
  | Readonly<{ kind: "ROL"; usuario: UserSummaryDto }>
  | Readonly<{ kind: "PIN"; usuario: UserSummaryDto }>;

const ROLES: readonly Role[] = [
  "ADMIN",
  "SUPERVISOR",
  "CAJERO",
  "MESERO",
  "MONITOR_PARQUE",
  "COCINA",
];

const TEXTO = {
  ALTA: {
    titulo: "Añadir una persona al equipo",
    descripcion: "Entra con un rol y con el PIN que elegirá en su primer acceso.",
    confirmar: "Añadir al equipo",
    Icono: UserPlus,
  },
  BAJA: {
    titulo: "Dar de baja",
    descripcion: "Deja de poder entrar. No se borra: su historia y sus cobros se conservan.",
    confirmar: "Dar de baja",
    Icono: UserMinus,
  },
  REINGRESO: {
    titulo: "Devolver al equipo",
    descripcion: "Vuelve a poder entrar, con el rol que tenía.",
    confirmar: "Devolver al equipo",
    Icono: UserPlus,
  },
  ROL: {
    titulo: "Cambiar el rol",
    descripcion: "El rol decide qué ve y qué puede hacer. Sus excepciones se mantienen.",
    confirmar: "Cambiar el rol",
    Icono: UserRoundCog,
  },
  PIN: {
    titulo: "Reponer el PIN",
    descripcion: "El PIN actual deja de servir y la persona elige otro en su siguiente acceso.",
    confirmar: "Reponer el PIN",
    Icono: KeyRound,
  },
} as const;

export function DialogoCambio({
  cambio,
  usuarios,
  onCerrar,
  onConfirmar,
}: {
  cambio: Cambio | null;
  usuarios: readonly UserSummaryDto[];
  onCerrar: () => void;
  onConfirmar: (comando: UserCommand) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Role>("CAJERO");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Cada apertura empieza limpia: un motivo heredado del cambio anterior se
  // firmaría sin querer.
  useEffect(() => {
    if (!cambio) return;
    setNombre("");
    setMotivo("");
    setError(null);
    setRol(cambio.kind === "ROL" ? cambio.usuario.role : "CAJERO");
  }, [cambio]);

  if (!cambio) return null;

  const t = TEXTO[cambio.kind];
  const persona = cambio.kind === "ALTA" ? null : cambio.usuario;

  function confirmar() {
    if (!cambio) return;
    const reason = motivo.trim();
    if (reason.length < 10) {
      setError("Explica el motivo en al menos 10 caracteres: queda en la auditoría.");
      return;
    }

    if (cambio.kind === "ALTA") {
      const limpio = nombre.trim();
      if (limpio.length < 2) {
        setError("Escribe el nombre completo de la persona.");
        return;
      }
      if (usuarios.some((u) => u.fullName.toLowerCase() === limpio.toLowerCase())) {
        setError("Ya hay alguien con ese nombre en el equipo.");
        return;
      }
      // TODO(F2-11/backend): la sucursal saldrá de la sesión y del catálogo de
      // sedes; con una sola sucursal, elegirla sería un paso vacío.
      onConfirmar({ kind: "ALTA", fullName: limpio, role: rol, branchIds: ["b1"], reason });
      return;
    }

    if (cambio.kind === "ROL") {
      onConfirmar({ kind: "ROL", userId: cambio.usuario.id, role: rol, reason });
      return;
    }

    onConfirmar({ kind: cambio.kind, userId: cambio.usuario.id, reason });
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={t.titulo}
      descripcion={t.descripcion}
      pie={
        <div className="flex gap-2">
          <Button surface="tablet" variant="ghost" onClick={onCerrar} className="flex-1">
            Cancelar
          </Button>
          <Button
            surface="tablet"
            variant={cambio.kind === "BAJA" ? "danger" : "primary"}
            onClick={confirmar}
            className="flex-1"
          >
            {t.confirmar}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {persona && (
          <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3.5 py-2.5 text-[13.5px]">
            <span className="font-semibold text-ink">{persona.fullName}</span>
            <span className="text-ink-3"> · {NOMBRE_ROL[persona.role]}</span>
          </p>
        )}

        {cambio.kind === "ALTA" && (
          <Input
            surface="tablet"
            label="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            autoFocus
          />
        )}

        {(cambio.kind === "ALTA" || cambio.kind === "ROL") && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
              {cambio.kind === "ALTA" ? "Rol" : "Rol nuevo"}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={rol === r}
                  onClick={() => setRol(r)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border px-3 text-[13px]",
                    "transition-colors duration-[var(--dur-rapida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    rol === r
                      ? "border-brand bg-brand/12 font-semibold text-ink"
                      : "border-line bg-base text-ink-2 hover:text-ink",
                  )}
                >
                  {NOMBRE_ROL[r]}
                </button>
              ))}
            </div>
            {rol === "ADMIN" && (
              <p className="flex items-start gap-2 text-[12.5px] text-state-warn">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                La administración lo puede todo, incluido cambiar permisos y cerrar turnos.
              </p>
            )}
          </div>
        )}

        {cambio.kind === "PIN" && (
          <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3.5 py-2.5 text-[12.5px] text-ink-2">
            El sistema no enseña PINs: no los guarda en claro, ni siquiera para la administración.
            Se repone en blanco y la persona elige uno nuevo al entrar, desde un aparato autorizado.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="cambio-motivo"
            className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase"
          >
            Motivo
          </label>
          <textarea
            id="cambio-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            placeholder="Por qué se hace este cambio"
            className={cn(
              "w-full resize-none rounded-[var(--radius-control)] border bg-base px-3 py-2.5 text-sm text-ink outline-none",
              "placeholder:text-ink-3 focus:border-brand",
              error ? "border-state-crit" : "border-line",
            )}
          />
          {error ? (
            <p role="alert" className="text-[12.5px] text-state-crit">
              {error}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Queda en la auditoría con tu nombre y la hora.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
