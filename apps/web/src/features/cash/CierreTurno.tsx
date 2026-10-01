"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { CircleCheckBig, EyeOff, Lock, OctagonAlert, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ArqueoDto, CorteDto, MoneyDto, Rechazo, TipoDeCierre, TurnoDto } from "@l2/contracts";
import { countDenominations } from "@l2/domain-cash";
import { money, multiply, subtract, toMajor, zero, type CurrencyCode, type Money } from "@l2/domain-money";
import { Button, Input, MoneyDisplay, Stepper, avisar, cn, formatMoneyVE } from "@l2/ui";
import { DENOMINACIONES } from "./turno.ts";
import { importeTecleado } from "./importe.ts";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { PendientesDelCierre } from "./PendientesDelCierre.tsx";
import { registrarArqueo, sellarCorteZ } from "./cortes.acciones";
import { TicketDelCorte } from "../impresion/TicketDelCorte.tsx";

/**
 * Cerrar un turno — F4-06, F4-07, JORNADA §4 (relevo) y §5 (cierre de la jornada), B3-5.
 *
 * Tres pasos, y uno más al cerrar la jornada:
 *
 *  0. **Pendientes** (solo la jornada): cuentas por cobrar, niños en sala, huérfanas y turnos de otros
 *     equipos. No hay «cerrar igual»: el conteo no se ofrece hasta que la lista está vacía (C2).
 *  1. **Contar a ciegas**: billetes por moneda. Lo que dice el libro NO se ve aquí: verlo antes
 *     invita a «cuadrar» el conteo en vez de contar. El servidor guarda el conteo.
 *  2. **La diferencia y la firma**: ya contado, el servidor dice lo que esperaba, la diferencia en
 *     dólares con la tasa del turno y quién firma: la cajera con su PIN hasta $ 1,00; supervisión
 *     con su 🔐 y una justificación por encima. Se dice qué se deja en la gaveta (el fondo, en un
 *     relevo) y lo demás se retira.
 *  3. **El Z**: el turno queda sellado. Nada lo toca después (la base lo impone).
 */

type Paso = "pendientes" | "contar" | "revisar" | "hecho";
const MONEDAS = ["USD", "VES"] as const;
const aDinero = (m: MoneyDto): Money => money(BigInt(m.minor), m.currency as CurrencyCode);
const deDinero = (m: Money): MoneyDto => ({ minor: String(m.amount), currency: m.currency });
const NOMBRE: Record<(typeof MONEDAS)[number], string> = { USD: "Dólares", VES: "Bolívares" };
/** «1500,50» desde unidades menores: como se teclea, para precargar un campo (`importeTecleado` lo lee). */
const aTexto = (m: Money) => toMajor(m).replace(".", ",");

export function CierreTurno({
  turno,
  tipo,
  ajeno,
  onVolver,
}: {
  turno: TurnoDto;
  tipo: TipoDeCierre;
  /** Supervisión cierra el turno de otro equipo (JORNADA §5). */
  ajeno: boolean;
  onVolver: () => void;
}) {
  const [paso, setPaso] = useState<Paso>(tipo === "JORNADA" ? "pendientes" : "contar");
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [arqueo, setArqueo] = useState<ArqueoDto | null>(null);
  const [corte, setCorte] = useState<CorteDto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Pasos paso={paso} jornada={tipo === "JORNADA"} />
      {paso === "pendientes" && <PendientesDelCierre turnoId={turno.id} onListo={() => setPaso("contar")} />}
      {paso === "contar" && (
        <Contar
          turno={turno}
          conteo={conteo}
          setConteo={setConteo}
          aviso={aviso}
          onContado={(a) => {
            setArqueo(a);
            setAviso(null);
            setPaso("revisar");
          }}
        />
      )}
      {paso === "revisar" && arqueo && (
        <Revisar
          turno={turno}
          tipo={tipo}
          arqueo={arqueo}
          onRecontar={(motivo) => {
            setAviso(motivo);
            setPaso("contar");
          }}
          onSellado={(z) => {
            setCorte(z);
            setPaso("hecho");
          }}
        />
      )}
      {paso === "hecho" && corte && <Sellado corte={corte} ajeno={ajeno} onVolver={onVolver} />}
    </div>
  );
}

