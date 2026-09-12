"use client";

import { useMemo, useState } from "react";
import { Ban, CircleCheckBig, KeyRound, ShieldMinus, ShieldPlus } from "lucide-react";
import {
  PermissionExceptionCommandSchema,
  type PermissionExceptionDto,
  type UserSummaryDto,
} from "@l2/contracts";
import { explainPermission, type Action, type Actor, type Permission } from "@l2/domain-identity";
import { Badge, Button, Container, Initial, PageHeader, avisar, cn } from "@l2/ui";
import { ACCIONES, AREAS, ETIQUETAS, NOMBRE_ROL, etiquetaDe, toActor } from "./permisos.ts";

/**
 * Usuarios y permisos — F2-11, DEC-15, §9.10.6.
 *
 * LA REGLA QUE ORGANIZA LA PANTALLA
 * «La pantalla de usuarios muestra el rol y las excepciones por separado,
 * para que se vea de un vistazo quién tiene poderes que su puesto no da.»
 *
 * Por eso en la lista cada persona tiene su rol y, aparte, sus excepciones
 * como etiquetas: «Además: …» para lo que se le concedió, «Sin: …» para lo
 * que se le quitó. Y en el detalle, cada permiso efectivo que no viene del
 * rol va resaltado, con lo que daría el rol tachado al lado.
 *
 * Cada excepción enseña quién la concedió, cuándo y por qué. Sin esas tres
 * cosas una excepción es un agujero, no una decisión.
 */

const ESTADO: Record<Permission, { texto: string; clase: string; Icono: typeof Ban }> = {
  PERMITIDO: { texto: "Permitido", clase: "text-state-ok", Icono: CircleCheckBig },
  REQUIERE_AUTORIZACION: { texto: "Con autorización", clase: "text-state-warn", Icono: KeyRound },
  DENEGADO: { texto: "No", clase: "text-ink-3", Icono: Ban },
};

// La zona se fija: el servidor y el navegador deben escribir la misma hora,
// o la hidratación encuentra dos textos distintos.
const FECHA = new Intl.DateTimeFormat("es-VE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Caracas",
});

type Autor = Readonly<{ id: string; nombre: string }>;

