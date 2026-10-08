"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, RefreshCw, RotateCcw, ShieldAlert, Sparkles, TriangleAlert, X } from "lucide-react";
import type { ActualizacionDto, EstadoDelSistemaDto, Resultado, VersionDisponibleDto } from "@l2/contracts";
import { Button, Confirmacion, Container, avisar, cn } from "@l2/ui";
import { EncabezadoDePagina } from "../shell/MarcoDeSeccion.tsx";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { cancelarActualizacion, pedirActualizacion } from "./sistema.acciones";

/**
 * Ajustes → Sistema → Versión y actualizaciones (T-8b, ADR-028). La versión en marcha, las nuevas con sus
 * novedades (las del CHANGELOG) y la decisión de administración: «Actualizar ahora» (solo sin turnos
 * abiertos ni niños en sala), «Esta noche al cierre» o dejarlo para más tarde. La web solo pide: la pone
 * el actualizador del servidor, con respaldo, y si la versión nueva no queda sana vuelve sola a la anterior
 * y aquí se ve. En staging no se pide nada: se pone al día solo con cada versión publicada.
 */

type Cuando = "AHORA" | "AL_CIERRE";

const ESTADO: Readonly<Record<ActualizacionDto["estado"], { texto: string; icono: typeof CheckCircle2; clase: string }>> = {
  PEDIDA: { texto: "Esperando su momento", icono: Clock, clase: "text-ink-2" },
  EN_CURSO: { texto: "Poniéndose", icono: Loader2, clase: "text-brand" },
  HECHA: { texto: "Puesta", icono: CheckCircle2, clase: "text-state-ok" },
  VUELTA_ATRAS: { texto: "Volvió a la anterior", icono: RotateCcw, clase: "text-state-warn" },
  FALLIDA: { texto: "No se pudo poner", icono: AlertTriangle, clase: "text-state-crit" },
  CANCELADA: { texto: "Cancelada", icono: X, clase: "text-ink-3" },
};

