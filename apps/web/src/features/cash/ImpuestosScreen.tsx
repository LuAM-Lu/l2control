"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, History, Lock } from "lucide-react";
import type { Impuesto, ImpuestosDto, TratoProgramable, VigenciaImpuestoDto } from "@l2/contracts";
import { addDays, calendarDay } from "@l2/domain-rates";
import { basisPointsFromPercent, percentFromBasisPoints } from "@l2/domain-tax";
import { Button, Container, Input, PageHeader, avisar, cn } from "@l2/ui";
import { useConElevacion } from "../identity/ElevacionProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { programarImpuesto } from "./impuestos.acciones";

/**
 * Configuración → Impuestos (B2-2, F3-06, F3-07). Las alícuotas son datos con vigencia: aquí se ve
 * lo que rige, lo que rigió y lo programado, y se programa el siguiente cambio. Nada se edita: un
 * cambio cierra el tramo anterior el día que empieza. Quién puede, desde qué instante y si el día
 * vale lo decide el servidor; aquí solo se ofrece.
 */

/** Lo que se programa, en palabras de quien lo configura. */
const OPCIONES: readonly { clave: string; impuesto: Impuesto; code: TratoProgramable | null; nombre: string }[] = [
  { clave: "IVA:GENERAL", impuesto: "IVA", code: "GENERAL", nombre: "IVA general" },
  { clave: "IVA:REDUCIDA", impuesto: "IVA", code: "REDUCIDA", nombre: "IVA reducido" },
  { clave: "IGTF", impuesto: "IGTF", code: null, nombre: "IGTF (pagos en divisas)" },
];

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";
const CAMPO =
  "flex min-h-10 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** «jue 1 oct»: un día en palabras, en la zona del local. */
function diaEnPalabras(instante: number, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: zona }).formatToParts(instante);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? "";
  return `${de("weekday")} ${de("day")} ${de("month")}`;
}

type Estado = "RIGE" | "PROGRAMADA" | "TERMINO";
const estadoDe = (v: VigenciaImpuestoDto, ahora: number): Estado =>
  Date.parse(v.desde) > ahora ? "PROGRAMADA" : v.hasta !== null && Date.parse(v.hasta) <= ahora ? "TERMINO" : "RIGE";