export function UsuariosScreen({
  usuarios: iniciales,
  autor,
  puedeGestionar,
}: {
  usuarios: readonly UserSummaryDto[];
  autor: Autor;
  puedeGestionar: boolean;
}) {
  const [usuarios, setUsuarios] = useState<readonly UserSummaryDto[]>(iniciales);
  // Se abre en la primera persona con excepciones: es lo que esta pantalla
  // existe para enseñar.
  const [seleccion, setSeleccion] = useState<string | null>(
    iniciales.find((u) => u.exceptions.length > 0)?.id ?? iniciales[0]?.id ?? null,
  );

  const usuario = usuarios.find((u) => u.id === seleccion) ?? null;
  const conExcepciones = usuarios.filter((u) => u.exceptions.length > 0).length;

  function registrar(userId: string, nueva: PermissionExceptionDto) {
    setUsuarios((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, exceptions: [...u.exceptions, nueva] } : u)),
    );
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Personas", href: "/panel/personas" },
          { texto: "Usuarios y permisos" },
        ]}
        titulo="Usuarios y permisos"
        descripcion="Cada persona tiene un rol fijo. Lo que se sale de su rol se ve aparte: son las excepciones, con quién las concedió, cuándo y por qué."
        meta={
          <span className="tnum text-[12.5px] text-ink-3">
            {usuarios.length} personas · {conExcepciones} con excepciones
          </span>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ═════════════════════════ personas ═════════════════════════ */}
        <section aria-label="Personas" className="min-w-0">
          <ul className="flex flex-col gap-2">
            {usuarios.map((u) => {
              const activa = u.id === seleccion;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSeleccion(u.id)}
                    aria-pressed={activa}
                    className={cn(
                      "flex min-h-16 w-full cursor-pointer items-start gap-3 rounded-[var(--radius-card)]",
                      "border bg-surface px-4 py-3 text-left",
                      "transition-[border-color,box-shadow] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      activa
                        ? "border-brand/60 shadow-card ring-1 ring-brand/30"
                        : "border-line hover:border-line-strong",
                      !u.active && "opacity-60",
                    )}
                  >
                    <Initial name={u.fullName} tone={u.active ? "brand" : "idle"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-display truncate font-bold text-ink">
                          {u.fullName}
                        </span>
                        <span className="text-[12.5px] text-ink-3">{NOMBRE_ROL[u.role]}</span>
                        {!u.active && (
                          <span className="text-[10.5px] tracking-wide text-ink-3 uppercase">
                            de baja
                          </span>
                        )}
                      </span>

                      {/* Las excepciones, APARTE del rol (§9.10.6, regla 3). */}
                      {u.exceptions.length > 0 ? (
                        <span className="mt-1.5 flex flex-wrap gap-1.5">
                          {u.exceptions.map((e) => (
                            <Badge
                              key={`${e.effect}|${e.action}`}
                              tone={e.effect === "GRANT" ? "warn" : "idle"}
                              // El Badge no parte su texto: está pensado para
                              // estados cortos. Estas etiquetas nombran una
                              // acción entera y a 320 px tienen que poder partirse.
                              className="text-left whitespace-normal [&>svg]:shrink-0"
                              icon={
                                e.effect === "GRANT" ? (
                                  <ShieldPlus size={12} aria-hidden="true" />
                                ) : (
                                  <ShieldMinus size={12} aria-hidden="true" />
                                )
                              }
                            >
                              {e.effect === "GRANT" ? "Además: " : "Sin: "}
                              {etiquetaDe(e.action)}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="mt-1 block text-[12px] text-ink-3">
                          Solo lo que da su rol
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ═════════════════════════ detalle ══════════════════════════ */}
        {usuario ? (
          <Detalle
            key={usuario.id}
            usuario={usuario}
            autor={autor}
            puedeGestionar={puedeGestionar}
            onRegistrar={(e) => registrar(usuario.id, e)}
          />
        ) : (
          <p className="text-[13px] text-ink-3">Elige una persona para ver sus permisos.</p>
        )}
      </div>
    </Container>
  );
}

/* ───────────────────────────────────────────────────────────── detalle ── */

function Detalle({
  usuario,
  autor,
  puedeGestionar,
  onRegistrar,
}: {
  usuario: UserSummaryDto;
  autor: Autor;
  puedeGestionar: boolean;
  onRegistrar: (e: PermissionExceptionDto) => void;
}) {
  const actor = useMemo(() => toActor(usuario), [usuario]);

  return (
    <section aria-label={`Permisos de ${usuario.fullName}`} className="flex min-w-0 flex-col gap-5">
      {/* ── quién es y sus excepciones ── */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-3">
          <Initial
            name={usuario.fullName}
            tone={usuario.active ? "brand" : "idle"}
            className="size-12 text-lg"
          />
          <div className="min-w-0">
            <h2 className="font-display truncate text-lg font-bold text-ink">{usuario.fullName}</h2>
            <p className="text-[13px] text-ink-3">
              Rol: <span className="text-ink-2">{NOMBRE_ROL[usuario.role]}</span> ·{" "}
              {usuario.branchIds.length === 1
                ? "sucursal única"
                : `${usuario.branchIds.length} sucursales`}
              {!usuario.active && " · de baja"}
            </p>
          </div>
        </div>

        <h3 className="mt-5 mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
          Excepciones
        </h3>
        {usuario.exceptions.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Ninguna. Tiene exactamente lo que da su rol.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {usuario.exceptions.map((e) => (
              <li
                key={`${e.effect}|${e.action}`}
                className="rounded-[var(--radius-control)] border border-line bg-base/40 px-3.5 py-3"
              >
                <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <Badge tone={e.effect === "GRANT" ? "warn" : "idle"}>
                    {e.effect === "GRANT" ? "Concesión" : "Revocación"}
                  </Badge>
                  <span className="font-semibold text-ink">{etiquetaDe(e.action)}</span>
                  {e.effect === "GRANT" && (
                    <span className="text-ink-3">→ {ESTADO[e.permission].texto}</span>
                  )}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">«{e.reason}»</p>
                <p className="tnum mt-1 text-[11.5px] text-ink-3">
                  {e.grantedByName} · {FECHA.format(Date.parse(e.at))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {puedeGestionar && usuario.active && (
        <FormExcepcion usuario={usuario} actor={actor} autor={autor} onRegistrar={onRegistrar} />
      )}

      {/* ── permisos efectivos ── */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <h3 className="font-display text-base font-bold text-ink">Lo que puede hacer</h3>
        <p className="mb-4 text-[12px] text-ink-3">
          Resaltado: una excepción de esta persona, con lo que daría su rol tachado al lado.
        </p>

        <div className="flex flex-col gap-4">
          {AREAS.map((area) => (
            <div key={area}>
              <p className="mb-1 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                {area}
              </p>
              <ul>
                {ACCIONES.filter((a) => ETIQUETAS[a].area === area).map((a) => {
                  const x = explainPermission(actor, a);
                  const est = ESTADO[x.effective];
                  const excepcion = x.source !== "ROL";
                  return (
                    <li
                      key={a}
                      className={cn(
                        "flex items-center justify-between gap-3 border-b border-line/40 py-1.5 text-[13px] last:border-0",
                        excepcion && "-mx-2 rounded-[0.35rem] border-transparent bg-state-warn-bg/35 px-2",
                      )}
                    >
                      <span className={excepcion ? "font-medium text-ink" : "text-ink-2"}>
                        {ETIQUETAS[a].etiqueta}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {excepcion && (
                          <span className="text-[11px] text-ink-3 line-through">
                            {ESTADO[x.base].texto}
                          </span>
                        )}
                        <span className={cn("flex items-center gap-1 font-medium", est.clase)}>
                          <est.Icono size={13} aria-hidden="true" />
                          {est.texto}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── nueva excepción ── */

const ETIQUETA_CAMPO = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";

function FormExcepcion({
  usuario,
  actor,
  autor,
  onRegistrar,
}: {
  usuario: UserSummaryDto;
  actor: Actor;
  autor: Autor;
  onRegistrar: (e: PermissionExceptionDto) => void;
}) {
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
        action: `No cambia nada: por su rol ya tiene «${ESTADO[resultado].texto}» en esta acción.`,
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
      r.data.effect === "GRANT"
        ? { effect: "GRANT", permission: r.data.permission, ...auditoria }
        : { effect: "REVOKE", ...auditoria },
    );

    setErrores({});
    setAccion("");
    setMotivo("");
    avisar.ok(
      `${r.data.effect === "GRANT" ? "Concesión" : "Revocación"} registrada: «${ETIQUETAS[nombre].etiqueta}».`,
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <h3 className="font-display text-base font-bold text-ink">Añadir una excepción</h3>
      <p className="mb-4 text-[12px] text-ink-3">
        Vale solo en las sucursales de {usuario.fullName.split(" ")[0]}: una excepción nunca amplía
        la sede.
      </p>

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
          {errores["action"] && (
            <p className="text-[12.5px] text-state-crit">{errores["action"]}</p>
          )}
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

        <Button surface="tablet" variant="primary" onClick={enviar} className="w-full">
          Registrar excepción
        </Button>

      </div>
    </div>
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
