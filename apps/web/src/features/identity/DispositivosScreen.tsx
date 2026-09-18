"use client";

import { useState } from "react";
import { Ban, CircleCheckBig, Clock, KeyRound, MonitorSmartphone, MonitorX, Pencil, SmartphoneNfc } from "lucide-react";
import { type DeviceCommand, type DeviceDto } from "@l2/contracts";
import { Button, Container, Dialog, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useDispositivos } from "./DispositivosProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * Dispositivos del local (F2-02, ADR-013).
 */

const FECHA = new Intl.DateTimeFormat("es-VE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * La hora sale de `formatClock`, que es la que usa todo el producto: 12 o 24
 * horas según los ajustes de la sucursal, y en 12 h con el indicador en
 * minúsculas y sin puntos («6:00 am»), como pide el repositorio.
 */

const ESTADOS = {
  APROBADO: { texto: "Aprobado", clase: "text-state-ok", bg: "bg-state-ok-bg", Icono: CircleCheckBig },
  PENDIENTE: { texto: "Pendiente", clase: "text-state-warn", bg: "bg-state-warn-bg", Icono: KeyRound },
  REVOCADO: { texto: "Revocado", clase: "text-state-crit", bg: "bg-state-crit-bg", Icono: Ban },
} as const;

export function DispositivosScreen({
  autor,
  puedeGestionar,
}: {
  autor: { id: string; nombre: string };
  puedeGestionar: boolean;
}) {
  const { dispositivos, aplicar } = useDispositivos();
  
  const [comando, setComando] = useState<{ kind: "APROBAR" | "REVOCAR" | "RENOMBRAR"; dev: DeviceDto } | null>(null);

  // Ordenamos: aprobados y pendientes arriba, revocados al final.
  const lista = [...dispositivos.devices].sort((a, b) => {
    if (a.status === "REVOCADO" && b.status !== "REVOCADO") return 1;
    if (a.status !== "REVOCADO" && b.status === "REVOCADO") return -1;
    return new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime();
  });

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[
          { texto: "Abby Kingdom", href: "/panel" },
          { texto: "Personas", href: "/panel/personas" },
          { texto: "Dispositivos" },
        ]}
        titulo="Dispositivos"
        descripcion="El dispositivo es el primer factor de acceso. El PIN solo abre sesión en un equipo aprobado."
      />

      <div className="mt-8 flex flex-col gap-4">
        {lista.map((dev) => (
          <DispositivoCard
            key={dev.id}
            dev={dev}
            puedeGestionar={puedeGestionar}
            onAction={(kind) => setComando({ kind, dev })}
          />
        ))}
        {lista.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line p-8 text-center text-sm text-ink-3">
            No hay dispositivos registrados en esta sucursal.
          </div>
        )}
      </div>

      <DialogoDispositivo
        comando={comando}
        autor={autor}
        onCerrar={() => setComando(null)}
        onAplicar={(cmd) => {
          // El error vuelve como texto y el diálogo se queda abierto con lo
          // escrito: reescribir el motivo por un nombre repetido es peor que
          // el error.
          const error = aplicar(cmd, autor);
          if (error) return error;
          avisar.ok("Cambio guardado");
          setComando(null);
          return null;
        }}
      />
    </Container>
  );
}