/** Dónde se está del cierre: los pasos, con el actual marcado. */
function Pasos({ paso, jornada }: { paso: Paso; jornada: boolean }) {
  const pasos: { id: Paso; texto: string }[] = [
    ...(jornada ? [{ id: "pendientes" as const, texto: "Pendientes" }] : []),
    { id: "contar", texto: "Contar la gaveta" },
    { id: "revisar", texto: "Diferencia y firma" },
    { id: "hecho", texto: "Corte Z" },
  ];
  const actual = pasos.findIndex((p) => p.id === paso);
  return (
    <ol aria-label="Pasos del cierre" className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2 text-[12.5px] md:px-6">
      {pasos.map((p, i) => (
        <li key={p.id} aria-current={i === actual ? "step" : undefined} className="flex items-center gap-2">
          <span
            className={cn(
              "tnum flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold",
              i < actual ? "border-state-ok bg-state-ok-bg text-state-ok" : i === actual ? "border-brand bg-brand/12 text-ink" : "border-line text-ink-3",
            )}
          >
            {i < actual ? <CircleCheckBig size={12} aria-hidden="true" /> : i + 1}
          </span>
          <span className={cn(i === actual ? "font-semibold text-ink" : "text-ink-3")}>{p.texto}</span>
          {i < pasos.length - 1 && <span aria-hidden="true" className="h-px w-4 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

/* ─────────────────────────────────────────────────────── 1 · contar a ciegas */

function Contar({
  turno,
  conteo,
  setConteo,
  aviso,
  onContado,
}: {
  turno: TurnoDto;
  conteo: Record<string, string>;
  setConteo: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  aviso: string | null;
  onContado: (a: ArqueoDto) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cantidad = (moneda: string, den: Money) => Number.parseInt(conteo[`${moneda}|${toMajor(den)}`] ?? "0", 10) || 0;
  const contado = useMemo(
    () =>
      Object.fromEntries(
        MONEDAS.map((m) => [m, countDenominations(DENOMINACIONES[m].map((d) => ({ denomination: d, count: cantidad(m, d) })), m)]),
      ) as Record<(typeof MONEDAS)[number], Money>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conteo],
  );

  const registrar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await registrarArqueo({
        turnoId: turno.id,
        conteos: MONEDAS.map((m) => ({
          currency: m,
          billetes: DENOMINACIONES[m]
            .map((d) => ({ denominacion: deDinero(d), cantidad: cantidad(m, d) }))
            .filter((b) => b.cantidad > 0),
        })),
      });
      if (r.ok) onContado(r.valor);
      else setError(r.mensaje);
    } catch {
      setError("Sin conexión con el servidor: el conteo no se registró. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 md:px-6 apaisado:grid-cols-[minmax(0,1fr)_340px] apaisado:grid-rows-[minmax(0,1fr)] apaisado:content-stretch apaisado:overflow-hidden apaisado:bajo:py-3">
      <section className="@container/arqueo flex min-h-0 min-w-0 flex-col overflow-clip rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3">
          <h2 className="font-display text-base font-bold text-ink">Arqueo físico</h2>
          <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Cuenta billetes, no importes</span>
        </div>
        <div className="grid min-h-0 gap-px overflow-y-auto bg-line @min-[49rem]/arqueo:grid-cols-2">
          {MONEDAS.map((m) => (
            <div key={m} className="bg-surface px-4 py-3">
              <h3 className="sticky top-0 z-10 mb-2 flex items-baseline justify-between gap-3 bg-surface py-1">
                <span className="font-display text-sm font-bold text-ink">Efectivo en {m}</span>
                <MoneyDisplay value={toMajor(contado[m])} currency={m} size="sm" />
              </h3>
              <ul className="flex flex-col gap-1.5">
                {DENOMINACIONES[m].map((den) => {
                  const clave = `${m}|${toMajor(den)}`;
                  const n = cantidad(m, den);
                  return (
                    <li key={clave} className="flex items-center justify-between gap-2">
                      <span className="tnum w-14 shrink-0 font-semibold text-ink">{toMajor(den)}</span>
                      <Stepper
                        value={n}
                        onChange={(v) => setConteo((prev) => ({ ...prev, [clave]: String(v) }))}
                        label={`Billetes de ${toMajor(den)} ${m}`}
                        disabled={enviando}
                        surface="pos"
                      />
                      <span className={cn("tnum w-20 min-w-0 shrink-0 text-right text-[13px]", n > 0 ? "text-ink-2" : "text-ink-3/60")}>
                        {toMajor(multiply(den, BigInt(n)))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-3 apaisado:min-h-0 apaisado:overflow-y-auto">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <h2 className="font-display mb-2 text-base font-bold text-ink">Contado</h2>
          <ul className="flex flex-col gap-2">
            {MONEDAS.map((m) => (
              <li key={m} className="flex flex-col">
                <span className="text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">{NOMBRE[m]}</span>
                <MoneyDisplay value={toMajor(contado[m])} currency={m} size="xl" className="apaisado:bajo:text-2xl" />
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-2">
            <EyeOff size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            Se cuenta a ciegas: lo que dice el libro se ve después de registrar el conteo.
          </p>
        </div>
        {aviso && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2 text-[12.5px] text-state-warn">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {aviso}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12.5px] text-state-crit">
            {error}
          </p>
        )}
        <Button surface="pos" variant="primary" className="w-full" onClick={() => void registrar()} disabled={enviando}>
          {enviando ? "Registrando…" : "Registrar el conteo"}
        </Button>
        <p className="text-[12px] text-ink-3">Una moneda sin billetes cuenta como cero.</p>
      </aside>
    </div>
  );
}

/* ─────────────────────────────────────────────── 2 · la diferencia y la firma */

function Revisar({
  turno,
  tipo,
  arqueo,
  onRecontar,
  onSellado,
}: {
  turno: TurnoDto;
  tipo: TipoDeCierre;
  arqueo: ArqueoDto;
  onRecontar: (motivo: string | null) => void;
  onSellado: (z: CorteDto) => void;
}) {
  const supervision = arqueo.firma === "SUPERVISION";
  const a = useAutorizacion("turno.corteZ", true, { propio: !supervision });
  // Una clave por conteo revisado: un doble clic sella una sola vez.
  const [clave] = useState(() => crypto.randomUUID());
  const deMoneda = (lista: MoneyDto[], m: "USD" | "VES") => aDinero(lista.find((x) => x.currency === m) ?? { minor: "0", currency: m });
  // Lo que se deja: el fondo con que se abrió (en un relevo lo recibe quien entra, D-JOR), nunca
  // más de lo contado.
  const [queda, setQueda] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      MONEDAS.map((m) => {
        const fondo = turno.fondos.find((f) => f.currency === m);
        const f = fondo ? aDinero(fondo.amount) : zero(m);
        const c = deMoneda(arqueo.contado, m);
        return [m, aTexto(f.amount <= c.amount ? f : c)];
      }),
    ),
  );
  const [justificacion, setJustificacion] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const quedaEn = (m: (typeof MONEDAS)[number]) => importeTecleado(queda[m] ?? "", m);

  const sellar = async () => {
    if (enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    for (const m of MONEDAS) {
      const q = quedaEn(m);
      if (!q) nuevos[`queda-${m}`] = "Un importe, con hasta dos decimales";
      else if (q.amount > deMoneda(arqueo.contado, m).amount) nuevos[`queda-${m}`] = "No se deja más de lo contado";
    }
    if (supervision && justificacion.trim().length < 5) nuevos.justificacion = "Explica la diferencia";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    const motivo = tipo === "JORNADA" ? "Cierre de la jornada" : "Relevo de caja";
    const r = await sellarCorteZ(
      {
        idempotencyKey: clave,
        turnoId: turno.id,
        arqueoId: arqueo.id,
        cierre: tipo,
        quedaEnGaveta: MONEDAS.map((m) => deDinero(quedaEn(m)!)),
        ...(supervision ? { justificacion: justificacion.trim() } : {}),
      },
      a.autorizacion(supervision ? justificacion.trim() : motivo),
    ).catch((): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: el turno sigue abierto." }));
    setEnviando(false);
    if (r.ok) {
      avisar.ok(tipo === "JORNADA" ? "Jornada cerrada: el turno quedó sellado con su corte Z" : "Turno sellado con su corte Z");
      onSellado(r.valor);
      return;
    }
    // Entró dinero después de contar, o hay un conteo más nuevo: se vuelve a contar.
    if (r.motivo === "CONFLICTO" && /contar|conteo/i.test(r.mensaje)) {
      onRecontar(r.mensaje);
      return;
    }
    const e = erroresDeRechazo(r.mensaje);
    if (e.pin) a.borrarPin();
    const campo = r.problemas?.[0]?.path[0];
    setErrores(campo === "justificacion" ? { justificacion: r.mensaje } : (e as Record<string, string>));
  };

  const dif = arqueo.diferenciaEnDolares ? aDinero(arqueo.diferenciaEnDolares) : null;

  return (
    <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-4 md:px-6 apaisado:grid-cols-[minmax(0,1fr)_380px] apaisado:content-stretch apaisado:overflow-hidden apaisado:bajo:py-3">
      <section className="flex min-w-0 flex-col gap-4 apaisado:min-h-0 apaisado:overflow-y-auto">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-bold text-ink">Lo contado contra el libro</h2>
            <Button surface="tablet" variant="neutral" className="gap-1.5" onClick={() => onRecontar(null)} disabled={enviando}>
              <RotateCcw size={15} aria-hidden="true" />
              Volver a contar
            </Button>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                <th className="py-1.5 font-semibold">Moneda</th>
                <th className="py-1.5 text-right font-semibold">Contado</th>
                <th className="py-1.5 text-right font-semibold">Según el libro</th>
                <th className="py-1.5 text-right font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {MONEDAS.map((m) => {
                const d = deMoneda(arqueo.diferencias, m);
                return (
                  <tr key={m} className="border-t border-line/60">
                    <td className="py-2 text-ink-2">{NOMBRE[m]}</td>
                    <td className="py-2 text-right">
                      <MoneyDisplay value={toMajor(deMoneda(arqueo.contado, m))} currency={m} size="sm" />
                    </td>
                    <td className="py-2 text-right">
                      <MoneyDisplay value={toMajor(deMoneda(arqueo.esperado, m))} currency={m} size="sm" />
                    </td>
                    <td className="py-2 text-right">
                      <Diferencia d={d} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-[13px]",
              supervision ? "border-state-warn/40 bg-state-warn-bg text-state-warn" : "border-state-ok/40 bg-state-ok-bg text-state-ok",
            )}
          >
            {supervision ? <ShieldCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <CircleCheckBig size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span>
              {dif === null ? (
                "Hay diferencia en bolívares y no hay tasa del turno para medirla: la revisa y firma supervisión."
              ) : (
                <>
                  Diferencia total <strong className="tnum">{formatMoneyVE(toMajor(dif), "USD")}</strong> con la tasa del turno
                  {supervision
                    ? `: pasa de ${formatMoneyVE(toMajor(aDinero(arqueo.umbral)), "USD")}, así que la revisa y firma supervisión.`
                    : ": dentro del umbral, firmas tú."}
                </>
              )}
            </span>
          </div>
        </div>

        <fieldset className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <legend className="font-display px-1 text-base font-bold text-ink">Qué se deja en la gaveta</legend>
          <p className="mb-3 text-[12.5px] text-ink-2">
            {tipo === "RELEVO"
              ? "Se deja el fondo para quien entra, que lo declara al abrir su turno. Lo demás se retira."
              : "Lo que se deja queda para la apertura de mañana. Lo demás se retira."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {MONEDAS.map((m) => {
              const q = quedaEn(m);
              const c = deMoneda(arqueo.contado, m);
              const retira = q && q.amount <= c.amount ? subtract(c, q) : null;
              return (
                <Input
                  key={m}
                  surface="tablet"
                  label={`Se deja en ${NOMBRE[m].toLowerCase()}`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={queda[m] ?? ""}
                  disabled={enviando}
                  error={errores[`queda-${m}`] || undefined}
                  hint={retira ? `Se retira ${formatMoneyVE(toMajor(retira), m)}` : undefined}
                  onChange={(e) => {
                    setQueda((x) => ({ ...x, [m]: e.target.value }));
                    setErrores((x) => ({ ...x, [`queda-${m}`]: "" }));
                  }}
                />
              );
            })}
          </div>
        </fieldset>
      </section>

      <aside className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card apaisado:min-h-0 apaisado:overflow-y-auto">
        <h2 className="font-display text-base font-bold text-ink">{tipo === "JORNADA" ? "Cerrar la jornada" : "Cerrar el turno"}</h2>
        {supervision && (
          <Input
            surface="tablet"
            label="Justificación de la diferencia"
            placeholder="Qué pasó con la diferencia"
            value={justificacion}
            maxLength={280}
            disabled={enviando}
            error={errores.justificacion || undefined}
            onChange={(e) => {
              setJustificacion(e.target.value);
              setErrores((x) => ({ ...x, justificacion: "" }));
            }}
          />
        )}
        <CampoAutorizacion
          a={a}
          numero={supervision ? 2 : 1}
          denegado="Tu puesto no puede cerrar turnos."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void sellar()}
        />
        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button surface="pos" variant="primary" className="w-full gap-2" onClick={() => void sellar()} disabled={enviando || a.permiso === "DENEGADO"}>
            <Lock size={17} aria-hidden="true" />
            {enviando ? "Sellando…" : "Sellar con corte Z"}
          </Button>
          <p className="text-[12px] text-ink-3">Después del corte Z el turno no se toca: ni cobros, ni anulaciones, ni otro conteo.</p>
        </div>
      </aside>
    </div>
  );
}

/** «Cuadra», «Sobra 5,00» o «Falta 5,00»: color, icono y texto (§8.2). */
function Diferencia({ d }: { d: Money }) {
  if (d.amount === 0n) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-state-ok">
        <CircleCheckBig size={13} aria-hidden="true" />
        Cuadra
      </span>
    );
  }
  const abs = money(d.amount < 0n ? -d.amount : d.amount, d.currency);
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-state-crit">
      <OctagonAlert size={13} aria-hidden="true" />
      {d.amount > 0n ? "Sobra" : "Falta"} <span className="tnum">{formatMoneyVE(toMajor(abs), abs.currency)}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── 3 · el Z hecho */

function Sellado({ corte, ajeno, onVolver }: { corte: CorteDto; ajeno: boolean; onVolver: () => void }) {
  const c = corte.cierre!;
  const jornada = c.tipo === "JORNADA";
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 md:px-6">
      <section className="flex w-full max-w-xl flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-state-ok-bg text-state-ok">
            <Lock size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-xl font-bold text-ink">{jornada ? "Jornada cerrada" : "Turno sellado"}</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              Corte Z de {corte.turno.punto}, firmado por {c.firmadoPor}
              {c.autorizadoPor ? ` y autorizado por ${c.autorizadoPor}` : ""}. Ya no se puede cobrar ni anular en este turno.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Ventas</dt>
            <dd className="mt-0.5 flex items-baseline gap-2">
              <MoneyDisplay value={toMajor(aDinero(corte.ventas.total))} currency="USD" size="md" />
              <span className="tnum text-ink-3">{corte.ventas.cantidad}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Diferencia</dt>
            <dd className="mt-0.5">
              {corte.arqueo?.diferenciaEnDolares ? <MoneyDisplay value={toMajor(aDinero(corte.arqueo.diferenciaEnDolares))} currency="USD" size="md" /> : <span className="text-ink-3">Sin medir</span>}
            </dd>
          </div>
          {c.retirado.map((r) => (
            <div key={`r-${r.currency}`}>
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Se retira en {r.currency === "USD" ? "dólares" : "bolívares"}</dt>
              <dd className="mt-0.5">
                <MoneyDisplay value={toMajor(aDinero(r))} currency={r.currency} size="md" />
              </dd>
            </div>
          ))}
          {c.quedaEnGaveta.map((q) => (
            <div key={`q-${q.currency}`}>
              <dt className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Queda en {q.currency === "USD" ? "dólares" : "bolívares"}</dt>
              <dd className="mt-0.5">
                <MoneyDisplay value={toMajor(aDinero(q))} currency={q.currency} size="md" />
              </dd>
            </div>
          ))}
        </dl>
        {corte.id && <TicketDelCorte corteId={corte.id} />}
        {ajeno || jornada ? (
          <Link
            href={"/panel" as Route}
            className="inline-flex min-h-14 items-center justify-center rounded-[var(--radius-control)] bg-brand px-4 font-semibold text-on-brand"
          >
            Ir a Inicio
          </Link>
        ) : (
          <Button surface="pos" variant="primary" className="w-full" onClick={onVolver}>
            Abrir el turno de quien entra
          </Button>
        )}
      </section>
    </div>
  );
}
