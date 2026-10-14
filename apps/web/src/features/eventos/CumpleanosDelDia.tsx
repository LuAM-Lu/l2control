"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, Cake, Clock, Users } from "lucide-react";
import type { AgendaEventosDto, Rechazo, ReservaEventoDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { startOfDay } from "@l2/domain-rates";
import { Badge, Button, Dialog, Marquesina, avisar, cn } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { cuentasDeLaMesa } from "../mesas/mesas.ts";
import { usePlano } from "../mesas/PlanoProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { empezarEvento, leerCumpleanosDeLaSemana, sentarEvento } from "./eventos.acciones";
import { ESTADO, ICONO_ESTADO, fechaCorta, horaDelDia, horario } from "./formato.ts";

/**
 * El cumpleaños en la caja, el parque y el salón — B10-5 (M-39, X-13).
 *
 * La caja y el parque ven el cumpleaños de hoy (la hora, los invitados reservados y cuántos entraron) y, en su detalle,
 * los de la semana con el anticipo cobrado o no. El parque avisa 30 minutos antes de que empiece. Al empezar, el
 * cumpleaños toma una mesa libre del plano: el mesero pide a su cuenta y la caja cobra el saldo y lo extra juntos.
 */

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se hizo nada." };
/** Los de hoy que siguen en pie: con el anticipo por cobrar, confirmados, en curso o saldados (hasta su fin). */
const EN_PIE = new Set<ReservaEventoDto["estado"]>(["ANTICIPO_POR_COBRAR", "CONFIRMADA", "EN_CURSO", "SALDADA"]);
const AVISO_ANTES_MIN = 30;
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Los cumpleaños de hoy y de los próximos seis días, releídos cuando cambian los cumpleaños, la sala o las cuentas. */
export function useCumpleanosDeLaSemana() {
  const [agenda, setAgenda] = useState<AgendaEventosDto | null>(null);
  const leer = useCallback(() => {
    void leerCumpleanosDeLaSemana()
      .then((r) => r.ok && setAgenda(r.valor))
      .catch(() => undefined);
  }, []);
  useEffect(() => leer(), [leer]);
  useAlCambiar(["eventos", "sala", "cuentas"], leer);
  return { agenda, leer };
}

/** El minuto del día del local ahora, con el reloj del equipo; antes del primer tic, el que dijo el servidor. */
function useMinutoDelLocal(agenda: AgendaEventosDto | null): number {
  const ahora = useAhoraLocal();
  const { zonaHoraria } = useSucursal().ajustes;
  if (!agenda) return 0;
  return ahora > 0 ? Math.floor((ahora - startOfDay(agenda.hoy, zonaHoraria)) / 60_000) : agenda.ahora;
}

/** ¿Puede esta persona sentar un cumpleaños (quien reserva o quien atiende el salón)? ¿Y empezarlo (quien reserva)? */
function usePuede() {
  const actor = useActorEnSesion();
  const reserva = actor ? can(actor, "evento.reservar") !== "DENEGADO" : false;
  const salon = actor ? can(actor, "pedido.tomar") !== "DENEGADO" : false;
  return { empezar: reserva, sentar: reserva || salon };
}

/**
 * El cumpleaños de hoy en la cabecera de la caja o del parque: el próximo (o el que está en curso), con su hora y cuántos
 * invitados entraron. Toca para ver el detalle de hoy y de la semana. Sin cumpleaños en la semana, nada.
 */
export function CumpleanosDeHoy({ avisarAntes = false, className }: { /** El parque avisa 30 minutos antes. */ avisarAntes?: boolean; className?: string }) {
  const { agenda } = useCumpleanosDeLaSemana();
  const minuto = useMinutoDelLocal(agenda);
  const { formatoHora } = useSucursal().ajustes;
  const [abierto, setAbierto] = useState(false);
  const avisados = useRef(new Set<string>());

  const deHoy = agenda ? agenda.reservas.filter((r) => r.fecha === agenda.hoy && EN_PIE.has(r.estado) && r.fin > minuto) : [];
  const semana = agenda ? agenda.reservas.filter((r) => r.fecha > agenda.hoy && r.estado !== "CANCELADA") : [];

  // El parque avisa una vez, 30 minutos antes de que empiece uno con el anticipo cobrado: desde ahí la entrada le guarda
  // el lugar a sus invitados (B10-4).
  const porEmpezar = deHoy.filter((r) => r.estado === "CONFIRMADA" && minuto >= r.inicio - AVISO_ANTES_MIN && minuto < r.inicio);
  const clavePorEmpezar = porEmpezar.map((r) => r.id).join(",");
  useEffect(() => {
    if (!avisarAntes || agenda === null) return;
    for (const r of agenda.reservas) {
      if (!clavePorEmpezar.split(",").includes(r.id) || avisados.current.has(r.id)) continue;
      avisados.current.add(r.id);
      avisar.info(`El cumpleaños de ${r.cumpleanero} empieza a las ${horaDelDia(r.inicio, formatoHora)}`, {
        detalle: `${r.invitados} invitados. Desde ahora la entrada les guarda el lugar.`,
      });
    }
  }, [avisarAntes, agenda, clavePorEmpezar, formatoHora]);

  if (!agenda || (deHoy.length === 0 && semana.length === 0)) return null;
  const r = deHoy[0] ?? null;
  const faltan = r ? r.inicio - minuto : null;
  const pronto = faltan !== null && faltan > 0 && faltan <= AVISO_ANTES_MIN;
  const tono = r ? (pronto || r.estado === "ANTICIPO_POR_COBRAR" ? "warn" : r.estado === "EN_CURSO" || r.estado === "SALDADA" ? "ok" : "brand") : "idle";

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
        title="Los cumpleaños de hoy y de la semana"
        className={cn(
          "flex min-h-12 min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1 text-left transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          tono === "warn" ? "border-state-warn/50 bg-state-warn-bg/40" : tono === "ok" ? "border-state-ok/40 bg-state-ok-bg/30" : "border-line bg-surface-2 hover:border-line-strong",
          className,
        )}
      >
        <Cake size={18} aria-hidden="true" className={cn("shrink-0", tono === "warn" ? "text-state-warn" : tono === "ok" ? "text-state-ok" : "text-brand")} />
        {r ? (
          <span className="flex min-w-0 flex-col leading-tight">
            <Marquesina className="text-cuerpo font-semibold text-ink">{`Cumpleaños de ${r.cumpleanero}`}</Marquesina>
            <span className="tnum text-detalle text-ink-2">
              {horaDelDia(r.inicio, formatoHora)}
              {pronto ? ` · en ${faltan} min` : ""} · {r.dia?.entraron ?? 0} de {r.invitados} entraron
              {r.dia?.mesa ? ` · Mesa ${r.dia.mesa.label}` : ""}
              {deHoy.length > 1 ? ` · +${deHoy.length - 1} hoy` : ""}
            </span>
          </span>
        ) : (
          <span className="text-cuerpo font-semibold text-ink-2">
            {semana.length === 1 ? "Un cumpleaños esta semana" : `${semana.length} cumpleaños esta semana`}
          </span>
        )}
      </button>
      <DetalleDeCumpleanos abierto={abierto} onCerrar={() => setAbierto(false)} agenda={agenda} minuto={minuto} />
    </>
  );
}

