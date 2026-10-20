"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Baby, CalendarX2, CircleCheckBig, Clock3, FileText, Monitor, ReceiptText, RefreshCw, TriangleAlert } from "lucide-react";
import type { PendientesDelCierreDto, Rechazo } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { can } from "@l2/domain-identity";
import { Button, Dialog, Input, MoneyDisplay, avisar, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { leerPendientesDelCierre } from "./cortes.acciones";
import { marcarIncobrable } from "../cuentas/cuentas.acciones";
import { nombreDeEstancia } from "../park/view-model.ts";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { esMesaDelCumpleanos, nombreDeCuenta, pasarACaja } from "../cuentas/cuentas.ts";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { MarcarDeudaDialog } from "../deudas/MarcarDeudaDialog.tsx";

/**
 * Lo que impide cerrar la jornada — JORNADA §5, C2, B3-5.
 *
 * Cuentas por cobrar, niños en sala, estancias huérfanas, turnos de otros equipos y lo cargado desde papel
 * sin revisar (B3-7). Cada fila lleva a
 * resolverla (cobrar, registrar la salida, cerrar la huérfana, cerrar ese turno) o, una cuenta que no
 * se va a cobrar, a marcarla incobrable con motivo y 🔐 (D-JOR). No hay «cerrar igual»: el conteo no
 * se ofrece hasta que la lista está vacía.
 *
 * B3-24: la caja de un día anterior la usa como su asistente, con su propio título (de qué día es la caja) y llevando al
 * cierre; el servidor le pasa solo lo de ese día.
 *
 * v0.143.1 (el ticket n.º 3): cada cuenta dice de dónde es, quién la abrió y si pidió la cuenta. Una del salón que nunca
 * la pidió no está en la cola de la caja: «Traer a la caja y cobrar» la pasa a la cola y la abre. Ningún botón queda sin
 * efecto.
 */
/** Cómo se llama una cuenta pendiente: «Mesa 3 · …», «De pie · …» o el nombre de la familia. */
const nombreDePendiente = (c: PendientesDelCierreDto["cuentas"][number]) =>
  nombreDeCuenta({ kind: c.kind, family: c.family, tableLabel: c.mesa, ...(c.dePie ? { dePie: true as const } : {}) });

export function PendientesDelCierre({
  turnoId,
  onListo,
  titulo = "Antes de cerrar la jornada",
  descripcion = "La jornada no se cierra con pendientes: resuelve cada uno y vuelve a comprobar.",
  listo = "Contar la gaveta",
  alerta = false,
  onCobrar,
}: {
  turnoId: string;
  onListo: () => void;
  titulo?: string;
  descripcion?: string;
  /** El botón cuando ya no queda nada. */
  listo?: string;
  /** La caja de un día anterior (B3-24): el título va en rojo, con su icono. */
  alerta?: boolean;
  /** Abrir una cuenta para cobrarla aquí mismo (la caja); sin esto, se va a la caja con ella. */
  onCobrar?: (cuentaId: string) => void;
}) {
  const [p, setP] = useState<PendientesDelCierreDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [incobrable, setIncobrable] = useState<PendientesDelCierreDto["cuentas"][number] | null>(null);
  /** La cuenta cuyo cliente se fue sin pagar (B3-11): queda en deuda a su nombre, no incobrable sin más. */
  const [seFue, setSeFue] = useState<string | null>(null);
  const { cuentas: lasCuentas, adoptar, guardar } = useCuentas();
  const router = useRouter();
  const [trayendo, setTrayendo] = useState<string | null>(null);
  const cuentaQueSeFue = seFue ? (lasCuentas.find((x) => x.id === seFue) ?? null) : null;
  const { ajustes } = useSucursal();
  const reloj = useReloj();
  const vivo = useRef(true);
  // Lo cargado desde papel lo revisa supervisión (B3-7): quien no puede, lo ve pero no lo revisa.
  const actor = useActorEnSesion();
  const puedeRevisar = actor ? can(actor, "papel.revisar") !== "DENEGADO" : false;

  const leer = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await leerPendientesDelCierre(turnoId);
      if (!vivo.current) return;
      if (r.ok) setP(r.valor);
      else setError(r.mensaje);
    } catch {
      if (vivo.current) setError("Sin conexión con el servidor: no se pudo comprobar qué queda pendiente.");
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [turnoId]);

  useEffect(() => {
    vivo.current = true;
    void leer();
    return () => {
      vivo.current = false;
    };
  }, [leer]);
  // En vivo (B5-1): se cobra una cuenta, sale un niño o se cierra otro turno en cualquier equipo, y
  // la lista se comprueba otra vez sola.
  useAlCambiar(["cuentas", "sala", "turno", "papel"], () => void leer());

  const total = p ? p.cuentas.length + p.ninos.length + p.huerfanas.length + p.turnos.length + p.papel.length : 0;
  const hora = (iso: string) => formatClock(Date.parse(iso), ajustes.formatoHora, ajustes.zonaHoraria);

  /** Abre la cuenta para cobrarla: aquí mismo si la caja lo permite; si no, en la caja. */
  const irACobrar = (id: string) => (onCobrar ? onCobrar(id) : router.push(`/caja?cuenta=${id}` as Route));

  /**
   * Una cuenta del salón que no pidió la cuenta (v0.143.1): se pasa a la cola, como «Pide la cuenta», y se abre para
   * cobrarla. Sin nada que cobrar, se dice: se libera, no se cobra.
   */
  async function traerYCobrar(id: string) {
    const cuenta = lasCuentas.find((x) => x.id === id);
    if (!cuenta) return irACobrar(id);
    const lista = pasarACaja(cuenta);
    if (lista.status !== "POR_COBRAR") {
      avisar.error(`${nombreDeCuenta(cuenta)} no tiene nada que cobrar: se libera desde Mesas.`);
      return;
    }
    setTrayendo(id);
    const r = await guardar(lista).catch(() => null);
    setTrayendo(null);
    if (!r) return avisar.error("Sin conexión con el servidor: la cuenta no pasó a la caja.");
    if (!r.ok) return avisar.error(r.mensaje);
    avisar.info(`${nombreDeCuenta(cuenta)} pasó a la cola de la caja`, { detalle: "Como si hubiera pedido la cuenta. Cóbrala aquí." });
    irACobrar(id);
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto p-4 md:px-6">
      <section className="flex w-full max-w-3xl flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={cn("flex items-center gap-2 font-display text-lg font-bold", alerta ? "text-state-crit" : "text-ink")} {...(alerta ? { role: "alert" } : {})}>
              {alerta && <CalendarX2 size={19} className="shrink-0" aria-hidden="true" />}
              {titulo}
            </h2>
            <p className="mt-1 text-[13px] text-ink-2">{descripcion}</p>
          </div>
          <Button surface="tablet" variant="neutral" className="gap-1.5" onClick={() => void leer()} disabled={cargando}>
            <RefreshCw size={15} aria-hidden="true" className={cn(cargando && "animate-spin")} />
            Volver a comprobar
          </Button>
        </div>

        {error ? (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[13px] text-state-crit">
            {error}
          </p>
        ) : !p ? (
          <p role="status" className="text-[13px] text-ink-3">
            Comprobando qué queda pendiente…
          </p>
        ) : total === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-state-ok">
              <CircleCheckBig size={17} aria-hidden="true" />
              Nada pendiente: sin cuentas por cobrar, sin niños en sala, sin otros turnos abiertos y sin cargas desde papel por revisar.
            </p>
            <Button surface="pos" variant="primary" onClick={onListo}>
              {listo}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {p.cuentas.length > 0 && (
              <Grupo icono={<ReceiptText size={15} aria-hidden="true" />} titulo="Cuentas por cobrar" n={p.cuentas.length}>
                {p.cuentas.map((c) => {
                  const completa = lasCuentas.find((x) => x.id === c.id);
                  // Del salón: una mesa, una de pie o un cumpleaños con su mesa. Si no pidió la cuenta, no está en la cola.
                  const delSalon = c.kind === "MESA" || c.dePie || (completa ? esMesaDelCumpleanos(completa) : false);
                  const sinPedir = delSalon && c.status === "ABIERTA";
                  // Sin nada que cobrar no se trae a la caja: se libera en Mesas.
                  const sinNada = BigInt(c.pendiente.minor) === 0n;
                  return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <span className="tnum w-14 shrink-0 font-semibold text-ink">#{String(c.orderNumber).padStart(4, "0")}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{nombreDePendiente(c)}</span>
                    <MoneyDisplay value={toMajor(money(BigInt(c.pendiente.minor), "USD"))} currency="USD" size="sm" />
                    {/* v0.143.1: de dónde es, quién la abrió y si pidió la cuenta. */}
                    <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 pl-[4.25rem] text-detalle text-ink-2">
                      {sinPedir ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-state-warn-bg px-2 py-0.5 font-semibold text-state-warn">
                          <TriangleAlert className="size-(--icono-etiqueta)" aria-hidden="true" />
                          No pidió la cuenta
                        </span>
                      ) : delSalon ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold">Pidió la cuenta</span>
                      ) : null}
                      <span>
                        {[c.abierta ? `Abierta por ${c.abierta.por} a las ${hora(c.abierta.en)}` : null, c.ultimoPedido ? `último pedido a las ${hora(c.ultimoPedido)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex w-full flex-wrap justify-end gap-2">
                      {sinPedir && sinNada ? (
                        <span className="self-center text-detalle text-ink-3">Nada que cobrar: se libera en Mesas</span>
                      ) : sinPedir ? (
                        <Button surface="tablet" variant="primary" disabled={trayendo === c.id} onClick={() => void traerYCobrar(c.id)}>
                          {trayendo === c.id ? "Pasando a la caja…" : "Traer a la caja y cobrar"}
                        </Button>
                      ) : (
                        <Button surface="tablet" variant="neutral" onClick={() => irACobrar(c.id)}>
                          Cobrar
                        </Button>
                      )}
                      {(c.kind === "MESA" || c.kind === "MOSTRADOR") && lasCuentas.some((x) => x.id === c.id) && (
                        <Button surface="tablet" variant="neutral" onClick={() => setSeFue(c.id)} title="Queda en deuda a nombre de su cliente: se cobra cuando vuelva">
                          Se fue sin pagar
                        </Button>
                      )}
                      <Button surface="tablet" variant="neutral" onClick={() => setIncobrable(c)}>
                        Incobrable
                      </Button>
                    </span>
                  </li>
                  );
                })}
              </Grupo>
            )}
            {p.ninos.length > 0 && (
              <Grupo icono={<Baby size={15} aria-hidden="true" />} titulo="Niños en sala" n={p.ninos.length}>
                {p.ninos.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink">{nombreDeEstancia(s)}</span>
                      <span className="text-ink-3"> · {s.guardianName} · desde {hora(s.startedAt)}</span>
                    </span>
                    <Link
                      href={`/monitor?salida=${encodeURIComponent(s.wristbandCode)}` as Route}
                      className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink hover:border-line-strong"
                    >
                      Registrar la salida
                    </Link>
                  </li>
                ))}
              </Grupo>
            )}
            {p.huerfanas.length > 0 && (
              <Grupo icono={<Clock3 size={15} aria-hidden="true" />} titulo="Estancias huérfanas" n={p.huerfanas.length}>
                {p.huerfanas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink">{nombreDeEstancia(s)}</span>
                      <span className="text-ink-3"> · {s.guardianName} · abierta desde {reloj.diaNumerico(Date.parse(s.startedAt))}</span>
                    </span>
                    <Link
                      href={"/monitor" as Route}
                      className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink hover:border-line-strong"
                    >
                      Cerrarla en la sala
                    </Link>
                  </li>
                ))}
              </Grupo>
            )}
            {p.turnos.length > 0 && (
              <Grupo icono={<Monitor size={15} aria-hidden="true" />} titulo="Turnos abiertos en otros equipos" n={p.turnos.length}>
                {p.turnos.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink">{t.punto}</span>
                      <span className="text-ink-3">
                        {" "}
                        · {t.abiertoPor.name} · día {t.businessDate.split("-").reverse().join("/")}, {hora(t.abiertoEn)}
                      </span>
                    </span>
                    <Link
                      href={`/turno?turno=${t.id}` as Route}
                      className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink hover:border-line-strong"
                    >
                      Cerrar ese turno
                    </Link>
                  </li>
                ))}
              </Grupo>
            )}
            {p.papel.length > 0 && (
              <Grupo icono={<FileText size={15} aria-hidden="true" />} titulo="Cargas desde papel sin revisar" n={p.papel.length}>
                {p.papel.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-ink">{c.punto}</span>
                      <span className="text-ink-3">
                        {" "}
                        · cargó {c.abiertaPor} · {c.registros} {c.registros === 1 ? "registro" : "registros"} · corte de {reloj.diaYHora(Date.parse(c.desde))} a {hora(c.hasta)}
                        {c.estado === "ABIERTA" ? " · todavía cargando" : " · esperando a supervisión"}
                      </span>
                    </span>
                    <Link
                      href={"/papel" as Route}
                      className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink hover:border-line-strong"
                    >
                      {c.estado === "ABIERTA" ? "Terminar la carga" : puedeRevisar ? "Revisarla" : "Ver la carga"}
                    </Link>
                  </li>
                ))}
              </Grupo>
            )}
            <p className="text-[12px] text-ink-3">Un turno de otro equipo lo cierra supervisión, con su arqueo, desde este o cualquier equipo. Lo cargado desde papel lo revisa supervisión contra las hojas.</p>
          </div>
        )}
      </section>
      <MarcarDeudaDialog
        cuenta={cuentaQueSeFue}
        onCerrar={() => setSeFue(null)}
        onHecha={(r) => {
          setSeFue(null);
          adoptar(r.cuenta);
          void leer();
        }}
      />
      <IncobrableDialog
        cuenta={incobrable}
        onCerrar={() => setIncobrable(null)}
        onHecho={() => {
          setIncobrable(null);
          void leer();
        }}
      />
    </div>
  );
}

function Grupo({ icono, titulo, n, children }: { icono: React.ReactNode; titulo: string; n: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-state-warn uppercase">
        {icono}
        {titulo}
        <span className="tnum text-ink-3">{n}</span>
      </h3>
      <ul className="mt-1 flex flex-col divide-y divide-line/60 text-[13px]">{children}</ul>
    </div>
  );
}

const MOTIVOS = [
  { id: "SE_FUE_SIN_PAGAR", texto: "Se fue sin pagar" },
  { id: "NO_PUEDE_PAGAR", texto: "No puede pagar" },
  { id: "OTRO", texto: "Otro (explicar)" },
] as const;

/** Marcar incobrable una cuenta pendiente (D-JOR): con motivo y la 🔐 de supervisión. Nada se borra. */
function IncobrableDialog({
  cuenta,
  onCerrar,
  onHecho,
}: {
  cuenta: PendientesDelCierreDto["cuentas"][number] | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number]["id"] | null>(null);
  const [detalle, setDetalle] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const [clave, setClave] = useState("");
  const a = useAutorizacion("cuenta.incobrable", cuenta !== null);

  // Cada cuenta abre el formulario limpio, con su clave. Derivado en el render, sin efecto.
  if ((cuenta?.id ?? null) !== para) {
    setPara(cuenta?.id ?? null);
    setMotivo(null);
    setDetalle("");
    setErrores({});
    setClave(crypto.randomUUID());
  }
  if (!cuenta) return null;

  async function confirmar() {
    if (!cuenta || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    if (!motivo) nuevos.motivo = "Elige el motivo";
    if (motivo === "OTRO" && detalle.trim().length < 3) nuevos.detalle = "Explica por qué no se cobra";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    const texto = MOTIVOS.find((m) => m.id === motivo)!.texto;
    setEnviando(true);
    const r = await marcarIncobrable(
      { idempotencyKey: clave, accountId: cuenta.id, version: cuenta.version, motivo, ...(detalle.trim() ? { detalle: detalle.trim() } : {}) },
      a.autorizacion(`${texto}${detalle.trim() ? ` · ${detalle.trim()}` : ""}`),
    ).catch((): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la cuenta sigue pendiente." }));
    setEnviando(false);
    if (r.ok) {
      avisar.ok(`Cuenta #${String(cuenta.orderNumber).padStart(4, "0")} marcada incobrable`);
      onHecho();
      return;
    }
    const e = erroresDeRechazo(r.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Marcar incobrable"
      descripcion="La cuenta deja de estar pendiente y sale en las excepciones del día. Lo que se debía queda anotado: nada se borra."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Marcando…" : "Marcar incobrable"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius-control)] border border-line p-3">
          <span>
            <span className="tnum font-semibold text-ink">#{String(cuenta.orderNumber).padStart(4, "0")}</span>
            <span className="text-ink-2"> · {nombreDePendiente(cuenta)}</span>
          </span>
          <MoneyDisplay value={toMajor(money(BigInt(cuenta.pendiente.minor), "USD"))} currency="USD" />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Motivo</legend>
          <div role="radiogroup" aria-label="Motivo" className="grid grid-cols-3 gap-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={motivo === m.id}
                onClick={() => {
                  setMotivo(m.id);
                  setErrores((e) => ({ ...e, motivo: "" }));
                }}
                className={cn(
                  "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-left text-[13px] leading-tight transition-colors",
                  motivo === m.id ? "border-brand bg-brand/20 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {m.texto}
              </button>
            ))}
          </div>
          {errores.motivo && <p className="text-[12px] text-state-crit">{errores.motivo}</p>}
          <Input
            label={motivo === "OTRO" ? "Explicación (obligatoria)" : "Detalle (opcional)"}
            surface="tablet"
            value={detalle}
            maxLength={200}
            onChange={(e) => {
              setDetalle(e.target.value);
              setErrores((x) => ({ ...x, detalle: "" }));
            }}
            error={errores.detalle || undefined}
          />
        </fieldset>
        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede dar cuentas por incobrables."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
