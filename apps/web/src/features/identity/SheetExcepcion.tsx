"use client";

import { useMemo, useState } from "react";
import { ShieldMinus, ShieldPlus } from "lucide-react";
import {
  PermissionExceptionCommandSchema,
  type PermissionExceptionDto,
  type UserSummaryDto,
} from "@l2/contracts";
import { explainPermission, type Action, type Permission } from "@l2/domain-identity";
import { Button, Sheet, avisar, cn } from "@l2/ui";
import { ACCIONES, AREAS, ETIQUETAS, toActor } from "./permisos.ts";
import type { Autor } from "./equipo.ts";

/**
 * Conceder o revocar un permiso a una persona — F2-11, DEC-15.
 *
 * Vivía como formulario permanente dentro de la ficha y ocupaba media pantalla
 * aunque no se fuera a usar, empujando los permisos efectivos bajo el pliegue.
 * Ahora es una hoja: se abre cuando se va a usar, y la ficha respira.
 *
 * Tres negativas que evitan ensuciar la auditoría, y son las mismas de antes:
 * dos excepciones sobre la misma acción, una acción que no existe, y —la más
 * útil— una excepción que **no cambia nada** porque el rol ya daba eso.
 */

const NOMBRE_NIVEL: Record<Permission, string> = {
  PERMITIDO: "Permitido",
  REQUIERE_AUTORIZACION: "Con autorización",
  DENEGADO: "No",
};

const ETIQUETA_CAMPO = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";

export function SheetExcepcion({
  usuario,
  autor,
  onCerrar,
  onRegistrar,
}: {
  usuario: UserSummaryDto;
  autor: Autor;
  onCerrar: () => void;
  onRegistrar: (userId: string, excepcion: PermissionExceptionDto) => void;
}) {
  const actor = useMemo(() => toActor(usuario), [usuario]);
  const [accion, setAccion] = useState<Action | "">("");
  const [efecto, setEfecto] = useState<"GRANT" | "REVOKE">("GRANT");
  const [nivel, setNivel] = useState<"PERMITIDO" | "REQUIERE_AUTORIZACION">("PERMITIDO");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  function enviar() {
    // El mismo contrato que validará el servidor (ADR-017).
    const r = PermissionExceptionCommandSchema.safeParse(
      efecto === "GRANT"
        ? { effect: "GRANT", userId: usuario.id, action: accion, permission: nivel, reason: motivo }
        : { effect: "REVOKE", userId: usuario.id, action: accion, reason: motivo },
    );
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[String(i.path[0] ?? "form")] ??= i.message;
      setErrores(e);
      return;
    }

    const a = r.data.action;
    if (!(a in ETIQUETAS)) {
      setErrores({ action: "Esa acción no existe" });
      return;
    }
    const nombre = a as Action;

    if (usuario.exceptions.some((x) => x.action === nombre)) {
      setErrores({ action: "Ya tiene una excepción sobre esta acción." });
      return;
    }

    // Una excepción que no cambia nada solo ensucia la auditoría.
    const resultado: Permission = r.data.effect === "REVOKE" ? "DENEGADO" : r.data.permission;
    if (explainPermission(actor, nombre).effective === resultado) {
      setErrores({
        action: `No cambia nada: por su rol ya tiene «${NOMBRE_NIVEL[resultado]}» en esta acción.`,
      });
      return;
    }

    // TODO(F2-11/backend): el autor y la hora los pone el servidor al
    // registrarla; el comando no los lleva (ver el contrato).
    const auditoria = {
      action: nombre,
      grantedBy: autor.id,
      grantedByName: autor.nombre,
      reason: r.data.reason,
      at: new Date().toISOString(),
    };
    onRegistrar(
      usuario.id,
      r.data.effect === "GRANT"
        ? { effect: "GRANT", permission: r.data.permission, ...auditoria }
        : { effect: "REVOKE", ...auditoria },
    );

    avisar.ok(
      `${r.data.effect === "GRANT" ? "Concesión" : "Revocación"} registrada: «${ETIQUETAS[nombre].etiqueta}».`,
    );
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo="Añadir una excepción"
      descripcion={`Vale solo en las sucursales de ${usuario.fullName.split(" ")[0]}: una excepción nunca amplía la sede.`}
      pie={
        <div className="flex gap-2">
          <Button surface="tablet" variant="ghost" onClick={onCerrar} className="flex-1">
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" onClick={enviar} className="flex-1">
            Registrar excepción
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exc-accion" className={ETIQUETA_CAMPO}>
            Acción
          </label>
          <select
            id="exc-accion"
            value={accion}
            onChange={(e) => setAccion(e.target.value as Action | "")}
            aria-invalid={errores["action"] ? true : undefined}
            className={cn(
              "h-11 w-full cursor-pointer rounded-[var(--radius-control)] border bg-base px-3 text-sm text-ink outline-none",
              "focus:border-brand",
              errores["action"] ? "border-state-crit" : "border-line",
            )}
          >
            <option value="">Elige una acción…</option>
            {AREAS.map((area) => (
              <optgroup key={area} label={area}>
                {ACCIONES.filter((a) => ETIQUETAS[a].area === area).map((a) => (
                  <option key={a} value={a}>
                    {ETIQUETAS[a].etiqueta}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {errores["action"] && <p className="text-[12.5px] text-state-crit">{errores["action"]}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={ETIQUETA_CAMPO}>Qué hacer</span>
          <div className="grid grid-cols-2 gap-1.5">
            <Segmento activo={efecto === "GRANT"} onClick={() => setEfecto("GRANT")}>
              <ShieldPlus size={15} aria-hidden="true" />
              Conceder
            </Segmento>
            <Segmento activo={efecto === "REVOKE"} onClick={() => setEfecto("REVOKE")}>
              <ShieldMinus size={15} aria-hidden="true" />
              Revocar
            </Segmento>
          </div>
        </div>

        {efecto === "GRANT" && (
          <div className="flex flex-col gap-1.5">
            <span className={ETIQUETA_CAMPO}>Con qué nivel</span>
            <div className="grid grid-cols-2 gap-1.5">
              <Segmento activo={nivel === "PERMITIDO"} onClick={() => setNivel("PERMITIDO")}>
                Directamente
              </Segmento>
              <Segmento
                activo={nivel === "REQUIERE_AUTORIZACION"}
                onClick={() => setNivel("REQUIERE_AUTORIZACION")}
              >
                Con autorización
              </Segmento>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="exc-motivo" className={ETIQUETA_CAMPO}>
            Motivo
          </label>
          <textarea
            id="exc-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            aria-invalid={errores["reason"] ? true : undefined}
            placeholder="Por qué esta persona necesita algo distinto de su rol"
            className={cn(
              "w-full resize-none rounded-[var(--radius-control)] border bg-base px-3 py-2.5 text-sm text-ink outline-none",
              "placeholder:text-ink-3 focus:border-brand",
              errores["reason"] ? "border-state-crit" : "border-line",
            )}
          />
          {errores["reason"] ? (
            <p className="text-[12.5px] text-state-crit">{errores["reason"]}</p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Queda en la auditoría con tu nombre y la hora.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Segmento({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13px]",
        "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        activo
          ? "border-brand bg-brand/12 font-semibold text-ink"
          : "border-line bg-base text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