function DispositivoCard({
  dev,
  puedeGestionar,
  onAction,
}: {
  dev: DeviceDto;
  puedeGestionar: boolean;
  onAction: (kind: "APROBAR" | "REVOCAR" | "RENOMBRAR") => void;
}) {
  const [verHistoria, setVerHistoria] = useState(false);
  const est = ESTADOS[dev.status];
  // La hora se pinta con el formato publicado en los ajustes del local (F5-08b).
  const { ajustes } = useSucursal();

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card",
        dev.status === "REVOCADO" && "opacity-60 grayscale-[0.3]"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-line",
              est.bg
            )}
          >
            {dev.status === "REVOCADO" ? (
              <MonitorX size={20} className={est.clase} aria-hidden="true" />
            ) : dev.status === "PENDIENTE" ? (
              <SmartphoneNfc size={20} className={est.clase} aria-hidden="true" />
            ) : (
              <MonitorSmartphone size={20} className={est.clase} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-display truncate text-base font-bold text-ink">{dev.label}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className={cn("flex items-center gap-1 font-medium", est.clase)}>
                <est.Icono size={12} aria-hidden="true" />
                {est.texto}
              </span>
              <span className="text-ink-3" aria-hidden="true">·</span>
              <span className="text-ink-2 tnum">Registrado {FECHA.format(new Date(dev.registeredAt))}</span>
              {dev.status === "REVOCADO" && (
                <>
                  <span className="text-ink-3" aria-hidden="true">·</span>
                  <span className="text-ink-3">Debe registrarse de nuevo para reingresar.</span>
                </>
              )}
            </div>
            {dev.session && dev.status !== "REVOCADO" && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <span className="flex size-4 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <span className="size-1.5 rounded-full bg-brand" />
                </span>
                Sesión abierta: <strong className="font-medium">{dev.session.userName}</strong>
                <span className="tnum text-ink-3">desde {formatClock(Date.parse(dev.session.since), ajustes.formatoHora)}</span>
              </p>
            )}
          </div>
        </div>

        {puedeGestionar && (
          <div className="flex flex-wrap gap-1.5">
            <Accion onClick={() => onAction("RENOMBRAR")}>
              <Pencil size={13} aria-hidden="true" />
              Renombrar
            </Accion>
            {dev.status === "PENDIENTE" && (
              <Accion onClick={() => onAction("APROBAR")} destacado>
                <CircleCheckBig size={13} aria-hidden="true" />
                Aprobar
              </Accion>
            )}
            {dev.status === "APROBADO" && (
              <Accion onClick={() => onAction("REVOCAR")} peligro>
                <Ban size={13} aria-hidden="true" />
                Revocar
              </Accion>
            )}
          </div>
        )}
      </div>

      {dev.changes.length > 0 && (
        <div className="mt-1 border-t border-line/40 pt-3">
          <button
            type="button"
            onClick={() => setVerHistoria((v) => !v)}
            className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-1 text-[12px] font-medium text-ink-3 hover:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Clock size={12} aria-hidden="true" />
            {verHistoria ? "Ocultar historia" : "Ver historia"}
          </button>
          
          {verHistoria && (
            <ul className="mt-3 flex flex-col gap-2.5">
              {dev.changes.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
                  <span className="font-semibold text-ink">
                    {c.kind === "ALTA" ? "Registrado" : c.kind === "APROBADO" ? "Aprobado" : c.kind === "REVOCADO" ? "Revocado" : "Renombrado"}
                  </span>
                  {c.kind === "RENOMBRADO" && <span className="text-ink-2">a «{c.label}»</span>}
                  <span className="text-ink-2">«{c.reason}»</span>
                  <span className="tnum ml-auto text-[11px] text-ink-3">
                    {c.byName} · {FECHA.format(new Date(c.at))} {formatClock(Date.parse(c.at), ajustes.formatoHora)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Accion({
  destacado,
  peligro,
  onClick,
  children,
}: {
  destacado?: boolean;
  peligro?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-[12px] font-medium",
        "transition-colors duration-[var(--dur-rapida)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        destacado
          ? "border-brand bg-brand/10 text-brand hover:bg-brand/20"
          : peligro
            ? "border-state-crit/40 text-state-crit hover:border-state-crit hover:bg-state-crit-bg/40"
            : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

const TEXTO_DIALOGO = {
  APROBAR: {
    titulo: "Aprobar dispositivo",
    desc: "Permitirá abrir sesión con PIN desde este equipo.",
    boton: "Aprobar",
  },
  REVOCAR: {
    titulo: "Revocar dispositivo",
    desc: "Dejará de poder abrir sesión. Cualquier sesión actual se cerrará.",
    boton: "Revocar",
  },
  RENOMBRAR: {
    titulo: "Renombrar dispositivo",
    desc: "Cambia el nombre visible del equipo.",
    boton: "Renombrar",
  },
} as const;

function DialogoDispositivo({
  comando,
  autor,
  onCerrar,
  onAplicar,
}: {
  comando: { kind: "APROBAR" | "REVOCAR" | "RENOMBRAR"; dev: DeviceDto } | null;
  autor: { id: string; nombre: string } | null;
  onCerrar: () => void;
  onAplicar: (cmd: DeviceCommand) => string | null;
}) {
  const [motivo, setMotivo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!comando || !autor) return null;
  const t = TEXTO_DIALOGO[comando.kind];

  const confirmar = () => {
    const reason = motivo.trim();
    if (reason.length < 10) {
      setError("Explica el motivo en al menos 10 caracteres.");
      return;
    }

    if (comando.kind === "RENOMBRAR") {
      const label = nuevoNombre.trim();
      if (label.length < 2) {
        setError("El nombre debe tener al menos 2 caracteres.");
        return;
      }
      setError(onAplicar({ kind: "RENOMBRAR", deviceId: comando.dev.id, label, reason }));
      return;
    }

    setError(onAplicar({ kind: comando.kind, deviceId: comando.dev.id, reason }));
  };

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={t.titulo}
      descripcion={t.desc}
      pie={
        <div className="flex gap-2">
          <Button surface="tablet" variant="ghost" onClick={onCerrar} className="flex-1">
            Cancelar
          </Button>
          <Button
            surface="tablet"
            variant={comando.kind === "REVOCAR" ? "danger" : "primary"}
            onClick={confirmar}
            className="flex-1"
          >
            {t.boton}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-[var(--radius-control)] border border-line bg-base/50 px-3.5 py-2.5 text-[13.5px] font-semibold text-ink">
          {comando.dev.label}
        </p>

        {comando.kind === "RENOMBRAR" && (
          <Input
            surface="tablet"
            label="Nuevo nombre"
            value={nuevoNombre}
            onChange={(e) => {
              setNuevoNombre(e.target.value);
              setError(null);
            }}
            placeholder="Ej. Tablet taquilla"
            autoFocus
          />
        )}

        {comando.kind === "REVOCAR" && (
          <p className="rounded-[var(--radius-control)] border border-state-crit/30 bg-state-crit-bg/40 px-3.5 py-2.5 text-[12.5px] text-state-crit">
            <strong>Advertencia:</strong> Este equipo ya no podrá abrir el acceso, ni siquiera con un PIN válido.
          </p>
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
              "w-full resize-none rounded-[var(--radius-control)] border bg-base px-3 py-2.5 text-sm text-ink outline-none",
              "placeholder:text-ink-3 focus:border-brand",
              error ? "border-state-crit" : "border-line"
            )}
            autoFocus={comando.kind !== "RENOMBRAR"}
          />
          {error ? (
            <p role="alert" className="text-[12.5px] text-state-crit">
              {error}
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-3">Queda en la auditoría.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