/** El detalle: los de hoy (con «Empezar en una mesa» o «Darle mesa») y los de la semana, con el anticipo cobrado o no. */
function DetalleDeCumpleanos({ abierto, onCerrar, agenda, minuto }: { abierto: boolean; onCerrar: () => void; agenda: AgendaEventosDto; minuto: number }) {
  const { formatoHora } = useSucursal().ajustes;
  const puede = usePuede();
  const [mesaPara, setMesaPara] = useState<{ reserva: ReservaEventoDto; modo: "EMPEZAR" | "SENTAR" } | null>(null);
  const deHoy = agenda.reservas.filter((r) => r.fecha === agenda.hoy && EN_PIE.has(r.estado));
  const semana = agenda.reservas.filter((r) => r.fecha > agenda.hoy && r.estado !== "CANCELADA");

  const fila = (r: ReservaEventoDto, conDia: boolean) => {
    const Icono = ICONO_ESTADO[r.estado];
    const estado = ESTADO[r.estado];
    const termino = r.fecha === agenda.hoy && r.fin <= minuto;
    return (
      <li key={r.id} className="flex flex-col gap-1.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-cuerpo text-ink">
            <span className="tnum font-semibold">{conDia ? `${fechaCorta(r.fecha)} · ` : ""}{horario(r.inicio, r.fin, formatoHora)}</span>
            <span className="font-semibold">Cumpleaños de {r.cumpleanero}</span>
            <Badge tone={estado.tono} icon={<Icono size={12} aria-hidden="true" />}>
              {r.estado === "CONFIRMADA" && conDia ? "Anticipo cobrado" : estado.texto}
            </Badge>
          </p>
          <p className="tnum flex flex-wrap items-center gap-x-1.5 text-detalle text-ink-2">
            <Users size={13} aria-hidden="true" />
            {r.dia ? `${r.dia.entraron} de ${r.invitados} entraron · ${r.dia.dentro} dentro` : `${r.invitados} invitados`}
            {r.dia && <span>· {r.dia.mesa ? `Mesa ${r.dia.mesa.label}` : "Sin mesa"}</span>}
            {r.estado === "ANTICIPO_POR_COBRAR" && <span>· anticipo en la caja ({orden(r.cuenta.orderNumber)})</span>}
            {termino && <span>· terminó</span>}
          </p>
        </div>
        {!conDia && !termino && r.estado === "CONFIRMADA" && puede.empezar && (
          <Button type="button" variant="primary" surface="admin" className="shrink-0 gap-1.5" onClick={() => setMesaPara({ reserva: r, modo: "EMPEZAR" })}>
            <Armchair size={15} aria-hidden="true" />
            Empezar en una mesa
          </Button>
        )}
        {!conDia && !termino && r.estado === "EN_CURSO" && !r.dia?.mesa && puede.sentar && (
          <Button type="button" variant="neutral" surface="admin" className="shrink-0 gap-1.5" onClick={() => setMesaPara({ reserva: r, modo: "SENTAR" })}>
            <Armchair size={15} aria-hidden="true" />
            Darle mesa
          </Button>
        )}
      </li>
    );
  };

  return (
    <>
      <Dialog abierto={abierto} onCerrar={onCerrar} titulo="Cumpleaños" descripcion="Los de hoy, con sus invitados y su mesa, y los de los próximos seis días.">
        <section aria-label="Hoy" className="flex flex-col gap-1.5">
          <h3 className="text-etiqueta font-semibold tracking-[0.07em] text-ink-2 uppercase">Hoy · {fechaCorta(agenda.hoy)}</h3>
          {deHoy.length === 0 ? (
            <p className="text-detalle text-ink-3">Ningún cumpleaños hoy.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">{deHoy.map((r) => fila(r, false))}</ul>
          )}
        </section>
        <section aria-label="Esta semana" className="mt-4 flex flex-col gap-1.5">
          <h3 className="text-etiqueta font-semibold tracking-[0.07em] text-ink-2 uppercase">Esta semana</h3>
          {semana.length === 0 ? (
            <p className="text-detalle text-ink-3">Ninguno más en los próximos seis días.</p>
          ) : (
            <ul className="divide-y divide-line rounded-[var(--radius-control)] border border-line">{semana.map((r) => fila(r, true))}</ul>
          )}
        </section>
      </Dialog>
      <MesaDelCumpleanos para={mesaPara} onCerrar={() => setMesaPara(null)} />
    </>
  );
}

