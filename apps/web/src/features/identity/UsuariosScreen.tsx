"use client";

import { useMemo, useState } from "react";
import type { PermissionExceptionCommand } from "@l2/contracts";
import {
  Ban,
  CircleCheckBig,
  KeyRound,
  LayoutDashboard,
  Search,
  ShieldAlert,
  UserX,
  Users,
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
import { Badge, BarraDeFiltros, Button, CAMPO_DE_FILTRO, Cifra, Container, Dialog, FiltroSegmentado, Initial, PageHeader, Resumen, avisar, cn } from "@l2/ui";
import { ACCIONES, AREAS, ETIQUETAS, NOMBRE_ROL, etiquetaDe, toActor } from "./permisos.ts";
import type { Autor } from "./operador.ts";
import { cambiarPersona, registrarExcepcion } from "./identidad.acciones";
import { useConElevacion } from "./ElevacionProvider";
import { DialogoCambio, type Cambio } from "./DialogoCambio.tsx";
import { SheetExcepcion } from "./SheetExcepcion.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";

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
  branchId,
  puedeGestionar,
}: {
  usuarios: readonly UserSummaryDto[];
  autor: Autor;
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
  /** Qué personas se ven (T-7): las activas, las que tienen excepciones o las de baja. */
  const [estado, setEstado] = useState<"ACTIVAS" | "EXCEPCIONES" | "BAJAS">("ACTIVAS");
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [excepcionPara, setExcepcionPara] = useState<UserSummaryDto | null>(null);
  /** El PIN temporal de un alta o una reposición: se enseña UNA vez y no se guarda en ningún sitio. */
  const [pinParaEntregar, setPinParaEntregar] = useState<{ nombre: string; pin: string } | null>(null);
  const conElevacion = useConElevacion();

  const usuario = usuarios.find((u) => u.id === seleccion) ?? null;
  const activas = usuarios.filter((u) => u.active).length;
  const conExcepciones = usuarios.filter((u) => u.active && u.exceptions.length > 0).length;
  const alPanel = usuarios.filter((u) => u.active && (u.role === "ADMIN" || u.role === "SUPERVISOR")).length;

  const enEstado = (u: UserSummaryDto) =>
    estado === "BAJAS" ? !u.active : estado === "EXCEPCIONES" ? u.active && u.exceptions.length > 0 : u.active;
  const lista = useMemo(() => {
    const q = plano(busqueda.trim());
    return usuarios.filter((u) => enEstado(u) && (filtroRol === "TODOS" || u.role === filtroRol) && (q === "" || plano(u.fullName).includes(q)));
  }, [usuarios, busqueda, filtroRol, estado]);
  const delRol = (r: Role) => usuarios.filter((u) => enEstado(u) && u.role === r).length;
  const hayFiltros = estado !== "ACTIVAS" || filtroRol !== "TODOS" || busqueda.trim() !== "";

  /**
   * Envía un comando al SERVIDOR, que lo valida con el contrato, lo juzga con las cinco puertas
   * del dominio sobre el equipo real y lo guarda con su asiento. Aquí solo se refleja la respuesta.
   */
  async function ejecutar(comando: UserCommand): Promise<boolean> {
    const r = UserCommandSchema.safeParse(comando);
    if (!r.success) {
      avisar.error(r.error.issues[0]?.message ?? "Ese cambio no es válido.");
      return false;
    }
    const salida = await conElevacion(() => cambiarPersona(r.data)).catch(() => null);
    if (!salida) {
      avisar.error("El servidor no respondió. El cambio no se guardó; inténtalo de nuevo.");
      return false;
    }
    if (!salida.ok) {
      avisar.error(salida.problemas?.[0]?.message ?? salida.mensaje);
      return false;
    }
    const u = salida.valor.usuario;
    setUsuarios((prev) => (prev.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]));
    // Tras un alta, la persona nueva es lo que se quiere mirar.
    if (r.data.kind === "ALTA") setSeleccion(u.id);
    if (salida.valor.pinTemporal) setPinParaEntregar({ nombre: u.fullName, pin: salida.valor.pinTemporal });
    avisar.ok(salida.valor.mensaje);
    return true;
  }

  /** Una concesión o revocación, al servidor. Devuelve el error para la hoja, o `null`. */
  async function registrar(cmd: PermissionExceptionCommand): Promise<string | null> {
    const r = await conElevacion(() => registrarExcepcion(cmd)).catch(() => null);
    if (!r) return "El servidor no respondió. No se guardó; inténtalo de nuevo.";
    if (!r.ok) return r.problemas?.[0]?.message ?? r.mensaje;
    setUsuarios((prev) => prev.map((u) => (u.id === r.valor.id ? r.valor : u)));
    setExcepcionPara(null);
    return null;
  }

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Ajustes", href: "/panel/ajustes" },
          { texto: "Usuarios y permisos" },
        ]}
        titulo="Usuarios y permisos"
        descripcion="Cada persona tiene un rol fijo. Lo que se sale de su rol se ve aparte: son las excepciones, con quién las concedió, cuándo y por qué."
        acciones={
          puedeGestionar && (
            <Button surface="admin" variant="primary" onClick={() => setCambio({ kind: "ALTA" })}>
              <UserPlus size={15} aria-hidden="true" />
              Añadir persona
            </Button>
          )
        }
      />

      <Resumen etiqueta="Resumen del equipo">
        <Cifra
          etiqueta="Activas"
          icono={<Users aria-hidden="true" />}
          valor={String(activas)}
          pie="Entran con su PIN en un equipo aprobado"
          activo={estado === "ACTIVAS" && filtroRol === "TODOS"}
          onClick={() => {
            setEstado("ACTIVAS");
            setFiltroRol("TODOS");
          }}
        />
        <Cifra
          etiqueta="Con excepciones"
          icono={<ShieldAlert aria-hidden="true" />}
          valor={String(conExcepciones)}
          pie={conExcepciones > 0 ? "Tienen poderes que su rol no da (o les quitaron)" : "Todos tienen exactamente su rol"}
          activo={estado === "EXCEPCIONES"}
          onClick={() => setEstado("EXCEPCIONES")}
        />
        <Cifra
          etiqueta="Entran al panel"
          icono={<LayoutDashboard aria-hidden="true" />}
          valor={String(alPanel)}
          pie="Administración y supervisión"
        />
        <Cifra
          etiqueta="De baja"
          icono={<UserX aria-hidden="true" />}
          valor={String(usuarios.length - activas)}
          pie="No se borran: su historia y sus cobros se conservan"
          activo={estado === "BAJAS"}
          onClick={() => setEstado("BAJAS")}
        />
      </Resumen>

      <div className="mt-4 grid min-h-0 flex-1 content-start gap-5 overflow-y-auto lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:content-stretch lg:overflow-visible">
        {/* ═════════════════════════ personas ═════════════════════════ */}
        <section aria-label="Personas" className="flex min-w-0 flex-col gap-2.5 lg:min-h-0">
          <BarraDeFiltros
            hayFiltros={hayFiltros}
            onLimpiar={() => {
              setEstado("ACTIVAS");
              setFiltroRol("TODOS");
              setBusqueda("");
            }}
          >
            <FiltroSegmentado
              etiqueta="Estado"
              valor={estado}
              onCambiar={setEstado}
              opciones={[
                { id: "ACTIVAS", nombre: "Activas", cuenta: activas },
                { id: "EXCEPCIONES", nombre: "Excepciones", cuenta: conExcepciones },
                { id: "BAJAS", nombre: "De baja", cuenta: usuarios.length - activas },
              ]}
            />
          </BarraDeFiltros>
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <label className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-3" aria-hidden="true" />
              <input
                type="search"
                aria-label="Buscar por nombre"
                placeholder="Nombre"
                className={cn(CAMPO_DE_FILTRO, "w-full pl-8")}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </label>
            <select aria-label="Rol" className={cn(CAMPO_DE_FILTRO, "w-full")} value={filtroRol} onChange={(e) => setFiltroRol(e.target.value as Role | "TODOS")}>
              <option value="TODOS">Todos los roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]} ({delRol(r)})
                </option>
              ))}
            </select>
          </div>

          {lista.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              Nadie con estos filtros.
            </p>
          ) : (
            <ul className="flex min-h-0 flex-col gap-1.5 lg:overflow-y-auto">
              {lista.map((u) => {
                const activa = u.id === seleccion;
                return (
                  <li key={u.id} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSeleccion(u.id)}
                      aria-pressed={activa}
                      className={cn(
                        "flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)]",
                        "border bg-surface px-3 py-1.5 text-left",
                        "transition-[border-color,background-color] duration-[var(--dur-rapida)] ease-[var(--ease-salida)]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        activa ? "border-brand/60 bg-surface-2" : "border-line hover:border-line-strong",
                        !u.active && "opacity-55",
                      )}
                    >
                      <Initial name={u.fullName} tone={u.active ? "brand" : "idle"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-ink">{u.fullName}</span>
                        <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                          {NOMBRE_ROL[u.role]}
                          {!u.active && <span className="text-[10px] tracking-wide uppercase">· de baja</span>}
                        </span>
                      </span>
                      {u.exceptions.length > 0 && (
                        <span
                          aria-label={`${u.exceptions.length} excepciones`}
                          title="Excepciones: permisos que su rol no da, o que le quitaron"
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
        branchId={branchId}
        onConfirmar={async (comando) => {
          if (await ejecutar(comando)) setCambio(null);
        }}
      />

      {excepcionPara && (
        <SheetExcepcion
          usuario={usuarios.find((u) => u.id === excepcionPara.id) ?? excepcionPara}
          autor={autor}
          onCerrar={() => setExcepcionPara(null)}
          onRegistrar={registrar}
        />
      )}

      {pinParaEntregar && (
        <Dialog
          abierto
          onCerrar={() => setPinParaEntregar(null)}
          titulo={`PIN temporal de ${pinParaEntregar.nombre}`}
          descripcion="Dáselo en mano. Se muestra solo esta vez: al entrar con él elegirá el suyo, y el temporal deja de servir."
          pie={
            <Button surface="admin" variant="primary" className="w-full" onClick={() => setPinParaEntregar(null)}>
              Ya lo entregué
            </Button>
          }
        >
          <p className="tnum font-display py-4 text-center text-5xl font-bold tracking-[0.4em] text-ink">{pinParaEntregar.pin}</p>
        </Dialog>
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
  const reloj = useReloj();
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
    <section aria-label={`Permisos de ${usuario.fullName}`} className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
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
                  {e.grantedByName} · {reloj.diaYHora(Date.parse(e.at))}
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
                  {c.byName} · {reloj.diaYHora(Date.parse(c.at))}
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
