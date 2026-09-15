"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CircleCheckBig,
  KeyRound,
  Lock,
  LayoutDashboard,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import {
  RoleAdjustmentCommandSchema,
  type RoleAdjustmentCommand,
  type RoleAdjustmentDto,
} from "@l2/contracts";
import {
  ACCIONES_INTOCABLES,
  esAjustable,
  explainPermission,
  type Action,
  type Permission,
  type Role,
} from "@l2/domain-identity";
import { Badge, Button, Container, Dialog, PageHeader, avisar, cn } from "@l2/ui";
import { ACCIONES, AREAS, ETIQUETAS, NOMBRE_ROL } from "./permisos.ts";
import { guardarAjustes, useAjustes } from "./accesos.ts";
import type { Autor } from "./equipo.ts";

/**
 * Roles y accesos de este local — N-05 de la auditoría, sobre §7.3.
 *
 * LA PREGUNTA QUE RESUELVE
 * «¿La caja puede entrar al back-office?» tenía dos respuestas escritas por
 * separado: `/panel` pedía ver reportes y `/panel/caja` solo la acción del
 * módulo, así que la cajera se quedaba dentro de la cáscara sin poder subir un
 * nivel. Ahora hay **una sola puerta** —`reportes.verSucursal`— y quién la
 * cruza deja de estar clavado en el código: se decide aquí.
 *
 * LA MATRIZ ES LA BASE, NO UN DOGMA
 * Lo de fábrica (§7.3) es lo sensato para un parque con restaurante. Un local
 * concreto decide otra cosa —su caja cierra los domingos y necesita el resumen
 * del día— y eso no debería exigir un despliegue ni repetirse persona por
 * persona. El ajuste se lee **encima** de la matriz, con su motivo y su autor,
 * y se retira cuando deja de hacer falta.
 *
 * TRES COSAS QUE ESTA PANTALLA NO DEJA HACER, A PROPÓSITO
 *
 *  1. **Tocar la fila de administración.** Un local que se quita a sí mismo la
 *     administración se queda sin nadie que pueda devolvérsela.
 *  2. **Regalar las dos llaves de la casa**: gestionar personas y modificar el
 *     catálogo. La primera permite concederse el resto; la segunda abre esta
 *     misma pantalla. Si se pudieran ajustar, este sería el último ajuste que
 *     alguien necesitaría hacer.
 *  3. **Cambiar nada sin decir por qué.** Como en Usuarios: motivo obligatorio,
 *     con el autor y la hora.
 *
 * Lo que se decide para una PERSONA sigue estando en Usuarios y permisos, y
 * gana sobre lo que se decida aquí para su rol: es lo que se resolvió mirándola
 * a ella (DEC-15).
 */

const ROLES: readonly Role[] = [
  "SUPERVISOR",
  "CAJERO",
  "MESERO",
  "MONITOR_PARQUE",
  "COCINA",
];

const NIVELES: readonly { valor: Permission; texto: string; clase: string; Icono: typeof Ban }[] = [
  { valor: "PERMITIDO", texto: "Permitido", clase: "text-state-ok", Icono: CircleCheckBig },
  {
    valor: "REQUIERE_AUTORIZACION",
    texto: "Con autorización",
    clase: "text-state-warn",
    Icono: KeyRound,
  },
  { valor: "DENEGADO", texto: "No", clase: "text-ink-3", Icono: Ban },
];

const NIVEL = Object.fromEntries(NIVELES.map((n) => [n.valor, n])) as Record<
  Permission,
  (typeof NIVELES)[number]
>;

/** La acción que abre el back-office: es la que trae a la administración aquí. */
const ACCION_PANEL: Action = "reportes.verSucursal";

const FECHA = new Intl.DateTimeFormat("es-VE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Caracas",
});

type Pendiente = Readonly<{
  role: Role;
  action: Action;
  /** El nivel al que se quiere llevar, o `null` para volver a la matriz. */
  permission: Permission | null;
}>;