/**
 * Elegir la mesa del cumpleaños: una libre del plano. «Empezar» abre su cuenta del día en ella (y también sin mesa, si el
 * salón no hace falta); «Sentar» se la da a uno que empezó sin mesa.
 */
export function MesaDelCumpleanos({
  para,
  onCerrar,
  onHecho,
}: {
  para: { reserva: ReservaEventoDto; modo: "EMPEZAR" | "SENTAR" } | null;
  onCerrar: () => void;
  onHecho?: (r: ReservaEventoDto) => void;
}) {
  const { plano } = usePlano();
  const { cuentas } = useCuentas();
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [de, setDe] = useState<string | null>(null);
  if ((para?.reserva.id ?? null) !== de) {
    setDe(para?.reserva.id ?? null);
    setElegida(null);
  }
  const libres = (plano?.tables ?? [])
    .filter((m) => !m.retiredAt && cuentasDeLaMesa(cuentas, m.id).length === 0)
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  const mesa = libres.find((m) => m.id === elegida) ?? null;

  async function hacer(conMesa: boolean) {
    if (!para || enviando) return;
    setEnviando(true);
    const clave = crypto.randomUUID();
    const r =
      para.modo === "EMPEZAR"
        ? await empezarEvento({ idempotencyKey: clave, reservaId: para.reserva.id, ...(conMesa && mesa ? { mesaId: mesa.id } : {}) }).catch(() => sinConexion)
        : await sentarEvento({ idempotencyKey: clave, reservaId: para.reserva.id, mesaId: mesa?.id ?? "" }).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    const enMesa = r.valor.dia?.mesa ? `en la mesa ${r.valor.dia.mesa.label}` : "sin mesa";
    avisar.ok(`Cumpleaños de ${para.reserva.cumpleanero} ${para.modo === "EMPEZAR" ? "empezado" : "sentado"} ${enMesa}`, {
      detalle: r.valor.dia?.mesa ? "El mesero pide a su cuenta; la caja cobra el saldo y lo extra juntos." : "Cuando se sienten, «Darle mesa».",
    });
    onHecho?.(r.valor);
    onCerrar();
  }

  return (
    <Dialog
      abierto={para !== null}
      onCerrar={onCerrar}
      titulo={`${para?.modo === "SENTAR" ? "Darle mesa" : "Empezar"} · Cumpleaños de ${para?.reserva.cumpleanero ?? ""}`}
      descripcion="Elige una mesa libre del plano: su cuenta es la del cumpleaños, con el saldo, lo incluido y lo que pidan."
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          {para?.modo === "EMPEZAR" && (
            <Button variant="neutral" onClick={() => void hacer(false)} disabled={enviando}>
              Empezar sin mesa
            </Button>
          )}
          <Button variant="primary" onClick={() => void hacer(true)} disabled={!mesa || enviando}>
            <Armchair size={16} aria-hidden="true" />
            {mesa ? `${para?.modo === "SENTAR" ? "Sentar" : "Empezar"} en la mesa ${mesa.label}` : "Elige la mesa"}
          </Button>
        </div>
      }
    >
      {libres.length === 0 ? (
        <p className="flex items-center gap-2 text-detalle text-ink-2">
          <Clock size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
          No hay mesas libres ahora. {para?.modo === "EMPEZAR" ? "Puede empezar sin mesa y tomarla después." : "Cuando se libere una, vuelve aquí."}
        </p>
      ) : (
        <div role="radiogroup" aria-label="Mesa del cumpleaños" className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1.5">
          {libres.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={m.id === elegida}
              onClick={() => setElegida(m.id)}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 text-left",
                "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                m.id === elegida ? "border-brand bg-brand/15" : "border-line bg-base/40 hover:border-line-strong",
              )}
            >
              <span className="tnum text-tarjeta font-bold text-ink">{m.label}</span>
              <span className="text-detalle text-ink-3">{m.seats} sillas</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/**
 * En el salón, una mesa libre ofrece sentar al cumpleaños de hoy que todavía no tiene mesa (B10-5): el mesero la elige
 * para la familia y su cuenta es la del cumpleaños. Sin cumpleaños sin mesa, nada.
 */
export function SentarCumpleanosAqui({ mesa }: { mesa: { id: string; label: string } }) {
  const { agenda, leer } = useCumpleanosDeLaSemana();
  const minuto = useMinutoDelLocal(agenda);
  const puede = usePuede();
  const [enviando, setEnviando] = useState(false);
  if (!agenda || !puede.sentar) return null;
  const sinMesa = agenda.reservas.filter(
    (r) => r.fecha === agenda.hoy && r.fin > minuto && (r.estado === "CONFIRMADA" || (r.estado === "EN_CURSO" && !r.dia?.mesa)),
  );
  if (sinMesa.length === 0) return null;
  return (
    <>
      {sinMesa.map((r) => (
        <Button
          key={r.id}
          variant="neutral"
          disabled={enviando}
          className="w-full gap-1.5"
          onClick={async () => {
            setEnviando(true);
            const res = await sentarEvento({ idempotencyKey: crypto.randomUUID(), reservaId: r.id, mesaId: mesa.id }).catch(() => sinConexion);
            setEnviando(false);
            if (!res.ok) return avisar.error(res.mensaje);
            avisar.ok(`Cumpleaños de ${r.cumpleanero} en la mesa ${mesa.label}`, { detalle: "Lo que pidan va a su cuenta, con el saldo." });
            leer();
          }}
        >
          <Cake size={17} aria-hidden="true" />
          Sentar el cumpleaños de {r.cumpleanero}
        </Button>
      ))}
    </>
  );
}
