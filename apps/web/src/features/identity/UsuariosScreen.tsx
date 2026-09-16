"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CircleCheckBig,
  KeyRound,
  Search,
  ShieldMinus,
  ShieldPlus,
  UserMinus,
  UserPlus,
  UserRoundCog,
} from "lucide-react";
import {
  UserCommandSchema,
  type UserCommand,
  type UserSummaryDto,
} from "@l2/contracts";
import {
  explainPermission,
  type Action,
  type Actor,
  type Permission,
  type Role,
} from "@l2/domain-identity";
import { Badge, Button, Container, Initial, Input, PageHeader, avisar, cn } from "@l2/ui";
import { ACCIONES, AREAS, ETIQUETAS, NOMBRE_ROL, etiquetaDe, toActor } from "./permisos.ts";
import { aplicarComando, type Autor } from "./equipo.ts";
import { DialogoCambio, type Cambio } from "./DialogoCambio.tsx";
import { SheetExcepcion } from "./SheetExcepcion.tsx";

/**
 * Usuarios y permisos — F2-11, DEC-15, §9.10.6.
 *
 * LA REGLA QUE ORGANIZA LA PANTALLA
 * «La pantalla de usuarios muestra el rol y las excepciones por separado, para
 * que se vea de un vistazo quién tiene poderes que su puesto no da.»
 *
 * DE INFORME A GESTIÓN — 2026-09-14
 *
 * Esta pantalla enseñaba permisos y dejaba añadir excepciones, y nada más: no
 * se podía dar de alta a nadie, ni de baja, ni cambiar un rol, ni reponer un
 * PIN. Era un informe con un formulario pegado, y el resto del trabajo se
 * hacía «hablando con quien programa». Ahora los cinco cambios existen, cada
 * uno con su motivo obligatorio y su asiento en la historia de la persona, que
 * es lo que convierte una pantalla de permisos en algo auditable (§7.4).
 *
 * TRES DECISIONES DE DISPOSICIÓN
 *
 *  1. **Lista densa con buscador y filtro por rol.** Con siete personas sobra
 *     una pila de tarjetas; con veinte, no. Y se busca por nombre porque es lo
 *     que se recuerda.
 *  2. **Los permisos empiezan plegados.** Veintitantas filas seguidas no son
 *     jerarquía, son una pared. Lo que sí se ve siempre es lo que se sale del
 *     rol: las excepciones, que es para lo que existe esta pantalla.
 *  3. **Cada cambio se pide en una capa, no en un formulario permanente.** El
 *     formulario de excepciones ocupaba media ficha aunque no se fuera a usar.
 *
 * Lo que NO decide esta pantalla: si el cambio se puede hacer. Eso es
 * `revisarCambio` en `@l2/domain-identity`, con la matriz y el estado del
 * equipo. Aquí solo se enseña el motivo cuando dice que no.
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

const ROLES: readonly Role[] = ["ADMIN", "SUPERVISOR", "CAJERO", "MESERO", "MONITOR_PARQUE", "COCINA"];

/** Sin acentos y en minúsculas: se busca «jesus» y aparece «Jesús». */
const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

