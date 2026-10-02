"use client";

import { useState } from "react";
import { Ban, CircleCheckBig, History, KeyRound, MonitorSmartphone, MonitorX, Pencil, Search, SmartphoneNfc, TriangleAlert, Users } from "lucide-react";
import { POR_PAGINA, type DeviceCommand, type DeviceDto, type FiltroDispositivos, type PaginaDeDispositivosDto, type PorPagina } from "@l2/contracts";
import {
  BarraDeFiltros,
  Button,
  CAMPO_DE_FILTRO,
  Cifra,
  Container,
  Dialog,
  EmptyState,
  FiltroSegmentado,
  Input,
  PageHeader,
  Paginacion,
  Resumen,
  Sheet,
  avisar,
  cn,
} from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { usePaginas } from "../shell/usePaginas.ts";
import { useConElevacion } from "./ElevacionProvider";
import { leerDispositivos, ordenarDispositivo } from "./dispositivos.acciones";

/**
 * Ajustes → Dispositivos (F2-02, ADR-013; patrón de Ajustes, M-17 y T-7).
 *
 * El dispositivo es el primer factor de acceso: el PIN solo abre sesión en un equipo aprobado. Arriba,
 * lo que hay que mirar (pendientes de aprobar, aprobados, con sesión ahora y revocados), y cada cifra
 * filtra la lista. La lista va por páginas del servidor, con búsqueda por nombre o código: los equipos
 * revocados no se borran (regla 5) y se acumulan. Aprobar, revocar y renombrar piden motivo, que queda
 * en la historia del equipo y en la auditoría.
 */

type Consulta = Readonly<{ pagina: number; porPagina: PorPagina; filtro: FiltroDispositivos; busqueda?: string | undefined }>;
type Orden = { kind: "APROBAR" | "REVOCAR" | "RENOMBRAR"; dev: DeviceDto };

const ESTADOS = {
  APROBADO: { texto: "Aprobado", clase: "text-state-ok", bg: "bg-state-ok-bg", Icono: CircleCheckBig },
  PENDIENTE: { texto: "Pendiente", clase: "text-state-warn", bg: "bg-state-warn-bg", Icono: KeyRound },
  REVOCADO: { texto: "Revocado", clase: "text-state-crit", bg: "bg-state-crit-bg", Icono: Ban },
} as const;

const FILTROS: readonly { id: FiltroDispositivos; nombre: string }[] = [
  { id: "TODOS", nombre: "Todos" },
  { id: "PENDIENTES", nombre: "Pendientes" },
  { id: "APROBADOS", nombre: "Aprobados" },
  { id: "EN_SESION", nombre: "Con sesión" },
  { id: "REVOCADOS", nombre: "Revocados" },
];

const TH = "px-3 py-2 text-left text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase whitespace-nowrap";
const TD = "px-3 py-2 align-middle";