export function AccesosScreen({ autor, branchId }: { autor: Autor; branchId: string }) {
  const ajustes = useAjustes();
  const [rol, setRol] = useState<Role>("CAJERO");
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** El actor de un rol «limpio»: sin persona detrás, solo su rol y los ajustes. */
  const actorDeRol = useMemo(() => {
    const deEste: Partial<Record<Action, Permission>> = {};
    for (const a of ajustes) {
      if (a.role !== rol) continue;
      const accion = a.action as Action;
      if (esAjustable(rol, accion)) deEste[accion] = a.permission;
    }
    return { id: `rol:${rol}`, role: rol, branchIds: [branchId], roleAdjustments: deEste };
  }, [ajustes, rol, branchId]);

  const ajustados = ajustes.filter((a) => a.role === rol);

  function abrir(action: Action, permission: Permission | null) {
    setPendiente({ role: rol, action, permission });
    setMotivo("");
    setError(null);
  }

  function confirmar() {
    if (!pendiente) return;
    const reason = motivo.trim();
    const comando: RoleAdjustmentCommand =
      pendiente.permission === null
        ? { kind: "RETIRAR", branchId, role: pendiente.role, action: pendiente.action, reason }
        : {
            kind: "AJUSTAR",
            branchId,
            role: pendiente.role,
            action: pendiente.action,
            permission: pendiente.permission,
            reason,
          };

    const r = RoleAdjustmentCommandSchema.safeParse(comando);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? "Ese ajuste no es válido.");
      return;
    }
    // El dominio decide qué celda se puede tocar; la pantalla solo lo consulta.
    if (!esAjustable(pendiente.role, pendiente.action)) {
      setError("Esa celda no se puede ajustar.");
      return;
    }

    const resto = ajustes.filter(
      (a) => !(a.role === pendiente.role && a.action === pendiente.action),
    );
    const etiqueta = ETIQUETAS[pendiente.action].etiqueta;

    if (r.data.kind === "RETIRAR") {
      guardarAjustes(branchId, resto);
      avisar.ok(`«${etiqueta}» vuelve a lo que dice la matriz para ${NOMBRE_ROL[pendiente.role]}.`);
    } else {
      // TODO(F2-05/backend): el autor y la hora los pone el servidor.
      const nuevo: RoleAdjustmentDto = {
        role: r.data.role,
        action: r.data.action,
        permission: r.data.permission,
        by: autor.id,
        byName: autor.nombre,
        reason: r.data.reason,
        at: new Date().toISOString(),
      };
      guardarAjustes(branchId, [...resto, nuevo]);
      avisar.ok(`${NOMBRE_ROL[pendiente.role]}: «${etiqueta}» → ${NIVEL[r.data.permission].texto}.`);
    }
    setPendiente(null);
  }

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Configuración", href: "/panel/configuracion" },
          { texto: "Roles y accesos" },
        ]}
        titulo="Roles y accesos"
        descripcion="Lo que alcanza cada rol en este local. De fábrica viene la matriz del plan; aquí se ajusta lo que este local hace distinto, con su motivo."
        meta={
          <span className="tnum text-[12.5px] text-ink-3">
            {ajustes.length === 0
              ? "Sin ajustes: todo sale de la matriz de fábrica"
              : `${ajustes.length} ${ajustes.length === 1 ? "ajuste" : "ajustes"} en este local`}
          </span>
        }
      />

      {/* ── la pregunta que trae aquí a la administración ── */}
      <section
        aria-label="Quién entra al back-office"
        className="mb-6 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card"
      >
        <h2 className="font-display flex items-center gap-2 text-base font-bold text-ink">
          <LayoutDashboard size={17} aria-hidden="true" />
          Quién entra al back-office
        </h2>
        <p className="mt-1 mb-4 max-w-[70ch] text-[13px] text-ink-2">
          El panel es una sola puerta: quien puede ver los reportes de la sucursal entra, y quien no,
          trabaja en su estación a pantalla completa. Administración y supervisión entran siempre.
        </p>
        <ul className="flex flex-wrap gap-2">
          {ROLES.map((r) => {
            const entra = permisoDe(r, ACCION_PANEL, ajustes) !== "DENEGADO";
            const ajustado = ajustes.some((a) => a.role === r && a.action === ACCION_PANEL);
            return (
              <li key={r}>
                <button
                  type="button"
                  aria-pressed={entra}
                  onClick={() => {
                    setRol(r);
                    abrir(ACCION_PANEL, entra ? null : "PERMITIDO");
                  }}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13px]",
                    "transition-colors duration-[var(--dur-rapida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    entra
                      ? "border-state-ok/45 bg-state-ok-bg/40 font-semibold text-ink"
                      : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
                  )}
                >
                  {entra ? (
                    <CircleCheckBig size={14} className="text-state-ok" aria-hidden="true" />
                  ) : (
                    <Ban size={14} aria-hidden="true" />
                  )}
                  {NOMBRE_ROL[r]}
                  {ajustado && (
                    <span className="text-[10px] tracking-wide text-state-warn uppercase">
                      ajustado
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── la matriz, rol por rol ── */}
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Elegir rol">
        {ROLES.map((r) => {
          const n = ajustes.filter((a) => a.role === r).length;
          return (
            <button
              key={r}
              type="button"
              aria-pressed={rol === r}
              onClick={() => setRol(r)}
              className={cn(
                "flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13px]",
                "transition-colors duration-[var(--dur-rapida)]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                rol === r
                  ? "border-brand bg-brand/12 font-semibold text-ink"
                  : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              {NOMBRE_ROL[r]}
              {n > 0 && (
                <span className="tnum flex size-5 items-center justify-center rounded-full bg-state-warn-bg text-[11px] font-bold text-state-warn">
                  {n}
                </span>
              )}
            </button>
          );
        })}
        <span className="flex min-h-9 items-center gap-1.5 rounded-[var(--radius-control)] border border-dashed border-line px-3 text-[12px] text-ink-3">
          <Lock size={13} aria-hidden="true" />
          Administración: no se ajusta
        </span>
      </div>

      {ajustados.length > 0 && (
        <section
          aria-label={`Ajustes de ${NOMBRE_ROL[rol]}`}
          className="mb-4 rounded-[var(--radius-card)] border border-state-warn/35 bg-state-warn-bg/20 p-4"
        >
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            Lo que este local hace distinto
          </h2>
          <ul className="flex flex-col gap-2">
            {ajustados.map((a) => (
              <li key={a.action} className="text-[13px]">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone="warn">Ajuste</Badge>
                  <span className="font-semibold text-ink">
                    {ETIQUETAS[a.action as Action]?.etiqueta ?? a.action}
                  </span>
                  <span className="text-ink-3">→ {NIVEL[a.permission].texto}</span>
                </p>
                <p className="mt-1 text-ink-2">«{a.reason}»</p>
                <p className="tnum mt-0.5 text-[11.5px] text-ink-3">
                  {a.byName} · {FECHA.format(Date.parse(a.at))}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-2 xl:gap-x-8">
        <p className="text-[12.5px] text-ink-3 xl:col-span-2">
          Resaltado: lo que este local ajustó, con el valor de fábrica tachado al lado. Las celdas con
          candado no se pueden ajustar desde aquí.
        </p>
        {AREAS.map((area) => (
          <section key={area} aria-label={area}>
            <h2 className="mb-1 text-[10.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
              {area}
            </h2>
            <ul>
              {ACCIONES.filter((a) => ETIQUETAS[a].area === area).map((a) => (
                <FilaAccion
                  key={a}
                  accion={a}
                  rol={rol}
                  explicacion={explainPermission(actorDeRol, a)}
                  onCambiar={(p) => abrir(a, p)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Dialog
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={pendiente?.permission === null ? "Retirar el ajuste" : "Ajustar lo que da este rol"}
        descripcion={
          pendiente?.permission === null
            ? "La acción vuelve a lo que dice la matriz de fábrica para este rol."
            : "Vale para todas las personas con este rol en este local. Lo decidido para una persona en concreto sigue mandando sobre esto."
        }
        pie={
          <div className="flex gap-2">
            <Button
              surface="tablet"
              variant="ghost"
              onClick={() => setPendiente(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button surface="tablet" variant="primary" onClick={confirmar} className="flex-1">
              {pendiente?.permission === null ? "Retirar" : "Guardar el ajuste"}
            </Button>
          </div>
        }
      >
        {pendiente && (
          <div className="flex flex-col gap-4">
            <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3.5 py-2.5 text-[13.5px]">
              <span className="text-ink-3">{NOMBRE_ROL[pendiente.role]} · </span>
              <span className="font-semibold text-ink">{ETIQUETAS[pendiente.action].etiqueta}</span>
              <span className="text-ink-3">
                {" "}
                →{" "}
                {pendiente.permission === null
                  ? "lo que diga la matriz"
                  : NIVEL[pendiente.permission].texto}
              </span>
            </p>

            {pendiente.action === ACCION_PANEL && pendiente.permission !== null && (
              <p className="flex items-start gap-2 text-[12.5px] text-state-warn">
                <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                Con esto, todo el personal con ese rol podrá abrir el back-office y ver los reportes de
                la sucursal.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="ajuste-motivo"
                className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase"
              >
                Motivo
              </label>
              <textarea
                id="ajuste-motivo"
                rows={3}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                placeholder="Por qué este local necesita algo distinto de la matriz"
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
                <p className="text-[12.5px] text-ink-3">
                  Queda en la auditoría con tu nombre y la hora.
                </p>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </Container>
  );
}

/** El nivel que tiene un rol para una acción, con los ajustes puestos. */
function permisoDe(
  role: Role,
  action: Action,
  ajustes: readonly RoleAdjustmentDto[],
): Permission {
  const ajuste = ajustes.find((a) => a.role === role && a.action === action);
  return explainPermission(
    {
      id: `rol:${role}`,
      role,
      branchIds: ["b1"],
      roleAdjustments: ajuste ? { [action]: ajuste.permission } : {},
    },
    action,
  ).effective;
}

function FilaAccion({
  accion,
  rol,
  explicacion,
  onCambiar,
}: {
  accion: Action;
  rol: Role;
  explicacion: ReturnType<typeof explainPermission>;
  onCambiar: (p: Permission | null) => void;
}) {
  const ajustable = esAjustable(rol, accion);
  const ajustado = explicacion.source === "AJUSTE_DE_ROL";
  const actual = NIVEL[explicacion.effective];

  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-line/40 py-1.5 text-[13px] last:border-0",
        ajustado && "-mx-2 rounded-[0.35rem] border-transparent bg-state-warn-bg/35 px-2",
      )}
    >
      <span className={cn("min-w-0 flex-1", ajustado ? "font-medium text-ink" : "text-ink-2")}>
        {ETIQUETAS[accion].etiqueta}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {ajustado && (
          <span className="text-[11px] text-ink-3 line-through">{NIVEL[explicacion.matriz].texto}</span>
        )}

        {ajustable ? (
          <span className="flex items-center gap-1" role="group" aria-label={ETIQUETAS[accion].etiqueta}>
            {NIVELES.map((n) => {
              const activo = n.valor === explicacion.effective;
              return (
                <button
                  key={n.valor}
                  type="button"
                  aria-pressed={activo}
                  title={n.texto}
                  onClick={() => !activo && onCambiar(n.valor)}
                  className={cn(
                    "flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border",
                    "transition-colors duration-[var(--dur-rapida)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    activo
                      ? cn("border-line-strong bg-surface-2", n.clase)
                      : "border-transparent text-ink-3/60 hover:border-line hover:text-ink-2",
                  )}
                >
                  <n.Icono size={14} aria-hidden="true" />
                  <span className="sr-only">{n.texto}</span>
                </button>
              );
            })}
            {ajustado && (
              <button
                type="button"
                title="Volver a la matriz de fábrica"
                onClick={() => onCambiar(null)}
                className="flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-transparent text-ink-3 transition-colors hover:border-line hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span className="sr-only">Volver a la matriz</span>
              </button>
            )}
          </span>
        ) : (
          <span
            className={cn("flex items-center gap-1.5 pr-2 text-[12.5px]", actual.clase)}
            title={
              ACCIONES_INTOCABLES.includes(accion)
                ? "Esta acción no se ajusta por rol: regalarla abriría todo lo demás."
                : "La administración no se ajusta."
            }
          >
            <Lock size={12} className="text-ink-3" aria-hidden="true" />
            {actual.texto}
          </span>
        )}
      </span>
    </li>
  );
}