export function UsuariosScreen({
  usuarios: iniciales,
  autor,
  actor,
  branchId,
  puedeGestionar,
}: {
  usuarios: readonly UserSummaryDto[];
  autor: Autor;
  /** Quién está haciendo los cambios, para que el dominio los juzgue. */
  actor: Actor;
  branchId: string;
  puedeGestionar: boolean;
}) {
  const [usuarios, setUsuarios] = useState<readonly UserSummaryDto[]>(iniciales);
  // Se abre en la primera persona con excepciones: es lo que esta pantalla
  // existe para enseñar.
  const [seleccion, setSeleccion] = useState<string | null>(
    iniciales.find((u) => u.exceptions.length > 0)?.id ?? iniciales[0]?.id ?? null,
  );
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<Role | "TODOS">("TODOS");
  const [conBajas, setConBajas] = useState(false);
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [excepcionPara, setExcepcionPara] = useState<UserSummaryDto | null>(null);

  const usuario = usuarios.find((u) => u.id === seleccion) ?? null;
  const activas = usuarios.filter((u) => u.active).length;
  const conExcepciones = usuarios.filter((u) => u.exceptions.length > 0).length;

  const lista = useMemo(() => {
    const q = plano(busqueda.trim());
    return usuarios.filter((u) => {
      if (!conBajas && !u.active) return false;
      if (filtroRol !== "TODOS" && u.role !== filtroRol) return false;
      return q === "" || plano(u.fullName).includes(q);
    });
  }, [usuarios, busqueda, filtroRol, conBajas]);

  /** Ejecuta un comando ya formado: valida, pregunta al dominio y aplica. */
  function ejecutar(comando: UserCommand): boolean {
    const r = UserCommandSchema.safeParse(comando);
    if (!r.success) {
      avisar.error(r.error.issues[0]?.message ?? "Ese cambio no es válido.");
      return false;
    }
    const salida = aplicarComando({
      usuarios,
      comando: r.data,
      autor,
      actor,
      branchId,
      ahora: Date.now(),
    });
    if (!salida.ok) {
      avisar.error(salida.motivo);
      return false;
    }
    setUsuarios(salida.usuarios);
    // Tras un alta, la persona nueva es lo que se quiere mirar.
    if (r.data.kind === "ALTA") {
      const nueva = salida.usuarios.at(-1);
      if (nueva) setSeleccion(nueva.id);
    }
    avisar.ok(salida.mensaje);
    return true;
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
            {activas} {activas === 1 ? "persona activa" : "personas activas"} ·{" "}
            {usuarios.length - activas} de baja · {conExcepciones} con excepciones
          </span>
        }
        acciones={
          puedeGestionar && (
            <Button surface="admin" variant="primary" onClick={() => setCambio({ kind: "ALTA" })}>
              <UserPlus size={15} aria-hidden="true" />
              Añadir persona
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        {/* ═════════════════════════ personas ═════════════════════════ */}
        <section aria-label="Personas" className="flex min-w-0 flex-col gap-3">
          <Input
            surface="admin"
            label="Buscar"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre de la persona"
            leading={<Search size={14} aria-hidden="true" />}
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por rol">
              <Chip activo={filtroRol === "TODOS"} onClick={() => setFiltroRol("TODOS")}>
                Todos
              </Chip>
              {ROLES.map((r) => (
                <Chip key={r} activo={filtroRol === r} onClick={() => setFiltroRol(r)}>
                  {NOMBRE_ROL[r]}
                </Chip>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-3">
              <input
                type="checkbox"
                checked={conBajas}
                onChange={(e) => setConBajas(e.target.checked)}
                className="size-3.5 accent-[var(--color-brand)]"
              />
              Incluir a quienes están de baja
            </label>
          </div>

          {lista.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              Nadie con ese nombre en este filtro.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {lista.map((u) => {
                const activa = u.id === seleccion;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSeleccion(u.id)}
                      aria-pressed={activa}
                      className={cn(
                        "flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)]",
                        "border bg-surface px-3 py-2 text-left",
                        "transition-[border-color,background-color] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        activa
                          ? "border-brand/60 bg-surface-2"
                          : "border-line hover:border-line-strong",
                        !u.active && "opacity-55",
                      )}
                    >
                      <Initial name={u.fullName} tone={u.active ? "brand" : "idle"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">
                          {u.fullName}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                          {NOMBRE_ROL[u.role]}
                          {!u.active && (
                            <span className="text-[10px] tracking-wide uppercase">· de baja</span>
                          )}
                        </span>
                      </span>
                      {u.exceptions.length > 0 && (
                        <span
                          aria-label={`${u.exceptions.length} excepciones`}
                          className="tnum flex size-5 shrink-0 items-center justify-center rounded-full bg-state-warn-bg text-[11px] font-bold text-state-warn"
                        >
                          {u.exceptions.length}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11.5px] text-ink-3">
            El número naranja son las excepciones: permisos que su rol no da, o que le quitaron.
          </p>
        </section>

        {/* ═════════════════════════ detalle ══════════════════════════ */}
        {usuario ? (
          <Detalle
            key={usuario.id}
            usuario={usuario}
            puedeGestionar={puedeGestionar}
            onCambio={(c) => setCambio(c)}
            onExcepcion={() => setExcepcionPara(usuario)}
          />
        ) : (
          <p className="text-[13px] text-ink-3">Elige una persona para ver sus permisos.</p>
        )}
      </div>

      <DialogoCambio
        cambio={cambio}
        usuarios={usuarios}
        onCerrar={() => setCambio(null)}
        onConfirmar={(comando) => {
          if (ejecutar(comando)) setCambio(null);
        }}
      />

      {excepcionPara && (
        <SheetExcepcion
          usuario={usuarios.find((u) => u.id === excepcionPara.id) ?? excepcionPara}
          autor={autor}
          onCerrar={() => setExcepcionPara(null)}
          onRegistrar={(id, nueva) => {
            setUsuarios((prev) =>
              prev.map((u) => (u.id === id ? { ...u, exceptions: [...u.exceptions, nueva] } : u)),
            );
            setExcepcionPara(null);
          }}
        />
      )}
    </Container>
  );
}

/* ───────────────────────────────────────────────────────────── detalle ── */

function Detalle({
  usuario,
  puedeGestionar,
  onCambio,
  onExcepcion,
}: {
  usuario: UserSummaryDto;
  puedeGestionar: boolean;
  onCambio: (c: Cambio) => void;
  onExcepcion: () => void;
}) {
  const actor = useMemo(() => toActor(usuario), [usuario]);
  const [verTodos, setVerTodos] = useState(false);

  // Cuenta de lo que puede hacer, para decirlo en una línea antes de abrir la
  // lista entera. Un resumen que hay que desplegar para leer no es un resumen.
  const cuenta = useMemo(() => {
    const n = { PERMITIDO: 0, REQUIERE_AUTORIZACION: 0, DENEGADO: 0 };
    for (const a of ACCIONES) n[explainPermission(actor, a).effective] += 1;
    return n;
  }, [actor]);

  return (
    <section aria-label={`Permisos de ${usuario.fullName}`} className="flex min-w-0 flex-col gap-4">
      {/* ── quién es y qué se puede hacer con ella ── */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Initial
              name={usuario.fullName}
              tone={usuario.active ? "brand" : "idle"}
              className="size-12 text-lg"
            />
            <div className="min-w-0">
              <h2 className="font-display truncate text-lg font-bold text-ink">
                {usuario.fullName}
              </h2>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                <span className="text-ink-2">{NOMBRE_ROL[usuario.role]}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {usuario.branchIds.length === 1
                    ? "sucursal única"
                    : `${usuario.branchIds.length} sucursales`}
                </span>
                {!usuario.active && (
                  <Badge tone="idle" icon={<UserMinus size={12} aria-hidden="true" />}>
                    De baja
                  </Badge>
                )}
              </p>
            </div>
          </div>

          {puedeGestionar && (
            <div className="flex flex-wrap gap-1.5">
              {usuario.active ? (
                <>
                  <Accion
                    icono={<UserRoundCog size={14} aria-hidden="true" />}
                    onClick={() => onCambio({ kind: "ROL", usuario })}
                  >
                    Cambiar rol
                  </Accion>
                  <Accion
                    icono={<KeyRound size={14} aria-hidden="true" />}
                    onClick={() => onCambio({ kind: "PIN", usuario })}
                  >
                    Reponer PIN
                  </Accion>
                  <Accion
                    icono={<UserMinus size={14} aria-hidden="true" />}
                    peligro
                    onClick={() => onCambio({ kind: "BAJA", usuario })}
                  >
                    Dar de baja
                  </Accion>
                </>
              ) : (
                <Accion
                  icono={<UserPlus size={14} aria-hidden="true" />}
                  onClick={() => onCambio({ kind: "REINGRESO", usuario })}
                >
                  Devolver al equipo
                </Accion>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── excepciones: lo que esta pantalla existe para enseñar ── */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-bold text-ink">
            Excepciones sobre su rol
            {usuario.exceptions.length > 0 && (
              <span className="tnum ml-2 text-[13px] font-normal text-ink-3">
                {usuario.exceptions.length}
              </span>
            )}
          </h3>
          {puedeGestionar && usuario.active && (
            <Accion icono={<ShieldPlus size={14} aria-hidden="true" />} onClick={onExcepcion}>
              Añadir excepción
            </Accion>
          )}
        </div>

        {usuario.exceptions.length === 0 ? (
          <p className="text-[13px] text-ink-2">Ninguna. Tiene exactamente lo que da su rol.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {usuario.exceptions.map((e) => (
              <li
                key={`${e.effect}|${e.action}`}
                className="rounded-[var(--radius-control)] border border-line bg-base/40 px-3.5 py-3"
              >
                <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <Badge
                    tone={e.effect === "GRANT" ? "warn" : "idle"}
                    icon={
                      e.effect === "GRANT" ? (
                        <ShieldPlus size={12} aria-hidden="true" />
                      ) : (
                        <ShieldMinus size={12} aria-hidden="true" />
                      )
                    }
                  >
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

      {/* ── permisos efectivos, plegados ── */}
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Lo que puede hacer</h3>
            <p className="tnum mt-0.5 text-[12.5px] text-ink-3">
              <span className="text-state-ok">{cuenta.PERMITIDO} permitidas</span> ·{" "}
              <span className="text-state-warn">{cuenta.REQUIERE_AUTORIZACION} con autorización</span>{" "}
              · {cuenta.DENEGADO} denegadas
            </p>
          </div>
          <Accion onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
            {verTodos ? "Ocultar el detalle" : `Ver las ${ACCIONES.length} acciones`}
          </Accion>
        </div>

        {verTodos && (
          <div className="mt-4 flex flex-col gap-4 border-t border-line pt-4 xl:grid xl:grid-cols-2 xl:gap-x-6">
            <p className="text-[12px] text-ink-3 xl:col-span-2">
              Resaltado: una excepción de esta persona, con lo que daría su rol tachado al lado.
            </p>
            {AREAS.map((area) => (
              <div key={area} className="break-inside-avoid">
                <p className="mb-1 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
                  {area}
                </p>
                <ul>
                  {ACCIONES.filter((a) => ETIQUETAS[a].area === area).map((a) => (
                    <Fila key={a} accion={a} actor={actor} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── su historia: nada se borra ── */}
      {usuario.changes.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <h3 className="font-display mb-1 text-base font-bold text-ink">Su historia</h3>
          <p className="mb-3 text-[12px] text-ink-3">
            Nada se borra: un alta, una baja o un cambio de rol se apuntan, no se sustituyen.
          </p>
          <ol className="flex flex-col gap-2">
            {usuario.changes.map((c, i) => (
              <li
                key={`${c.kind}-${c.at}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line/40 pb-2 text-[13px] last:border-0 last:pb-0"
              >
                <span className="font-semibold text-ink">{TITULO_CAMBIO(c)}</span>
                <span className="text-ink-2">«{c.reason}»</span>
                <span className="tnum ml-auto text-[11.5px] whitespace-nowrap text-ink-3">
                  {c.byName} · {FECHA.format(Date.parse(c.at))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function TITULO_CAMBIO(c: UserSummaryDto["changes"][number]): string {
  switch (c.kind) {
    case "ALTA":
      return `Entra al equipo como ${NOMBRE_ROL[c.role]}`;
    case "BAJA":
      return "Queda de baja";
    case "REINGRESO":
      return "Vuelve al equipo";
    case "ROL":
      return `Cambia de ${NOMBRE_ROL[c.from]} a ${NOMBRE_ROL[c.to]}`;
    case "PIN":
      return "PIN repuesto";
  }
}

function Fila({ accion, actor }: { accion: Action; actor: Actor }) {
  const x = explainPermission(actor, accion);
  const est = ESTADO[x.effective];
  const excepcion = x.source !== "ROL";
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line/40 py-1.5 text-[13px] last:border-0",
        excepcion && "-mx-2 rounded-[0.35rem] border-transparent bg-state-warn-bg/35 px-2",
      )}
    >
      <span className={excepcion ? "font-medium text-ink" : "text-ink-2"}>
        {ETIQUETAS[accion].etiqueta}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {excepcion && (
          <span className="text-[11px] text-ink-3 line-through">{ESTADO[x.base].texto}</span>
        )}
        <span className={cn("flex items-center gap-1 font-medium", est.clase)}>
          <est.Icono size={13} aria-hidden="true" />
          {est.texto}
        </span>
      </span>
    </li>
  );
}

/** Botón de acción del back-office: 32 px de objetivo táctil (§8.4). */
function Accion({
  icono,
  peligro = false,
  onClick,
  children,
  ...rest
}: {
  icono?: React.ReactNode;
  peligro?: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-[12.5px]",
        "transition-colors duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        peligro
          ? "border-state-crit/40 text-state-crit hover:border-state-crit hover:bg-state-crit-bg/40"
          : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
      )}
      {...rest}
    >
      {icono}
      {children}
    </button>
  );
}

function Chip({
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
        "min-h-8 cursor-pointer rounded-full border px-2.5 text-[11.5px]",
        "transition-colors duration-[var(--dur-rapida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        activo
          ? "border-brand bg-brand/12 font-semibold text-ink"
          : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
      )}
    >
      {children}
    </button>
  );
}