export function ImpuestosScreen({ impuestos }: { impuestos: ImpuestosDto }) {
  const router = useRouter();
  const conElevacion = useConElevacion();
  const { ajustes } = useSucursal();
  const ahoraLocal = useAhoraLocal();
  const zona = impuestos.zonaHoraria;
  const ahora = ahoraLocal === 0 ? null : ahoraLocal;
  const hoy = ahora === null ? null : calendarDay(new Date(ahora).toISOString(), zona);
  const cuando = (iso: string) => {
    const t = Date.parse(iso);
    return `${diaEnPalabras(t, zona)}, ${formatClock(t, ajustes.formatoHora)}`;
  };

  const [clave, setClave] = useState(OPCIONES[0]!.clave);
  const [porcentaje, setPorcentaje] = useState("");
  const [errorPorcentaje, setErrorPorcentaje] = useState<string | undefined>();
  const [dia, setDia] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const diaElegido = dia ?? hoy;
  const opcion = OPCIONES.find((o) => o.clave === clave)!;

  /** Por impuesto, del más nuevo al más viejo: lo programado arriba, lo que terminó abajo. */
  const grupos = useMemo(
    () =>
      OPCIONES.map((o) => ({
        ...o,
        tramos: impuestos.vigencias
          .filter((v) => v.impuesto === o.impuesto && v.code === o.code)
          .sort((a, b) => Date.parse(b.desde) - Date.parse(a.desde)),
      })),
    [impuestos.vigencias],
  );

  const programar = async (e: React.FormEvent) => {
    e.preventDefault();
    const basisPoints = basisPointsFromPercent(porcentaje);
    if (basisPoints === null) {
      setErrorPorcentaje("Un porcentaje entre 0 y 100, con hasta dos decimales (16 o 16,5)");
      return;
    }
    if (!diaElegido) return;
    setEnviando(true);
    try {
      const r = await conElevacion(() => programarImpuesto({ impuesto: opcion.impuesto, code: opcion.code, basisPoints, dia: diaElegido }));
      if (r.ok) {
        // El servidor devuelve el tramo que rige desde ese día: si empezó antes, lo programado
        // canceló un cambio que había para ese día.
        const cancelo = calendarDay(r.valor.desde, zona) < diaElegido;
        const pct = `${percentFromBasisPoints(basisPoints)} %`;
        const elDia = diaEnPalabras(Date.parse(`${diaElegido}T12:00:00.000Z`), "UTC");
        avisar.ok(
          cancelo
            ? `${opcion.nombre}: se cancela el cambio del ${elDia}; sigue el ${pct}`
            : diaElegido === hoy
              ? `${opcion.nombre} al ${pct}: rige desde ahora`
              : `${opcion.nombre} al ${pct}: programado para el ${elDia}`,
        );
        setPorcentaje("");
        setDia(null);
        router.refresh();
      } else if (r.problemas?.some((p) => p.path[0] === "basisPoints")) {
        setErrorPorcentaje(r.problemas.find((p) => p.path[0] === "basisPoints")!.message);
      } else {
        avisar.error(r.mensaje);
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El impuesto no se programó.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Impuestos" }]}
        titulo="Impuestos"
        descripcion="Las alícuotas son datos con fecha: un cambio se programa y cierra la anterior el día que empieza, sin reescribir lo ya vendido. Los valores los confirma el contador."
        meta={hoy && <span className="tnum text-[12.5px] text-ink-3">Hoy es {diaEnPalabras(Date.parse(`${hoy}T12:00:00.000Z`), "UTC")} (hora de Venezuela)</span>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section aria-label="Lo que rige ahora" className="flex min-w-0 flex-col gap-4">
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h2 className="font-display mb-3 text-[14px] font-bold text-ink">Rige ahora</h2>
            <ul className="flex flex-col divide-y divide-line">
              {grupos.map((g) => {
                const vigente = ahora === null ? undefined : g.tramos.find((v) => estadoDe(v, ahora) === "RIGE");
                return (
                  <li key={g.clave} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-[13.5px] text-ink-2">{g.nombre}</span>
                    {vigente ? (
                      <span className="tnum text-[18px] font-bold text-ink">{percentFromBasisPoints(vigente.basisPoints)} %</span>
                    ) : ahora === null ? (
                      <span className="text-[13px] text-ink-3">…</span>
                    ) : (
                      <span className="flex items-center gap-1 text-[12.5px] font-semibold text-state-crit">
                        <AlertTriangle size={14} aria-hidden="true" />
                        Sin alícuota
                      </span>
                    )}
                  </li>
                );
              })}
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-1.5 text-[13.5px] text-ink-2">
                  <Lock size={13} className="text-ink-3" aria-hidden="true" />
                  IVA exento
                </span>
                <span className="tnum text-[18px] font-bold text-ink-2">0 %</span>
              </li>
            </ul>
            {ahora !== null && grupos.some((g) => !g.tramos.some((v) => estadoDe(v, ahora) === "RIGE")) && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-state-crit-bg p-3 text-[13px] font-medium text-state-crit">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                Sin todas las alícuotas vigentes la caja no cobra: nunca supone un 0 %.
              </p>
            )}
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
            <h2 className="font-display mb-4 text-[14px] font-bold text-ink">Programar un cambio</h2>
            <form onSubmit={programar} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="impuestos-cual" className={ETIQUETA}>
                  Impuesto
                </label>
                <select id="impuestos-cual" className={CAMPO} value={clave} onChange={(e) => setClave(e.target.value)}>
                  {OPCIONES.map((o) => (
                    <option key={o.clave} value={o.clave}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                surface="admin"
                label="Alícuota (%)"
                placeholder="16"
                inputMode="decimal"
                autoComplete="off"
                value={porcentaje}
                error={errorPorcentaje}
                onChange={(e) => {
                  setPorcentaje(e.target.value);
                  setErrorPorcentaje(undefined);
                }}
              />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="impuestos-dia" className={ETIQUETA}>
                  Rige desde
                </label>
                <input
                  id="impuestos-dia"
                  type="date"
                  className={cn(CAMPO, "tnum")}
                  value={diaElegido ?? ""}
                  min={hoy ?? undefined}
                  max={hoy ? addDays(hoy, impuestos.diasPorAdelantado) : undefined}
                  disabled={!hoy}
                  onChange={(e) => setDia(e.target.value || null)}
                />
                <p className="text-[12px] text-ink-3">
                  {diaElegido === hoy
                    ? "Hoy: rige desde que lo guardes. Lo cobrado antes se queda como se cobró."
                    : "Rige desde la medianoche de ese día (hora de Venezuela)."}
                </p>
              </div>

              <Button type="submit" variant="primary" surface="admin" className="mt-1 w-full" disabled={enviando || !hoy}>
                {enviando ? "Programando…" : "Programar"}
              </Button>
              <p className="text-[12px] text-ink-3">Pide confirmar tu identidad: mueve lo que cobra el negocio.</p>
            </form>
          </div>
        </section>

        <section aria-label="Calendario de impuestos" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-ink-2" aria-hidden="true" />
            <h2 className="font-display text-[15px] font-bold text-ink">Calendario</h2>
          </div>

          {impuestos.vigencias.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              Este local todavía no tiene impuestos programados. Programa el IVA general, el reducido y el IGTF para
              poder cobrar.
            </p>
          ) : (
            grupos
              .filter((g) => g.tramos.length > 0)
              .map((g) => (
                <div key={g.clave} className="rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                  <h3 className="border-b border-line px-4 py-2.5 text-[13px] font-bold text-ink">{g.nombre}</h3>
                  <ul className="flex flex-col divide-y divide-line">
                    {g.tramos.map((v) => {
                      const estado = ahora === null ? "RIGE" : estadoDe(v, ahora);
                      return (
                        <li key={v.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-baseline gap-3">
                            <span className={cn("tnum w-16 shrink-0 text-[16px] font-bold", estado === "TERMINO" ? "text-ink-3" : "text-ink")}>
                              {percentFromBasisPoints(v.basisPoints)} %
                            </span>
                            <span className="tnum min-w-0 text-[12.5px] text-ink-2">
                              desde {cuando(v.desde)}
                              {v.hasta ? ` · hasta ${cuando(v.hasta)}` : ""}
                              <span className="block text-ink-3">
                                Programado por {v.programadaPor} el {cuando(v.programadaEl)}
                              </span>
                            </span>
                          </div>
                          <ChipEstado estado={estado} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
          )}

          <p className="mt-1 text-center text-[12.5px] text-ink-3">
            Nada se edita ni se borra. Para corregir un cambio programado, programa otro para el mismo día: manda el
            último. Para cancelarlo, programa ese día la alícuota que rige.
          </p>
        </section>
      </div>
    </Container>
  );
}

function ChipEstado({ estado }: { estado: Estado }) {
  if (estado === "RIGE") {
    return (
      <span className="flex shrink-0 items-center gap-1 self-start text-[12px] font-semibold text-state-ok sm:self-auto">
        <CheckCircle2 size={14} aria-hidden="true" />
        Rige ahora
      </span>
    );
  }
  if (estado === "PROGRAMADA") {
    return (
      <span className="flex shrink-0 items-center gap-1 self-start rounded-full border border-brand/40 px-2 py-0.5 text-[12px] font-semibold text-brand sm:self-auto">
        <CalendarClock size={13} aria-hidden="true" />
        Programado
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1 self-start text-[12px] text-ink-3 sm:self-auto">
      <History size={13} aria-hidden="true" />
      Terminó
    </span>
  );
}
