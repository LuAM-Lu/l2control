"use client";

import { useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { EstadoReserva, Rechazo, ReservaEventoDto } from "@l2/contracts";
import { Button, Dialog, Input, Marquesina, avisar, cn } from "@l2/ui";
import type { TimeFormat } from "../park/time-format.ts";
import { cambiarFechaEvento } from "./eventos.acciones";
import { ESTADO, fechaLarga, hhmmDe, horaDelDia, horario, minutosDe } from "./formato.ts";

/**
 * El calendario de los cumpleaños y cambiarles la fecha — B10-3 (M-39, X-11).
 *
 * La vista de mes pinta cada día con sus cumpleaños (hora, quién y el icono de su estado), junto a la lista. «Cambiar
 * fecha» (día y hora) lleva su motivo y vale también con el anticipo cobrado, hasta antes de empezar: el servidor comprueba
 * el aforo del nuevo horario como al reservar, y el cambio queda en la historia de la reserva.
 */

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });
const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la fecha no se cambió." };

/** Las reservas que todavía cambian de fecha: hasta antes de empezar. */
export const cambiaDeFecha = (r: Pick<ReservaEventoDto, "estado">) => r.estado === "ANTICIPO_POR_COBRAR" || r.estado === "CONFIRMADA";

/** «2026-10» del día dado. */
const mesDe = (dia: string) => dia.slice(0, 7);
const mesMas = (mes: string, n: number) => {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/** Un mes, de lunes a domingo, cada día con sus cumpleaños. */
export function MesDeCumpleanos({
  reservas,
  hoy,
  formato,
  iconos,
  onElegir,
}: {
  reservas: readonly ReservaEventoDto[];
  hoy: string;
  formato: TimeFormat;
  iconos: Readonly<Record<EstadoReserva, typeof CalendarClock>>;
  onElegir: (r: ReservaEventoDto) => void;
}) {
  const [mes, setMes] = useState(mesDe(hoy));
  const primero = new Date(`${mes}-01T12:00:00.000Z`);
  // Lunes primero: cuántos huecos antes del día 1.
  const hueco = (primero.getUTCDay() + 6) % 7;
  const diasDelMes = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate();
  const celdas = [...Array.from({ length: hueco }, () => null), ...Array.from({ length: diasDelMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <section aria-label="Los cumpleaños del mes" className="flex min-h-0 flex-col gap-2 md:h-full">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" surface="admin" aria-label="Mes anterior" onClick={() => setMes((m) => mesMas(m, -1))} disabled={mes <= mesDe(hoy)}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <h3 className="text-tarjeta font-semibold text-ink first-letter:uppercase">{MESES.format(primero)}</h3>
        <Button type="button" variant="ghost" surface="admin" aria-label="Mes siguiente" onClick={() => setMes((m) => mesMas(m, 1))} disabled={mes >= mesMas(mesDe(hoy), 2)}>
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className="grid min-h-0 grid-cols-7 gap-px overflow-y-auto rounded-[var(--radius-card)] border border-line bg-line">
        {DIAS.map((d) => (
          <div key={d} className="bg-surface-2 px-2 py-1 text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">
            {d}
          </div>
        ))}
        {celdas.map((dia, i) =>
          dia === null ? (
            <div key={`h${i}`} className="min-h-20 bg-surface/50" />
          ) : (
            <div key={dia} className={cn("flex min-h-20 flex-col gap-1 bg-surface p-1.5", dia === hoy && "ring-2 ring-inset ring-brand")}>
              <span className={cn("tnum text-detalle", dia === hoy ? "font-bold text-brand" : dia < hoy ? "text-ink-3" : "text-ink-2")}>{Number(dia.slice(8))}</span>
              {reservas
                .filter((r) => r.fecha === dia)
                .map((r) => {
                  const Icono = iconos[r.estado];
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onElegir(r)}
                      title={`${horario(r.inicio, r.fin, formato)} · Cumpleaños de ${r.cumpleanero} · ${ESTADO[r.estado].texto}`}
                      className="flex min-h-8 w-full cursor-pointer items-center gap-1 rounded-[var(--radius-control)] bg-surface-2 px-1.5 text-left text-nota text-ink hover:bg-brand/15 focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <Icono size={12} aria-hidden="true" className={cn("shrink-0", ESTADO[r.estado].tono === "ok" ? "text-state-ok" : ESTADO[r.estado].tono === "warn" ? "text-state-warn" : "text-ink-3")} />
                      <span className="tnum shrink-0 font-semibold">{horaDelDia(r.inicio, formato)}</span>
                      <Marquesina className="min-w-0 flex-1">{r.cumpleanero}</Marquesina>
                    </button>
                  );
                })}
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/** «Cambiar fecha»: día, hora de inicio y de fin, y el motivo. */
export function CambiarFechaDialog({
  reserva,
  hoy,
  formato,
  onCerrar,
  onHecho,
}: {
  reserva: ReservaEventoDto | null;
  hoy: string;
  formato: TimeFormat;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [fecha, setFecha] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  if ((reserva?.id ?? null) !== para) {
    setPara(reserva?.id ?? null);
    setFecha(reserva?.fecha ?? "");
    setInicio(reserva ? hhmmDe(reserva.inicio) : "");
    setFin(reserva ? hhmmDe(reserva.fin) : "");
    setMotivo("");
    setErrores({});
  }

  async function cambiar() {
    if (!reserva || enviando) return;
    const i = minutosDe(inicio);
    const f = minutosDe(fin);
    const nuevos: Record<string, string> = {};
    if (!fecha) nuevos["fecha"] = "Elige el día";
    if (i === null) nuevos["inicio"] = "Hora de inicio";
    if (f === null) nuevos["fin"] = "Hora de fin";
    if (motivo.trim().length < 3) nuevos["motivo"] = "Di por qué se cambia";
    if (Object.keys(nuevos).length > 0) return setErrores(nuevos);
    setEnviando(true);
    const r = await cambiarFechaEvento({ idempotencyKey: crypto.randomUUID(), reservaId: reserva.id, fecha, inicio: i!, fin: f!, motivo: motivo.trim() }).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) {
      const campo = r.problemas?.[0]?.path?.[0];
      return setErrores(typeof campo === "string" && ["fecha", "inicio", "fin", "motivo"].includes(campo) ? { [campo]: r.mensaje } : { general: r.mensaje });
    }
    avisar.ok(`El cumpleaños de ${reserva.cumpleanero} pasó al ${fechaLarga(fecha)}`, { detalle: `${horario(i!, f!, formato)}. Queda anotado en su historia.` });
    onHecho();
    onCerrar();
  }

  return (
    <Dialog
      abierto={reserva !== null}
      onCerrar={onCerrar}
      titulo={`Cambiar fecha · Cumpleaños de ${reserva?.cumpleanero ?? ""}`}
      descripcion={reserva ? `Ahora: ${fechaLarga(reserva.fecha)}, ${horario(reserva.inicio, reserva.fin, formato)}. El anticipo sigue como está; el aforo del nuevo horario se comprueba al guardar.` : ""}
      pie={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" surface="admin" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" surface="admin" onClick={() => void cambiar()} disabled={enviando}>
            <CalendarClock size={15} aria-hidden="true" />
            Cambiar fecha
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input surface="admin" type="date" label="Día" min={hoy} value={fecha} error={errores["fecha"]} onChange={(e) => setFecha(e.target.value)} />
        <Input surface="admin" type="time" label="Empieza" value={inicio} error={errores["inicio"]} onChange={(e) => setInicio(e.target.value)} />
        <Input surface="admin" type="time" label="Termina" value={fin} error={errores["fin"]} onChange={(e) => setFin(e.target.value)} />
      </div>
      <div className="mt-3">
        <Input surface="admin" label="Motivo" placeholder="La familia lo pasa al domingo" value={motivo} error={errores["motivo"]} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      {errores["general"] && <p className="mt-2 text-detalle text-state-crit">{errores["general"]}</p>}
    </Dialog>
  );
}