export function DispositivosScreen({
  inicial,
  autor,
  puedeGestionar,
}: {
  inicial: PaginaDeDispositivosDto;
  autor: { id: string; nombre: string };
  puedeGestionar: boolean;
}) {
  const reloj = useReloj();
  const conElevacion = useConElevacion();
  const lista = usePaginas<Consulta, PaginaDeDispositivosDto>((q) => leerDispositivos(q), inicial, { pagina: 1, porPagina: 20, filtro: "TODOS" });
  const { datos, consulta, cargando, error, cambiar, releer } = lista;
  // Un equipo nuevo pide registro, otro lo aprueba o alguien entra: la lista se vuelve a leer sola.
  useAlCambiar(["equipos", "sesiones"], () => void releer());

  const [orden, setOrden] = useState<Orden | null>(null);
  const [historia, setHistoria] = useState<DeviceDto | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const conteos = datos?.conteos ?? { TODOS: 0, PENDIENTES: 0, APROBADOS: 0, REVOCADOS: 0, EN_SESION: 0 };
  const dispositivos = datos?.dispositivos ?? [];
  const hayFiltros = consulta.filtro !== "TODOS" || (consulta.busqueda ?? "") !== "";

  async function aplicar(cmd: DeviceCommand): Promise<string | null> {
    const r = await conElevacion(() => ordenarDispositivo(cmd)).catch(() => null);
    if (!r) return "El servidor no respondió. El cambio no se guardó; inténtalo de nuevo.";
    if (!r.ok) return r.problemas?.[0]?.message ?? r.mensaje;
    void releer();
    return null;
  }

  const estado = (d: DeviceDto) => {
    const e = ESTADOS[d.status];
    return (
      <span className={cn("flex items-center gap-1.5 font-semibold whitespace-nowrap", e.clase)}>
        <e.Icono size={13} aria-hidden="true" />
        {e.texto}
      </span>
    );
  };

  const acciones = (d: DeviceDto, surface: "admin" | "tablet") => (
    <div className={cn("flex shrink-0 items-center justify-end gap-1", surface === "tablet" && "flex-wrap")}>
      {d.status === "PENDIENTE" && !caducada(d) && puedeGestionar && (
        <Button type="button" variant="primary" surface={surface} onClick={() => setOrden({ kind: "APROBAR", dev: d })}>
          <CircleCheckBig size={14} aria-hidden="true" /> Aprobar
        </Button>
      )}
      <Button type="button" variant="ghost" surface={surface} aria-label={`Historia de ${d.label}`} title="Lo que le ha pasado" onClick={() => setHistoria(d)}>
        <History size={14} aria-hidden="true" />
        {surface === "tablet" && "Historia"}
      </Button>
      {puedeGestionar && (
        <Button type="button" variant="ghost" surface={surface} aria-label={`Renombrar ${d.label}`} title="Renombrar" onClick={() => setOrden({ kind: "RENOMBRAR", dev: d })}>
          <Pencil size={14} aria-hidden="true" />
          {surface === "tablet" && "Renombrar"}
        </Button>
      )}
      {d.status === "APROBADO" && puedeGestionar && (
        <Button type="button" variant="ghost" surface={surface} aria-label={`Revocar ${d.label}`} title="Revocar" onClick={() => setOrden({ kind: "REVOCAR", dev: d })}>
          <Ban size={14} className="text-state-crit" aria-hidden="true" />
          {surface === "tablet" && "Revocar"}
        </Button>
      )}
    </div>
  );

  const detalle = (d: DeviceDto) =>
    d.status === "PENDIENTE" ? (
      caducada(d) ? (
        <span className="flex items-center gap-1 text-state-crit">
          <TriangleAlert size={12} aria-hidden="true" /> Solicitud caducada: se renueva desde el equipo
        </span>
      ) : (
        <span className="text-ink-2">
          Código{" "}
          <span className="tnum rounded-[0.35rem] border border-line bg-base px-1.5 font-mono font-bold tracking-[0.12em] text-ink">{d.pairingCode}</span> · vale hasta{" "}
          {reloj.hora(Date.parse(d.requestExpiresAt!))}
        </span>
      )
    ) : d.session && d.status !== "REVOCADO" ? (
      <span className="flex items-center gap-1.5 text-ink-2">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
        {d.session.userName} <span className="tnum text-ink-3">desde {reloj.hora(Date.parse(d.session.since))}</span>
      </span>
    ) : (
      <span className="text-ink-3">{d.status === "REVOCADO" ? "Debe registrarse de nuevo para volver" : "Sin sesión"}</span>
    );

  return (
    <Container ancho="panel" className="flex min-h-0 flex-1 flex-col py-6">
      <PageHeader
        className="mb-4"
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Dispositivos" }]}
        titulo="Dispositivos"
        descripcion="El dispositivo es el primer factor de acceso: el PIN solo abre sesión en un equipo aprobado. Un equipo nuevo pide registro desde su propia pantalla."
      />

      <Resumen etiqueta="Resumen de los equipos">
        <Cifra
          etiqueta="Pendientes"
          icono={<SmartphoneNfc aria-hidden="true" />}
          tono={conteos.PENDIENTES > 0 ? "warn" : "idle"}
          valor={String(conteos.PENDIENTES)}
          pie={conteos.PENDIENTES > 0 ? "Compara el código con su pantalla y apruébalo" : "Nadie espera aprobación"}
          activo={consulta.filtro === "PENDIENTES"}
          onClick={() => cambiar({ filtro: "PENDIENTES" })}
        />
        <Cifra
          etiqueta="Aprobados"
          icono={<MonitorSmartphone aria-hidden="true" />}
          valor={String(conteos.APROBADOS)}
          pie="Pueden abrir sesión con un PIN"
          activo={consulta.filtro === "APROBADOS"}
          onClick={() => cambiar({ filtro: "APROBADOS" })}
        />
        <Cifra
          etiqueta="Con sesión ahora"
          icono={<Users aria-hidden="true" />}
          tono={conteos.EN_SESION > 0 ? "ok" : "idle"}
          valor={String(conteos.EN_SESION)}
          pie={conteos.EN_SESION > 0 ? "Alguien trabaja en ellos" : "Nadie trabajando"}
          activo={consulta.filtro === "EN_SESION"}
          onClick={() => cambiar({ filtro: "EN_SESION" })}
        />
        <Cifra
          etiqueta="Revocados"
          icono={<MonitorX aria-hidden="true" />}
          valor={String(conteos.REVOCADOS)}
          pie="No se borran: sus sesiones los nombran"
          activo={consulta.filtro === "REVOCADOS"}
          onClick={() => cambiar({ filtro: "REVOCADOS" })}
        />
      </Resumen>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
        <BarraDeFiltros
          hayFiltros={hayFiltros}
          onLimpiar={() => {
            setBusqueda("");
            cambiar({ filtro: "TODOS", busqueda: undefined });
          }}
          cuenta={hayFiltros && datos ? `${datos.total} de ${conteos.TODOS}` : undefined}
        >
          <FiltroSegmentado
            etiqueta="Estado"
            valor={consulta.filtro}
            onCambiar={(filtro) => cambiar({ filtro })}
            opciones={FILTROS.map((f) => ({ ...f, cuenta: conteos[f.id], alerta: f.id === "PENDIENTES" }))}
          />
          <form
            role="search"
            className="relative flex items-center"
            onSubmit={(e) => {
              e.preventDefault();
              cambiar({ busqueda: busqueda.trim() || undefined });
            }}
          >
            <Search size={14} className="pointer-events-none absolute left-2.5 text-ink-3" aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar un equipo por nombre o código"
              placeholder="Nombre o código"
              className={cn(CAMPO_DE_FILTRO, "w-48 pl-8")}
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                if (e.target.value === "") cambiar({ busqueda: undefined });
              }}
              onBlur={() => (busqueda.trim() || undefined) !== consulta.busqueda && cambiar({ busqueda: busqueda.trim() || undefined })}
            />
          </form>
        </BarraDeFiltros>

        <div aria-busy={cargando} className={cn("flex min-h-0 flex-1 flex-col transition-opacity", cargando && "opacity-60")}>
          {error ? (
            <div role="alert" className="rounded-[var(--radius-card)] border border-state-crit/35 bg-state-crit-bg px-4 py-6 text-center text-[13px]">
              <p className="font-semibold text-state-crit">{error}</p>
              <Button type="button" variant="neutral" surface="admin" className="mt-3" onClick={() => void releer()}>
                Volver a intentar
              </Button>
            </div>
          ) : dispositivos.length === 0 ? (
            <EmptyState
              icon={<MonitorSmartphone size={20} />}
              title={hayFiltros ? "Ningún equipo con estos filtros" : "Todavía no hay equipos"}
              hint={hayFiltros ? "Cambia o limpia los filtros." : "Un equipo nuevo pide registro desde la pantalla de acceso, y aquí se aprueba."}
            />
          ) : (
            <>
              <div className="hidden min-h-0 flex-1 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card lg:block">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-surface-2">
                    <tr>
                      <th className={TH}>Equipo</th>
                      <th className={TH}>Estado</th>
                      <th className={cn(TH, "w-full")}>Ahora</th>
                      <th className={TH}>Registrado</th>
                      <th className={TH}>
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispositivos.map((d) => (
                      <tr key={d.id} className={cn("border-t border-line", d.status === "REVOCADO" && "text-ink-3")}>
                        <td className={cn(TD, "max-w-[16rem] font-semibold whitespace-nowrap text-ink")}>
                          <span className="block truncate" title={d.label}>
                            {d.label}
                          </span>
                        </td>
                        <td className={TD}>{estado(d)}</td>
                        <td className={cn(TD, "max-w-0 truncate")}>{detalle(d)}</td>
                        <td className={cn(TD, "tnum whitespace-nowrap text-ink-2")}>{reloj.diaConAnio(Date.parse(d.registeredAt))}</td>
                        <td className={cn(TD, "py-1")}>{acciones(d, "admin")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col gap-2 md:min-h-0 md:flex-1 md:overflow-y-auto lg:hidden">
                {dispositivos.map((d) => (
                  <li key={d.id} className={cn("shrink-0 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card", d.status === "REVOCADO" && "opacity-75")}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-ink">{d.label}</span>
                        <span className="tnum block text-[12px] text-ink-3">Registrado {reloj.diaConAnio(Date.parse(d.registeredAt))}</span>
                      </span>
                      <span className="shrink-0 text-[12.5px]">{estado(d)}</span>
                    </div>
                    <p className="mt-1.5 text-[12.5px]">{detalle(d)}</p>
                    <div className="mt-2 border-t border-line pt-2">{acciones(d, "tablet")}</div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {!error && datos && datos.total > 0 && (
          <Paginacion
            etiqueta="Páginas de los equipos"
            pagina={consulta.pagina}
            porPagina={consulta.porPagina}
            opciones={POR_PAGINA}
            total={datos.total}
            cargando={cargando}
            onCambiar={(c) => cambiar(c)}
          />
        )}
      </div>

      <Sheet abierto={historia !== null} onCerrar={() => setHistoria(null)} titulo={historia ? `Historia · ${historia.label}` : "Historia"} descripcion="Lo que le ha pasado a este equipo, de lo más reciente a lo más antiguo. Nada se borra.">
        {historia && (
          <ul className="flex flex-col divide-y divide-line">
            {historia.changes.map((c, i) => (
              <li key={i} className="flex flex-col gap-0.5 py-2.5 text-[13px]">
                <span className="font-semibold text-ink">
                  {c.kind === "ALTA" ? "Pidió registro" : c.kind === "RENOVADO" ? "Renovó la solicitud" : c.kind === "APROBADO" ? "Aprobado" : c.kind === "REVOCADO" ? "Revocado" : `Renombrado a «${c.label}»`}
                </span>
                <span className="text-ink-2">«{c.reason}»</span>
                <span className="tnum text-[12px] text-ink-3">
                  {c.byName} · {reloj.diaConAnio(Date.parse(c.at))} {reloj.hora(Date.parse(c.at))}
                </span>
              </li>
            ))}
            {historia.changes.length === 0 && <li className="py-3 text-[13px] text-ink-3">Sin cambios registrados.</li>}
          </ul>
        )}
      </Sheet>

      <DialogoDispositivo
        orden={orden}
        autor={autor}
        onCerrar={() => setOrden(null)}
        onAplicar={async (cmd) => {
          // El error vuelve como texto y el diálogo se queda abierto con lo escrito.
          const e = await aplicar(cmd);
          if (e) return e;
          avisar.ok(cmd.kind === "APROBAR" ? "Equipo aprobado" : cmd.kind === "REVOCAR" ? "Equipo revocado: sus sesiones se cerraron" : "Equipo renombrado");
          setOrden(null);
          return null;
        }}
      />
    </Container>
  );
}

const TEXTO_DIALOGO = {
  APROBAR: {
    titulo: "Aprobar dispositivo",
    desc: "Podrá abrir sesión con PIN desde este equipo. Comprueba antes que su pantalla enseña este mismo código.",
    boton: "Aprobar",
  },
  REVOCAR: {
    titulo: "Revocar dispositivo",
    desc: "Dejará de poder abrir sesión y la que tenga abierta se cierra. No se borra: para volver, se registra de nuevo.",
    boton: "Sí, revocar",
  },
  RENOMBRAR: {
    titulo: "Renombrar dispositivo",
    desc: "Cambia el nombre que se ve en el acceso, en esta lista y en la auditoría.",
    boton: "Renombrar",
  },
} as const;

/** Aprobar, revocar o renombrar: qué se hace, sobre qué equipo y por qué (el motivo queda en su historia). */
function DialogoDispositivo({
  orden,
  autor,
  onCerrar,
  onAplicar,
}: {
  orden: Orden | null;
  autor: { id: string; nombre: string } | null;
  onCerrar: () => void;
  onAplicar: (cmd: DeviceCommand) => Promise<string | null>;
}) {
  const [motivo, setMotivo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  // Cada orden abre el formulario limpio. Derivado en el render, sin efecto.
  const clave = orden ? `${orden.kind}:${orden.dev.id}` : null;
  if (clave !== para) {
    setPara(clave);
    setMotivo("");
    setNuevoNombre(orden?.kind === "RENOMBRAR" ? orden.dev.label : "");
    setError(null);
  }
  if (!orden || !autor) return null;
  const t = TEXTO_DIALOGO[orden.kind];

  const enviar = async (cmd: DeviceCommand) => {
    setGuardando(true);
    setError(await onAplicar(cmd));
    setGuardando(false);
  };
  const confirmar = () => {
    const reason = motivo.trim();
    if (reason.length < 10) return setError("Explica el motivo en al menos 10 caracteres.");
    if (orden.kind === "RENOMBRAR") {
      const label = nuevoNombre.trim();
      if (label.length < 2) return setError("El nombre debe tener al menos 2 caracteres.");
      return void enviar({ kind: "RENOMBRAR", deviceId: orden.dev.id, label, reason });
    }
    void enviar({ kind: orden.kind, deviceId: orden.dev.id, reason });
  };

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={t.titulo}
      descripcion={t.desc}
      pie={
        <div className="flex justify-end gap-2">
          <Button surface="admin" variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="admin" variant={orden.kind === "REVOCAR" ? "danger" : "primary"} onClick={confirmar} disabled={guardando}>
            {guardando ? "Guardando…" : t.boton}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line bg-base/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-ink">
          {orden.dev.label}
          {orden.kind === "APROBAR" && (
            <span className="tnum font-mono text-[15px] tracking-[0.12em]" aria-label={`Código ${orden.dev.pairingCode}`}>
              {orden.dev.pairingCode}
            </span>
          )}
        </p>
        {orden.kind === "RENOMBRAR" && (
          <Input
            surface="admin"
            label="Nuevo nombre"
            value={nuevoNombre}
            maxLength={40}
            onChange={(e) => {
              setNuevoNombre(e.target.value);
              setError(null);
            }}
            placeholder="Ej. Tablet taquilla"
          />
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="motivo-dispositivo" className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">
            Motivo
          </label>
          <textarea
            id="motivo-dispositivo"
            rows={3}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            placeholder="Por qué se hace este cambio"
            className={cn(
              "w-full resize-none rounded-[var(--radius-control)] border bg-base px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-brand",
              error ? "border-state-crit" : "border-line",
            )}
          />
          {error ? (
            <p role="alert" className="text-[12.5px] text-state-crit">
              {error}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Queda en la historia del equipo y en la auditoría.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** Una solicitud pendiente que pasó su plazo (M-7): ya no se aprueba; el equipo la renueva. */
function caducada(dev: DeviceDto): boolean {
  return dev.status === "PENDIENTE" && dev.requestExpiresAt !== undefined && Date.parse(dev.requestExpiresAt) <= Date.now();
}