export function SistemaScreen({ estado: inicial }: { estado: Resultado<EstadoDelSistemaDto> }) {
  const router = useRouter();
  const { ajustes } = useSucursal();
  const conElevacion = useConElevacion();
  const [estado, setEstado] = useState(inicial.ok ? inicial.valor : null);
  const huella = JSON.stringify(inicial);
  useEffect(() => setEstado(inicial.ok ? inicial.valor : null), [huella]);
  // Lo que escribe el actualizador del servidor (en curso, puesta, vuelta atrás) llega en vivo.
  useAlCambiar(["sistema"], () => router.refresh());
  const [confirmar, setConfirmar] = useState<{ version: string; cuando: Cuando } | null>(null);
  // Lo último que se confirmó sigue escrito mientras el diálogo se cierra.
  const ultima = useRef<{ version: string; cuando: Cuando }>({ version: "", cuando: "AHORA" });
  if (confirmar) ultima.current = confirmar;
  const enDialogo = ultima.current;
  const [ocupado, setOcupado] = useState(false);

  if (!inicial.ok || !estado) {
    return (
      <Container ancho="panel" className="py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {inicial.ok ? "No se pudo leer el sistema." : inicial.mensaje}
        </p>
      </Container>
    );
  }

  const nueva = estado.disponibles[0] ?? null;
  const ocupadoAhora = estado.ocupado.turnosAbiertos > 0 || estado.ocupado.ninosEnSala > 0;
  const motivoOcupado = [
    estado.ocupado.turnosAbiertos > 0 ? `${estado.ocupado.turnosAbiertos} ${estado.ocupado.turnosAbiertos === 1 ? "turno abierto" : "turnos abiertos"}` : null,
    estado.ocupado.ninosEnSala > 0 ? `${estado.ocupado.ninosEnSala} ${estado.ocupado.ninosEnSala === 1 ? "niño en sala" : "niños en sala"}` : null,
  ]
    .filter(Boolean)
    .join(" y ");

  async function pedir() {
    if (!confirmar) return;
    setOcupado(true);
    try {
      const r = await conElevacion(() => pedirActualizacion(confirmar));
      if (!r.ok) return avisar.error(r.mensaje);
      setEstado(r.valor);
      avisar.ok(
        confirmar.cuando === "AHORA" ? `La ${confirmar.version} se pone en un momento` : `La ${confirmar.version} se pondrá sola al cierre`,
        { detalle: "Las pantallas abiertas se ponen al día solas cuando estén libres." },
      );
    } catch {
      avisar.error("El servidor no respondió. No se pidió nada.");
    } finally {
      setOcupado(false);
      setConfirmar(null);
    }
  }

  async function cancelar(id: string) {
    setOcupado(true);
    try {
      const r = await conElevacion(() => cancelarActualizacion({ id }));
      if (!r.ok) return avisar.error(r.mensaje);
      setEstado(r.valor);
      avisar.ok("Actualización cancelada");
    } catch {
      avisar.error("El servidor no respondió. Sigue pedida.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Container ancho="panel" className="py-8">
      <EncabezadoDePagina
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Versión y actualizaciones" }]}
        titulo="Versión y actualizaciones"
        descripcion="La versión en marcha y las nuevas, con lo que traen. Si una versión no queda sana al ponerla, el servidor vuelve solo a la anterior."
      />

      <section aria-label="Resumen" className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-3">
        <Cifra titulo="En marcha" valor={`v${estado.enMarcha}`} detalle={estado.automatico ? "Staging: se pone al día solo" : "Producción: decide administración"} />
        <Cifra
          titulo="Disponible"
          valor={nueva ? `v${nueva.version}` : "Al día"}
          detalle={nueva ? (estado.disponibles.length > 1 ? `y ${estado.disponibles.length - 1} anterior${estado.disponibles.length > 2 ? "es" : ""}` : "Nueva") : "No hay versiones más nuevas"}
          tono={nueva ? (nueva.urgente ? "crit" : "brand") : "ok"}
        />
        <Cifra
          titulo="Ahora mismo"
          valor={ocupadoAhora ? "Con operación" : "Sin operación"}
          detalle={ocupadoAhora ? motivoOcupado : "Se puede actualizar ya"}
          tono={ocupadoAhora ? "warn" : "ok"}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {estado.pendiente && <Pendiente pendiente={estado.pendiente} ocupado={ocupado} automatico={estado.automatico} onCancelar={() => void cancelar(estado.pendiente!.id)} />}

      {nueva && !estado.pendiente && (
        <section aria-labelledby="nueva" className="mb-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={17} className="text-brand" aria-hidden="true" />
            <h2 id="nueva" className="font-display text-base font-bold text-ink">
              Hay una versión nueva: v{nueva.version}
            </h2>
            {nueva.urgente && (
              <span className="flex items-center gap-1 rounded-full bg-state-crit-bg px-2 py-0.5 text-[11.5px] font-semibold text-state-crit">
                <ShieldAlert size={12} aria-hidden="true" />
                Urgente
              </span>
            )}
          </div>
          {estado.automatico ? (
            <p className="mt-2 text-[13px] text-ink-2">
              {estado.historial.some((a) => a.version === nueva.version && (a.estado === "VUELTA_ATRAS" || a.estado === "FALLIDA"))
                ? `La v${nueva.version} ya se intentó y no quedó sana: no se vuelve a poner sola. Se pondrá la siguiente versión que se publique.`
                : "Este servidor se pone al día solo: la pone en un par de minutos, sin que nadie la pida."}
            </p>
          ) : (
            <>
              <p className="mt-2 text-[13px] text-ink-2">
                Se hace un respaldo, se pone la versión y se comprueba que quede sana; si no, vuelve sola a la v{estado.enMarcha}. El sistema
                no responde unos segundos y cada pantalla se pone al día sola cuando esté libre.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button type="button" variant="primary" surface="admin" className="gap-1.5" disabled={ocupadoAhora || ocupado} onClick={() => setConfirmar({ version: nueva.version, cuando: "AHORA" })}>
                  <RefreshCw size={15} aria-hidden="true" />
                  Actualizar ahora
                </Button>
                <Button type="button" variant="neutral" surface="admin" className="gap-1.5" disabled={ocupado} onClick={() => setConfirmar({ version: nueva.version, cuando: "AL_CIERRE" })}>
                  <Clock size={15} aria-hidden="true" />
                  Esta noche al cierre
                </Button>
                {ocupadoAhora && <span className="text-[12.5px] text-state-warn">Ahora no: {motivoOcupado}.</span>}
              </div>
              <p className="mt-2 text-[12px] text-ink-3">¿Más tarde? No hace falta hacer nada: la versión sigue aquí hasta que la pidas.</p>
            </>
          )}
        </section>
      )}

      {estado.disponibles.length > 0 && (
        <section aria-label="Novedades" className="mb-4 flex flex-col gap-3">
          {estado.disponibles.map((v) => (
            <Novedades key={v.version} version={v} />
          ))}
        </section>
      )}

      <Historial historial={estado.historial} />

      <Confirmacion
        abierto={confirmar !== null}
        onCerrar={() => setConfirmar(null)}
        titulo={enDialogo.cuando === "AHORA" ? `Poner la v${enDialogo.version} ahora` : `Poner la v${enDialogo.version} al cierre`}
        confirmar={enDialogo.cuando === "AHORA" ? "Sí, ahora" : "Sí, al cierre"}
        onConfirmar={() => void pedir()}
        ocupado={ocupado}
      >
        {enDialogo.cuando === "AHORA"
          ? "Se pone en un minuto: respaldo, versión nueva y comprobación. El sistema no responde unos segundos; si algo sale mal, vuelve solo a la versión de ahora."
          : "Se pondrá sola en cuanto no quede ningún turno abierto ni niños en sala (normalmente al cerrar el día). Hasta entonces se puede cancelar."}
      </Confirmacion>
    </Container>
  );
}

function Cifra({ titulo, valor, detalle, tono, className }: { titulo: string; valor: string; detalle: string; tono?: "ok" | "warn" | "crit" | "brand"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 bg-surface px-4 py-3", className)}>
      <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">{titulo}</span>
      <span
        className={cn(
          "tnum font-display text-[20px] leading-tight font-bold",
          tono === "ok" ? "text-state-ok" : tono === "warn" ? "text-state-warn" : tono === "crit" ? "text-state-crit" : tono === "brand" ? "text-brand" : "text-ink",
        )}
      >
        {valor}
      </span>
      <span className="truncate text-[12px] text-ink-3">{detalle}</span>
    </div>
  );
}

function Pendiente({ pendiente: p, ocupado, automatico, onCancelar }: { pendiente: ActualizacionDto; ocupado: boolean; automatico: boolean; onCancelar: () => void }) {
  const reloj = useReloj();
  const e = ESTADO[p.estado];
  const Icono = e.icono;
  return (
    <section aria-label="Actualización pedida" className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-brand/40 bg-surface p-4 shadow-card">
      <Icono size={18} className={cn("shrink-0", e.clase, p.estado === "EN_CURSO" && "animate-spin")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ink">
          v{p.version} · {e.texto}
        </p>
        <p className="tnum text-[12.5px] text-ink-2">
          {p.estado === "EN_CURSO"
            ? "Respaldo, versión nueva y comprobación. Esta pantalla se pone al día sola al terminar."
            : p.modo === "AL_CIERRE"
              ? "Se pondrá sola en cuanto no quede ningún turno abierto ni niños en sala."
              : p.modo === "AUTOMATICA"
                ? "Staging: entra sola en un momento."
                : "Entra en un momento."}{" "}
          {p.pedidaPor && `Pedida por ${p.pedidaPor} el ${reloj.dia(Date.parse(p.pedidaEn))} a las ${reloj.hora(Date.parse(p.pedidaEn))}.`}
        </p>
      </div>
      {p.estado === "PEDIDA" && !automatico && (
        <Button type="button" variant="ghost" surface="admin" className="gap-1.5" disabled={ocupado} onClick={onCancelar}>
          <X size={14} aria-hidden="true" />
          Cancelar
        </Button>
      )}
    </section>
  );
}

type Bloque = { tipo: "titulo" | "vineta" | "parrafo"; texto: string };

/**
 * Las novedades como las cuenta el CHANGELOG: títulos «###», viñetas «- » y párrafos, sin interpretar nada
 * más. Las líneas que siguen a una viñeta o a un párrafo (partidas a mano en el archivo) se juntan.
 */
function bloques(novedades: string): readonly Bloque[] {
  const salida: Bloque[] = [];
  let abierto: Bloque | null = null;
  for (const l of novedades.split(/\r?\n/)) {
    const t = l.trim();
    // El encabezado «## [0.58.0] — fecha» ya lo dice el resumen.
    if (t === "" || t.startsWith("## ")) abierto = null;
    else if (t.startsWith("### ")) {
      salida.push({ tipo: "titulo", texto: t.slice(4) });
      abierto = null;
    } else if (t.startsWith("- ")) {
      abierto = { tipo: "vineta", texto: t.slice(2) };
      salida.push(abierto);
    } else if (abierto) abierto.texto += ` ${t}`;
    else {
      abierto = { tipo: "parrafo", texto: t };
      salida.push(abierto);
    }
  }
  return salida;
}

function Novedades({ version: v }: { version: VersionDisponibleDto }) {
  const reloj = useReloj();
  return (
    <details className="group rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[13.5px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand">
        <CircleDashed size={14} className="text-ink-3" aria-hidden="true" />
        Qué trae la v{v.version}
        <span className="tnum ml-auto text-[12px] font-normal text-ink-3">publicada el {reloj.diaConAnio(Date.parse(v.publicadaEn))}</span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-line px-4 py-3 text-[13px] text-ink-2">
        {bloques(v.novedades).map((b, i) =>
          b.tipo === "titulo" ? (
            <p key={i} className="mt-2 text-[12px] font-semibold tracking-[0.06em] text-ink uppercase">
              {b.texto}
            </p>
          ) : (
            <p key={i} className={cn("max-w-[80ch]", b.tipo === "vineta" && "pl-3 -indent-3")}>
              {b.tipo === "vineta" && "• "}
              {sinMarcas(b.texto)}
            </p>
          ),
        )}
      </div>
    </details>
  );
}

/** Quita la negrita y el código de Markdown: se leen como texto. */
const sinMarcas = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");

function Historial({ historial }: { historial: readonly ActualizacionDto[] }) {
  const reloj = useReloj();
  if (historial.length === 0) return null;
  return (
    <section aria-labelledby="historial" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
      <h2 id="historial" className="mb-2 font-display text-base font-bold text-ink">
        Lo último
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {historial.map((a) => {
          const e = ESTADO[a.estado];
          const Icono = e.icono;
          const cuando = Date.parse(a.terminadaEn ?? a.pedidaEn);
          return (
            <li key={a.id} className="flex flex-col gap-0.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Icono size={14} className={cn("shrink-0", e.clase)} aria-hidden="true" />
                <span className="text-[13.5px] font-semibold text-ink">v{a.version}</span>
                <span className={cn("text-[12.5px] font-semibold", e.clase)}>{e.texto}</span>
                <span className="tnum ml-auto text-[12px] text-ink-3">
                  {reloj.dia(cuando)} · {reloj.hora(cuando)}
                </span>
              </div>
              <p className="text-[12px] text-ink-3">
                {a.modo === "AUTOMATICA" ? "Sola (staging)" : `${a.modo === "AHORA" ? "Ahora" : "Al cierre"}, pedida por ${a.pedidaPor ?? "—"}`}
                {a.desde && ` · desde la v${a.desde}`}
                {a.detalle && ` · ${a.detalle}`}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
