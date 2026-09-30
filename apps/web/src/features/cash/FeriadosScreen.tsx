"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, Info, Trash2 } from "lucide-react";
import type { FeriadoDto, FeriadosDto } from "@l2/contracts";
import { calendarDay, holidayProblem } from "@l2/domain-rates";
import { Button, Container, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { registrarFeriado, retirarFeriado } from "./feriados.acciones";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * Configuración → Feriados bancarios (B2-4, D-FER). Un feriado no es día hábil: el BCV no publica
 * y la tasa del día hábil anterior lo cubre. Se cargan por año copiando el calendario de SUDEBAN,
 * que cambia cada año; nada se precarga de memoria. Registrar y retirar piden confirmar identidad.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** «martes 13 de octubre»: fecha de calendario, se pinta en UTC. */
const LARGO = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const enPalabras = (dia: string) => LARGO.format(Date.parse(`${dia}T12:00:00.000Z`));

export function FeriadosScreen({ feriados }: { feriados: FeriadosDto }) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const ahora = useAhoraLocal();
  const zona = useSucursal().ajustes.zonaHoraria;
  const hoy = ahora === 0 ? null : calendarDay(new Date(ahora).toISOString(), zona);
  const anio = hoy?.slice(0, 4) ?? null;

  const [dia, setDia] = useState("");
  const [nombre, setNombre] = useState("");
  const [errorDia, setErrorDia] = useState<string | undefined>();
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const [retirando, setRetirando] = useState<string | null>(null);

  /** Por año, del más reciente al más viejo; dentro del año, en orden de calendario. */
  const porAnio = useMemo(() => {
    const grupos = new Map<string, FeriadoDto[]>();
    for (const f of feriados.feriados) grupos.set(f.dia.slice(0, 4), [...(grupos.get(f.dia.slice(0, 4)) ?? []), f]);
    if (anio && !grupos.has(anio)) grupos.set(anio, []);
    return [...grupos.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [feriados.feriados, anio]);

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = dia ? holidayProblem(dia) : "DIA_INVALIDO";
    if (problema) {
      setErrorDia(problema === "FIN_DE_SEMANA" ? "Sábado o domingo ya no es día hábil: no hace falta marcarlo" : "Elige el día");
      return;
    }
    if (nombre.trim().length < 3) {
      setErrorNombre("Escribe el nombre del feriado");
      return;
    }
    setEnviando(true);
    try {
      const r = await conElevacion(() => registrarFeriado({ dia, nombre: nombre.trim() }));
      if (r.ok) {
        avisar.ok(`Feriado registrado: ${enPalabras(r.valor.dia)}`);
        setDia("");
        setNombre("");
        router.refresh();
      } else if (r.problemas?.some((p) => p.path[0] === "dia")) {
        setErrorDia(r.mensaje);
      } else {
        avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El feriado no se registró.");
    } finally {
      setEnviando(false);
    }
  };

  const retirar = async (f: FeriadoDto) => {
    setEnviando(true);
    try {
      const r = await conElevacion(() => retirarFeriado({ feriadoId: f.id }));
      if (r.ok) {
        avisar.ok(`Feriado retirado: ${enPalabras(f.dia)}`);
        router.refresh();
      } else {
        avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El feriado sigue registrado.");
    } finally {
      setEnviando(false);
      setRetirando(null);
    }
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Feriados bancarios" }]}
        titulo="Feriados bancarios"
        descripcion="Un feriado bancario no es día hábil: el BCV no publica tasa y la caja cobra con la del día hábil anterior, como en un fin de semana. Sin registrarlo, ese día exigiría cargar la tasa a mano."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section aria-label="Registrar un feriado" className="flex min-w-0 flex-col gap-4">
          <form onSubmit={registrar} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h2 className="font-display text-[14px] font-bold text-ink">Registrar un feriado</h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="feriado-dia" className={ETIQUETA}>
                Día
              </label>
              <input
                id="feriado-dia"
                type="date"
                className={cn(CAMPO, "tnum", errorDia && "border-state-crit")}
                value={dia}
                aria-invalid={errorDia ? true : undefined}
                aria-describedby={errorDia ? "feriado-dia-error" : undefined}
                onChange={(e) => {
                  setDia(e.target.value);
                  setErrorDia(undefined);
                }}
              />
              {errorDia && (
                <p id="feriado-dia-error" className="text-[12px] font-medium text-state-crit">
                  {errorDia}
                </p>
              )}
            </div>
            <Input
              surface="admin"
              label="Nombre"
              placeholder="Día de la Resistencia Indígena"
              autoComplete="off"
              value={nombre}
              error={errorNombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setErrorNombre(undefined);
              }}
            />
            <Button type="submit" variant="primary" surface="admin" className="mt-1 w-full" disabled={enviando}>
              {enviando ? "Guardando…" : "Registrar"}
            </Button>
            <p className="flex items-start gap-1.5 text-[12px] text-ink-3">
              <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Cópialos del calendario bancario que publica SUDEBAN para el año: Carnaval y Semana Santa cambian de fecha y
              algunos feriados se trasladan. Pide confirmar tu identidad.
            </p>
          </form>
        </section>

        <section aria-label="Feriados registrados" className="flex min-w-0 flex-col gap-4">
          {porAnio.map(([año, lista]) => (
            <div key={año} className="rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
              <h2 className="tnum border-b border-line px-4 py-2.5 text-[13px] font-bold text-ink">
                {año} <span className="font-medium text-ink-3">· {lista.length} {lista.length === 1 ? "feriado" : "feriados"}</span>
              </h2>
              {lista.length === 0 ? (
                <p className="flex items-center gap-2 px-4 py-5 text-[13px] text-ink-3">
                  <CalendarOff size={16} aria-hidden="true" />
                  Todavía no hay feriados registrados para {año}.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {lista.map((f) => {
                    const pasado = hoy !== null && f.dia < hoy;
                    return (
                      <li key={f.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className={cn("text-[13.5px] font-semibold first-letter:uppercase", pasado ? "text-ink-3" : "text-ink")}>
                            {enPalabras(f.dia)}
                            {f.dia === hoy ? <span className="ml-2 text-[12px] font-semibold text-brand">Hoy</span> : null}
                          </p>
                          <p className="truncate text-[12.5px] text-ink-2">
                            {f.nombre} <span className="text-ink-3">· registrado por {f.registradoPor}</span>
                          </p>
                        </div>
                        {retirando === f.id ? (
                          <div className="flex shrink-0 gap-1.5">
                            <Button type="button" variant="ghost" surface="admin" onClick={() => setRetirando(null)} disabled={enviando}>
                              Cancelar
                            </Button>
                            <Button type="button" variant="danger" surface="admin" onClick={() => void retirar(f)} disabled={enviando}>
                              Sí, retirar
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            surface="admin"
                            className="shrink-0 gap-1.5 self-start sm:self-auto"
                            onClick={() => setRetirando(f.id)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                            Retirar
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          <p className="text-center text-[12.5px] text-ink-3">
            Retirar no borra: el feriado queda en la auditoría con quién lo registró y quién lo retiró.
          </p>
        </section>
      </div>
    </Container>
  );
}
