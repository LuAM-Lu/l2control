"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarClock, CircleCheckBig, FileText, Laptop, Lock, TriangleAlert, Wallet } from "lucide-react";
import type { ComprobacionAperturaDto, CorteDto, MoneyDto, Rechazo, ReservaEventoDto, Resultado, TipoDeCierre, TurnoDto } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { money, toMajor, type CurrencyCode } from "@l2/domain-money";
import { Badge, Button, Container, Dialog, Input, MoneyDisplay, Sheet, avisar, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { CierreTurno } from "./CierreTurno.tsx";
import { EntradasPorMedio, consumoDelPersonal, porMedioDelLibro } from "./EntradasPorMedio.tsx";
import { ExcepcionesTurno } from "./ExcepcionesTurno.tsx";
import { abrirTurno } from "./turno.acciones";
import { hacerCorteX, leerPendientesDelCierre, leerVistaDelTurno } from "./cortes.acciones";
import { importeTecleado } from "./importe.ts";
import { VentasDelTurno } from "./VentasDelTurno.tsx";
import { useVentas } from "./VentasProvider.tsx";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";
import { TarjetaEventosDeHoy } from "../eventos/AvisoEventosDeHoy.tsx";

/**
 * El turno de caja — F4-01, F4-05 a F4-08, JORNADA §3 a §5, B3-1 y B3-5.
 *
 *  · **Sin turno**, la apertura: el fondo por moneda, lo que falta para trabajar (tasa, impuestos,
 *    medios, tarifario) y, antes que nada, los turnos que quedaron abiertos en otros equipos.
 *  · **Con turno**, una sola sección (M-13): el resumen del libro (fondo, lo cobrado por medio, las
 *    excepciones), las ventas del turno y, al pie, «Cerrar la caja» (B3-15: la última que se cierra cierra el día), que
 *    llevan al arqueo a ciegas y al corte Z (`CierreTurno`).
 *  · **El de otro equipo** (`?turno=`), para supervisión: la cajera se fue o el equipo falló.
 *
 * Todo lo que se enseña del turno sale del servidor: la pantalla no suma cobros ni adivina la gaveta.
 */
export function TurnoScreen({
  turno,
  vista,
  ajeno = false,
  comprobacion = null,
  otrosAbiertos = [],
  ultimoZ = null,
  eventosHoy = [],
}: {
  /** El turno del equipo (o el ajeno que se cierra); `null` si no hay ninguno abierto. */
  turno: TurnoDto | null;
  /** Cómo va el turno según el libro, o el rechazo del servidor. */
  vista: Resultado<CorteDto> | null;
  ajeno?: boolean;
  /** Lo que falta para trabajar (solo sin turno). */
  comprobacion?: ComprobacionAperturaDto | null;
  /** Turnos abiertos en otros equipos: lo que quedó de antes se enseña antes que nada. */
  otrosAbiertos?: readonly TurnoDto[];
  /** El último corte Z de este equipo, para decir cómo quedó. */
  ultimoZ?: CorteDto | null;
  /** Los cumpleaños de hoy (B10-1): la apertura avisa «Hoy hay un evento». */
  eventosHoy?: readonly ReservaEventoDto[];
}) {
  if (ajeno) {
    if (!vista?.ok || !turno) return <SinTurnoAjeno mensaje={vista && !vista.ok ? vista.mensaje : "Ese turno no existe."} />;
    if (turno.estado === "CERRADO_Z") return <SinTurnoAjeno mensaje="Ese turno ya tiene su corte Z: está cerrado." />;
    return <TurnoAbierto turno={turno} vistaInicial={vista.valor} ajeno />;
  }
  if (!turno) return <AperturaTurno comprobacion={comprobacion} otrosAbiertos={otrosAbiertos} ultimoZ={ultimoZ} eventosHoy={eventosHoy} />;
  return <TurnoAbierto turno={turno} vistaInicial={vista?.ok ? vista.valor : null} ajeno={false} />;
}

/* ────────────────────────────────────────────────────────────── la apertura */

/** Abrir el turno (F4-01): el fondo de la gaveta por moneda y la comprobación (JORNADA §3, A2-A3). */
function AperturaTurno({
  comprobacion,
  otrosAbiertos,
  ultimoZ,
  eventosHoy,
}: {
  comprobacion: ComprobacionAperturaDto | null;
  otrosAbiertos: readonly TurnoDto[];
  ultimoZ: CorteDto | null;
  eventosHoy: readonly ReservaEventoDto[];
}) {
  const router = useRouter();
  const actor = useActorEnSesion();
  const veSucursal = actor ? can(actor, "reportes.verSucursal") !== "DENEGADO" : false;
  const { ajustes } = useSucursal();
  // Lo que dejó el último corte de este equipo es el fondo que se recibe: se propone, se cuenta igual.
  const dejado = (m: "USD" | "VES") => {
    const q = ultimoZ?.cierre?.quedaEnGaveta.find((x) => x.currency === m);
    return q && q.minor !== "0" ? toMajor(money(BigInt(q.minor), m)).replace(".", ",") : "";
  };
  const [usd, setUsd] = useState(() => dejado("USD"));
  const [bs, setBs] = useState(() => dejado("VES"));
  const [errores, setErrores] = useState<{ USD?: string | undefined; VES?: string | undefined }>({});
  const [enviando, setEnviando] = useState(false);
  // B3-9 (M-31): fuera del punto de cobro, el turno se abre con el PIN de administración y un motivo.
  const fuera = comprobacion !== null && !comprobacion.puntoDeCobro.esEste;
  const autorizacion = useAutorizacion("turno.abrirFueraDelPunto", fuera);
  const [motivo, setMotivo] = useState("");
  const [erroresFuera, setErroresFuera] = useState<{ motivo?: string; autorizador?: string; pin?: string }>({});
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: ajustes.zonaHoraria });
  const deAntes = otrosAbiertos.filter((t) => t.businessDate < hoy);

  const abrir = async (e: React.FormEvent) => {
    e.preventDefault();
    const fondoUsd = importeTecleado(usd, "USD");
    const fondoBs = importeTecleado(bs, "VES");
    if (!fondoUsd || !fondoBs) {
      setErrores({
        ...(fondoUsd ? {} : { USD: "Un importe en dólares, con hasta dos decimales" }),
        ...(fondoBs ? {} : { VES: "Un importe en bolívares, con hasta dos decimales" }),
      });
      return;
    }
    if (fuera) {
      const falta = { ...(motivo.trim().length < 3 ? { motivo: "Di por qué se abre aquí: «La laptop de caja no enciende»" } : {}), ...(autorizacion.falta() ?? {}) };
      setErroresFuera(falta);
      if (Object.keys(falta).length > 0) return;
    }
    setEnviando(true);
    try {
      const r = await abrirTurno(
        { fondos: [fondoUsd, fondoBs].map((f) => ({ currency: f.currency, amount: { minor: String(f.amount), currency: f.currency } })) },
        fuera ? autorizacion.autorizacion(motivo.trim()) : undefined,
      );
      if (r.ok) {
        avisar.ok(`Turno abierto en ${r.valor.punto}: ya se puede cobrar`, r.valor.fueraDelPunto ? { detalle: `Fuera del punto de cobro, autorizado por ${r.valor.fueraDelPunto.autorizadoPor}.` } : undefined);
        // Abierto, a cobrar (B3-13, M-34): lo siguiente que se hace con un turno abierto es la caja.
        router.push("/caja" as Route);
      } else if (fuera && /PIN|autorizar/i.test(r.mensaje)) {
        // Lo del PIN o de quién autoriza, junto al PIN: el aviso suelto se perdería.
        setErroresFuera(erroresDeRechazo(r.mensaje));
        autorizacion.borrarPin();
      } else {
        avisar.error(r.mensaje);
        // Otro toque ya lo abrió (o se abrió en otra pestaña): se enseña el que hay.
        if (r.motivo === "CONFLICTO") router.refresh();
      }
    } catch {
      avisar.error("No se pudo hablar con el servidor. El turno no se abrió.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Container ancho="operacion" className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto py-6 apaisado:flex-row apaisado:items-start apaisado:justify-center">
      <form
        onSubmit={abrir}
        className="flex w-full max-w-md shrink-0 flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card apaisado:bajo:gap-3 apaisado:bajo:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/20 text-brand">
            <Wallet size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Abrir el turno</h1>
            <p className="mt-1 text-[13.5px] text-ink-2">Cuenta el fondo que hay en la gaveta antes de empezar. Sin turno abierto, la caja no cobra.</p>
          </div>
        </div>
        <div className={cn("flex flex-col gap-4 apaisado:bajo:gap-3", fuera && "grid grid-cols-2 gap-3")}>
        <Input
          surface="pos"
          label="Fondo en dólares"
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          value={usd}
          error={errores.USD}
          onChange={(e) => {
            setUsd(e.target.value);
            setErrores((x) => ({ ...x, USD: undefined }));
          }}
        />
        <Input
          surface="pos"
          label="Fondo en bolívares"
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          value={bs}
          error={errores.VES}
          hint={fuera ? undefined : ultimoZ?.cierre ? "Propuesto: lo que dejó el último corte de este equipo. Cuéntalo igual." : "Vacío o cero si se empieza sin cambio."}
          onChange={(e) => {
            setBs(e.target.value);
            setErrores((x) => ({ ...x, VES: undefined }));
          }}
        />
        </div>
        {fuera && (
          <>
            <Input
              surface="tablet"
              label="Por qué se abre aquí"
              placeholder="La laptop de caja no enciende"
              autoComplete="off"
              maxLength={280}
              value={motivo}
              error={erroresFuera.motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErroresFuera(({ motivo: _, ...resto }) => resto);
              }}
            />
            <CampoAutorizacion
              a={autorizacion}
              denegado="Tu puesto no abre turnos fuera del punto de cobro."
              sinAutorizadores="No hay nadie de administración activo que pueda autorizarlo."
              errores={erroresFuera}
              deshabilitado={enviando}
              onConfirmar={() => document.getElementById("abrir-turno")?.click()}
            />
          </>
        )}
        <Button id="abrir-turno" type="submit" surface="pos" variant="primary" className="w-full text-base" disabled={enviando || (fuera && autorizacion.permiso === "DENEGADO")}>
          {enviando ? "Abriendo…" : fuera ? "Abrir turno con autorización" : "Abrir turno"}
        </Button>
        <p className="text-[12px] text-ink-3">
          {fuera ? "Queda en la auditoría, con quién lo autorizó, e Inicio lo avisa mientras siga abierto." : "El turno queda a tu nombre, en este equipo y con el día de hoy como día de negocio."}
        </p>
      </form>

      <div className="flex w-full max-w-md flex-col gap-4">
        {fuera && comprobacion && <AvisoFueraDelPunto puntos={comprobacion.puntoDeCobro.puntos} />}
        {comprobacion?.jornadaSinCerrar && <AvisoDiaSinCerrar dia={comprobacion.jornadaSinCerrar} />}
        <TarjetaEventosDeHoy reservas={eventosHoy} />
        {deAntes.length > 0 && (
          <section className="rounded-[var(--radius-card)] border border-state-warn/40 bg-state-warn-bg p-4">
            <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-state-warn">
              <TriangleAlert size={15} aria-hidden="true" />
              {deAntes.length === 1 ? "Quedó un turno abierto de un día anterior" : `Quedaron ${deAntes.length} turnos abiertos de días anteriores`}
            </h2>
            <ul className="mt-2 flex flex-col gap-2 text-[13px]">
              {deAntes.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-ink-2">
                    <span className="font-semibold text-ink">{t.punto}</span> · {t.abiertoPor.name} · {t.businessDate.split("-").reverse().join("/")}
                  </span>
                  {veSucursal && (
                    <Link href={`/turno?turno=${t.id}` as Route} className="inline-flex min-h-12 items-center rounded-[var(--radius-control)] border border-line bg-surface px-3 font-semibold text-ink hover:border-line-strong">
                      Cerrarlo
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-ink-2">{veSucursal ? "Ciérralo con su arqueo antes de abrir el nuevo." : "Lo cierra supervisión, con su arqueo, desde cualquier equipo."}</p>
          </section>
        )}

        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
          <h2 className="font-display text-sm font-bold text-ink">Comprobación</h2>
          {!comprobacion ? (
            <p className="mt-1 text-[13px] text-ink-3">No se pudo comprobar la configuración.</p>
          ) : comprobacion.faltan.length === 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-state-ok">
              <CircleCheckBig size={15} aria-hidden="true" />
              Listo para cobrar: tasa, impuestos, medios y tarifario al día.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {comprobacion.faltan.map((f) => (
                <li key={f.que} className="flex items-start gap-2 text-[13px]">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0 text-state-warn" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{f.mensaje}</span>
                    <span className="block text-[12px] text-ink-2">Sin esto no se puede: {f.bloquea.toLowerCase()}.</span>
                    {f.enlace && veSucursal && (
                      <Link href={f.enlace as Route} className="text-[12px] font-semibold text-brand underline-offset-2 hover:underline">
                        Arreglarlo
                      </Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ultimoZ?.cierre && (
          <p className="px-1 text-[12px] text-ink-3">
            Último corte Z de este equipo: {ultimoZ.cierre.firmadoPor}, {formatClock(Date.parse(ultimoZ.hechoEn), ajustes.formatoHora, ajustes.zonaHoraria)} del{" "}
            {ultimoZ.turno.businessDate.split("-").reverse().join("/")}.
          </p>
        )}
      </div>
    </Container>
  );
}

/**
 * Este equipo no es el punto de cobro (B3-9, M-31): se dice cuál lo es y qué hacer. Abrir aquí es la salida de emergencia
 * cuando el punto falla, no la manera de trabajar.
 */
/**
 * B3-15: un día que quedó sin cerrar (sus cajas se cerraron como relevo sin que nadie siguiera, antes de la 0.105.0). Lo
 * que dejó pendiente se resuelve al cerrar el turno que se abre ahora: será la última caja y cerrará el día.
 */
function AvisoDiaSinCerrar({ dia }: { dia: NonNullable<ComprobacionAperturaDto["jornadaSinCerrar"]> }) {
  const partes = [
    dia.cuentas > 0 ? `${dia.cuentas} ${dia.cuentas === 1 ? "cuenta abierta" : "cuentas abiertas"}` : null,
    dia.ninos > 0 ? `${dia.ninos} ${dia.ninos === 1 ? "niño en sala" : "niños en sala"}` : null,
  ].filter(Boolean);
  return (
    <section role="note" className="rounded-[var(--radius-card)] border border-state-warn/40 bg-state-warn-bg p-4">
      <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-state-warn">
        <TriangleAlert size={15} aria-hidden="true" />
        La jornada del {diaEnPalabras(dia.dia)} sigue abierta
      </h2>
      <p className="mt-1.5 text-[13px] text-ink-2">
        {partes.length > 0 ? `Quedó con ${partes.join(" y ")}. ` : ""}Al cerrar la última caja de hoy se cierra también: resuelve lo
        pendiente (cobrar, incobrable o anular) antes.
      </p>
    </section>
  );
}

function AvisoFueraDelPunto({ puntos }: { puntos: readonly string[] }) {
  return (
    <section role="note" className="rounded-[var(--radius-card)] border border-state-warn/40 bg-state-warn-bg p-4">
      <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-state-warn">
        <Laptop size={15} aria-hidden="true" />
        Este equipo no es el punto de cobro
      </h2>
      <p className="mt-1.5 text-[13px] text-ink-2">
        {puntos.length === 0
          ? "Ningún equipo está marcado como punto de cobro: administración lo marca en Ajustes → Personas y equipos → Dispositivos."
          : `El turno se abre en ${puntos.length === 1 ? `«${puntos[0]}»` : puntos.map((p) => `«${p}»`).join(", ")}.`}{" "}
        Si falló, administración autoriza abrirlo aquí con su PIN y el motivo.
      </p>
    </section>
  );
}

function SinTurnoAjeno({ mensaje }: { mensaje: string }) {
  return (
    <Container ancho="operacion" className="flex min-h-0 flex-1 items-start justify-center py-8">
      <section className="flex w-full max-w-md flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card">
        <h1 className="font-display text-lg font-bold text-ink">No se puede abrir ese turno</h1>
        <p role="alert" className="text-[13.5px] text-state-crit">
          {mensaje}
        </p>
        <Link href={"/panel" as Route} className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-control)] border border-line px-4 font-semibold text-ink hover:border-line-strong">
          Ir a Inicio
        </Link>
      </section>
    </Container>
  );
}

/* ──────────────────────────────────────────────────────────── el turno abierto */

function TurnoAbierto({ turno, vistaInicial, ajeno }: { turno: TurnoDto; vistaInicial: CorteDto | null; ajeno: boolean }) {
  const router = useRouter();
  const { ajustes } = useSucursal();
  // B3-15: el cierre no se elige. Al pedirlo se pregunta al servidor si quedan otras cajas abiertas: con alguna, se cierra
  // esta; si es la última, es el cierre del día.
  const [cierre, setCierre] = useState<{ tipo: TipoDeCierre; otras: string[] } | null>(null);
  const [decidiendo, setDecidiendo] = useState(false);
  const vista = useVistaDelTurno(turno.id, vistaInicial, ajeno);
  async function pedirCierre() {
    setDecidiendo(true);
    const r = await leerPendientesDelCierre(ajeno ? turno.id : undefined).catch(() => null);
    setDecidiendo(false);
    if (!r || !r.ok) {
      avisar.error(r?.mensaje ?? "Sin conexión con el servidor: la caja sigue abierta. Vuelve a intentarlo.");
      return;
    }
    const otras = r.valor.turnos.map((t) => t.punto);
    setCierre({ tipo: otras.length > 0 ? "RELEVO" : "JORNADA", otras });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-line">
        <Container ancho="muro" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 apaisado:bajo:py-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-xl leading-none font-bold tracking-tight text-ink">
              {cierre?.tipo === "JORNADA" ? "Cerrar el día" : cierre && ajeno ? `Cerrar la caja de ${turno.punto}` : cierre ? "Cerrar esta caja" : ajeno ? `Turno de ${turno.punto}` : "Turno de caja"}
            </h1>
            <p className="tnum flex items-center gap-1.5 text-[13px] text-ink-3">
              <CalendarClock size={14} aria-hidden="true" />
              Día de negocio {diaEnPalabras(turno.businessDate)} · {turno.punto} · abierto por {turno.abiertoPor.name} a las{" "}
              {formatClock(Date.parse(turno.abiertoEn), ajustes.formatoHora, ajustes.zonaHoraria)}
            </p>
          </div>
          {cierre ? (
            <Button surface="tablet" variant="neutral" className="gap-1.5" onClick={() => setCierre(null)}>
              <ArrowLeft size={16} aria-hidden="true" />
              Volver al turno
            </Button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {/* B3-9: abierto fuera del punto de cobro, con quién lo autorizó y por qué. */}
              {turno.fueraDelPunto && (
                <span title={`Autorizó ${turno.fueraDelPunto.autorizadoPor}: «${turno.fueraDelPunto.motivo}»`}>
                  <Badge tone="warn" icon={<TriangleAlert size={13} aria-hidden="true" />}>
                    Fuera del punto de cobro
                  </Badge>
                </span>
              )}
              <Badge tone="ok" icon={<CircleCheckBig size={13} aria-hidden="true" />}>
                Abierto
              </Badge>
            </span>
          )}
        </Container>
      </header>

      {cierre ? (
        <CierreTurno
          turno={turno}
          tipo={cierre.tipo}
          otras={cierre.otras}
          ajeno={ajeno}
          onVolver={() => {
            setCierre(null);
            router.refresh();
          }}
        />
      ) : (
        <Container
          as="main"
          ancho="muro"
          className="grid flex-1 gap-4 py-4 apaisado:min-h-0 apaisado:grid-cols-[clamp(260px,22vw,300px)_minmax(0,1fr)] apaisado:grid-rows-[minmax(0,1fr)] apaisado:bajo:py-3"
        >
          <ResumenTurno turno={turno} vista={vista} ajeno={ajeno} decidiendo={decidiendo} onCerrar={() => void pedirCierre()} />
          {ajeno ? (
            <ExcepcionesTurno excepciones={vista?.excepciones ?? []} className="apaisado:min-h-0" />
          ) : (
            <VentasDelTurno className="apaisado:grid-rows-[minmax(0,1fr)]" />
          )}
        </Container>
      )}
    </div>
  );
}

/**
 * La vista del turno según el libro, al día: se vuelve a leer cuando cambian las ventas de este equipo
 * (un cobro, una anulación, una reimpresión) y al volver el foco.
 */
function useVistaDelTurno(turnoId: string, inicial: CorteDto | null, ajeno: boolean): CorteDto | null {
  const [vista, setVista] = useState(inicial);
  const { ventas } = useVentas();
  const huella = ajeno ? "" : ventas.map((v) => `${v.id}:${v.voided ? 1 : 0}:${v.prints.length}`).join("|");
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      void leerVistaDelTurno(ajeno ? turnoId : undefined)
        .then((r) => vivo && r.ok && setVista(r.valor))
        .catch(() => undefined);
    leer();
    const alVolver = () => document.visibilityState === "visible" && leer();
    window.addEventListener("focus", alVolver);
    return () => {
      vivo = false;
      window.removeEventListener("focus", alVolver);
    };
  }, [turnoId, ajeno, huella]);
  return vista;
}

const aDinero = (m: MoneyDto) => money(BigInt(m.minor), m.currency as CurrencyCode);

/**
 * Cómo va el turno: el fondo, lo cobrado por medio y las excepciones, del libro. Al pie, «Cerrar la caja»: el servidor
 * decide si es solo esta caja o el día (B3-15). El corte X, a un toque.
 */
function ResumenTurno({
  turno,
  vista,
  ajeno,
  decidiendo,
  onCerrar,
}: {
  turno: TurnoDto;
  vista: CorteDto | null;
  ajeno: boolean;
  /** Mientras se pregunta al servidor si quedan otras cajas abiertas (B3-15). */
  decidiendo: boolean;
  onCerrar: () => void;
}) {
  const [verExcepciones, setVerExcepciones] = useState(false);
  const [corteX, setCorteX] = useState<CorteDto | null>(null);
  const [haciendoX, setHaciendoX] = useState(false);
  const porMedio = useMemo(() => (vista ? porMedioDelLibro(vista.porMedio) : []), [vista]);
  // El consumo del personal (B3-17) está en las ventas, pero no es dinero: se dice aparte.
  const consumo = vista ? consumoDelPersonal(vista.porMedio) : null;

  const sacarX = async () => {
    setHaciendoX(true);
    const r = await hacerCorteX({ turnoId: turno.id }).catch(
      (): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se hizo el corte X." }),
    );
    setHaciendoX(false);
    if (r.ok) setCorteX(r.valor);
    else avisar.error(r.mensaje);
  };

  return (
    <aside aria-label="Resumen del turno" className="flex min-h-0 min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 apaisado:bajo:gap-3 apaisado:bajo:p-3">
        <section aria-labelledby="resumen-fondo">
          <h2 id="resumen-fondo" className={TITULO}>
            En la gaveta al abrir
          </h2>
          <ul className="mt-1.5 flex flex-col gap-1">
            {turno.fondos.map((f) => (
              <li key={f.currency} className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] text-ink-3">{f.currency === "VES" ? "Bolívares" : "Dólares"}</span>
                <MoneyDisplay value={toMajor(aDinero(f.amount))} currency={f.currency} size="sm" />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="resumen-cobrado">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="resumen-cobrado" className={TITULO}>
              Cobrado{vista ? ` · ${vista.ventas.cantidad - vista.ventas.anuladas} ${vista.ventas.cantidad - vista.ventas.anuladas === 1 ? "venta" : "ventas"}` : ""}
            </h2>
            <Button surface="tablet" variant="ghost" className="gap-1 px-2 text-[13px]" onClick={() => void sacarX()} disabled={haciendoX}>
              <FileText size={13} aria-hidden="true" />
              {haciendoX ? "Haciendo…" : "Corte X"}
            </Button>
          </div>
          {!vista ? (
            <p className="mt-1 text-[12.5px] text-state-crit">No se pudo leer el libro del turno.</p>
          ) : (
            <>
              <MoneyDisplay value={toMajor(aDinero(vista.ventas.total))} currency="USD" size="lg" className="mt-1" />
              {porMedio.length === 0 && !consumo ? (
                <p className="mt-1 text-[12.5px] text-ink-3">Todavía no se ha cobrado nada en este turno.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 border-t border-line/60 pt-2">
                  {porMedio.map((m) => (
                    <li key={`${m.medio}|${m.moneda}`} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] text-ink-2">{m.medio}</span>
                      <MoneyDisplay value={m.total} currency={m.moneda} size="sm" />
                    </li>
                  ))}
                  {vista.ventas.igtf.minor !== "0" && (
                    <li className="flex items-baseline justify-between gap-2 text-ink-3">
                      <span className="text-[12px]">de ello, IGTF</span>
                      <MoneyDisplay value={toMajor(aDinero(vista.ventas.igtf))} currency="USD" size="sm" />
                    </li>
                  )}
                  {consumo && (
                    <li className="flex items-baseline justify-between gap-2 text-ink-3">
                      <span className="text-detalle">de ello, consumo del personal (no entra dinero)</span>
                      <MoneyDisplay value={toMajor(aDinero({ minor: consumo, currency: "USD" }))} currency="USD" size="sm" />
                    </li>
                  )}
                </ul>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="resumen-excepciones">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="resumen-excepciones" className={TITULO}>
              Excepciones
            </h2>
            {vista && vista.excepciones.length > 0 && (
              <Button surface="tablet" variant="ghost" className="px-2 text-[13px]" onClick={() => setVerExcepciones(true)}>
                Ver
              </Button>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {!vista || vista.excepciones.length === 0
              ? "Ninguna: sin anulaciones, cortesías ni reimpresiones."
              : `${vista.excepciones.length} ${vista.excepciones.length === 1 ? "excepción" : "excepciones"}${vista.ventas.anuladas > 0 ? ` · ${vista.ventas.anuladas} ${vista.ventas.anuladas === 1 ? "cobro anulado" : "cobros anulados"}` : ""}`}
          </p>
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t border-line p-3">
        {/* B3-15: un solo cierre. Con otra caja abierta se cierra esta; si es la última, el día (lo dice al abrirlo). */}
        <Button surface="pos" variant="primary" className="w-full gap-2" disabled={decidiendo} onClick={onCerrar}>
          <Lock size={17} aria-hidden="true" />
          {decidiendo ? "Mirando las otras cajas…" : ajeno ? "Cerrar esta caja" : "Cerrar la caja"}
        </Button>
      </div>

      <Sheet abierto={verExcepciones} onCerrar={() => setVerExcepciones(false)} titulo="Excepciones del turno">
        <ExcepcionesTurno excepciones={vista?.excepciones ?? []} sinTitulo className="border-0 p-0 shadow-none" />
      </Sheet>
      <CorteXDialog corte={corteX} onCerrar={() => setCorteX(null)} />
    </aside>
  );
}

/** El corte X: el informe del turno en este momento. Quien ve la sucursal ve también la gaveta. */
function CorteXDialog({ corte, onCerrar }: { corte: CorteDto | null; onCerrar: () => void }) {
  const { ajustes } = useSucursal();
  if (!corte) return null;
  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Corte X"
      descripcion={`${corte.turno.punto} · hecho por ${corte.hechoPor} a las ${formatClock(Date.parse(corte.hechoEn), ajustes.formatoHora, ajustes.zonaHoraria)}. Quedó guardado; el turno sigue abierto.`}
      pie={
        <Button surface="pos" variant="neutral" className="w-full" onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink-2">
            {corte.ventas.cantidad} {corte.ventas.cantidad === 1 ? "venta" : "ventas"}
            {corte.ventas.anuladas > 0 ? ` · ${corte.ventas.anuladas} anuladas` : ""}
          </span>
          <MoneyDisplay value={toMajor(aDinero(corte.ventas.total))} currency="USD" size="lg" />
        </div>
        <EntradasPorMedio porMedio={porMedioDelLibro(corte.porMedio)} titulo="Cobrado por medio" className="border-0 p-0 shadow-none" />
        {corte.gaveta && (
          <section>
            <h3 className={TITULO}>Debería haber en la gaveta</h3>
            <ul className="mt-1.5 flex flex-col gap-1">
              {corte.gaveta.map((g) => (
                <li key={g.currency} className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-ink-2">{g.currency === "VES" ? "Bolívares" : "Dólares"}</span>
                  <MoneyDisplay value={toMajor(aDinero(g.esperado))} currency={g.currency} size="sm" />
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-[12.5px] text-ink-2">
          {corte.excepciones.length === 0 ? "Sin excepciones." : `${corte.excepciones.length} ${corte.excepciones.length === 1 ? "excepción" : "excepciones"} en el turno.`}
        </p>
      </div>
    </Dialog>
  );
}

const TITULO = "text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase";

/** «dom 27 sept»: un día de calendario en palabras. Es fecha, no instante: se pinta en UTC. */
function diaEnPalabras(dia: string): string {
  const partes = new Intl.DateTimeFormat("es-VE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    Date.parse(`${dia}T12:00:00.000Z`),
  );
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value.replace(".", "") ?? "";
  return `${de("weekday")} ${de("day")} ${de("month")}`;
}
