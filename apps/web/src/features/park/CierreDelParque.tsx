"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Cake, CircleCheck, FileText, Footprints, ScanLine, Shirt, TimerReset, TriangleAlert, Users, UserRoundCheck, Ban } from "lucide-react";
import type { AtencionDelCierreDto, CierreDelParqueDto, NinoDelCierreDto, Resultado } from "@l2/contracts";
import { Container, TAMANO_ICONO, cn } from "@l2/ui";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { DocumentoDeInforme, SeccionImpresa, diaDelInforme, enBandas, type SeccionDeInforme } from "../reportes/informe.tsx";
import { duracion } from "../reportes/parque.tsx";
import { leerCierreDelParque } from "./parque.acciones";

/** Lo que pide atención, en palabras y con su tono (color + icono + texto). */
const ATENCION: Readonly<Record<AtencionDelCierreDto["tipo"], { texto: string; tono: "warn" | "crit" | "idle"; Icono: typeof Ban }>> = {
  OTRA_PERSONA: { texto: "Otra persona", tono: "warn", Icono: UserRoundCheck },
  SIN_PULSERA: { texto: "Sin pulsera", tono: "idle", Icono: ScanLine },
  ANULADA: { texto: "Anulada", tono: "crit", Icono: Ban },
  MAS_TIEMPO: { texto: "Más tiempo", tono: "idle", Icono: TimerReset },
  OLVIDADA: { texto: "A revisar", tono: "warn", Icono: Footprints },
};
const TONO: Readonly<Record<"warn" | "crit" | "idle", string>> = {
  warn: "bg-state-warn-bg text-state-warn",
  crit: "bg-state-crit-bg text-state-crit",
  idle: "bg-surface-2 text-ink-2",
};

/** «1:10 pm → 3:14 pm», o «1:10 pm · en la sala». */
function entradaYSalida(n: NinoDelCierreDto, hora: (t: number) => string): string {
  if (n.anulada) return `${hora(Date.parse(n.entrada))} · anulada`;
  return n.salida ? `${hora(Date.parse(n.entrada))} → ${hora(Date.parse(n.salida))}` : `${hora(Date.parse(n.entrada))} · en la sala`;
}

/**
 * El cierre del parque (B4-21, M-40): la jornada de la monitora, en su teléfono, como el corte de la caja y sin montos. Se
 * ve en cualquier momento (un corte del momento) y vuelve a leerse con cada cambio de la sala; «Guardar PDF del cierre»
 * sale con la sala en cero.
 */
export function CierreDelParqueScreen({ inicial }: { inicial: Resultado<CierreDelParqueDto> | null }) {
  const reloj = useReloj();
  const [r, setR] = useState(inicial);
  const releer = useCallback(() => {
    void leerCierreDelParque()
      .then((x) => setR(x))
      .catch(() => undefined);
  }, []);
  useAlCambiar(["sala", "eventos", "catalogo", "cuentas"], releer);

  if (!r || !r.ok) {
    return (
      <Container ancho="operacion" className="py-6">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert className="size-(--icono-texto)" aria-hidden="true" />
          {r ? r.mensaje : "Sin conexión con el servidor: el cierre no se pudo leer."}
        </p>
      </Container>
    );
  }
  const c = r.valor;
  const s = c.resumen;
  const enSala = s.enSala;
  return (
    <Container ancho="operacion" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={"/monitor" as Route} className="inline-flex min-h-8 items-center gap-1 text-detalle font-semibold text-ink-2 hover:text-ink">
            <ArrowLeft className="size-(--icono-texto)" aria-hidden="true" />
            Volver a la sala
          </Link>
          <h1 className="font-display text-pagina font-bold text-ink">Cierre del parque</h1>
          <p className="text-detalle text-ink-3">
            {diaDelInforme(c.dia)} · {c.encabezado.generadoPor}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-detalle font-semibold",
            enSala === 0 ? "bg-state-ok/15 text-state-ok" : "bg-state-warn-bg text-state-warn",
          )}
        >
          {enSala === 0 ? <CircleCheck className="size-(--icono-texto)" aria-hidden="true" /> : <Users className="size-(--icono-texto)" aria-hidden="true" />}
          {enSala === 0 ? "0 en sala" : enSala === 1 ? "1 en sala" : `${enSala} en sala`}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Cifra etiqueta="Niños" valor={String(s.ninos)} />
        <Cifra etiqueta="Familias" valor={String(s.familias)} />
        <Cifra etiqueta="Máximo a la vez" valor={s.pico ? String(s.pico.ninos) : "—"} pie={s.pico ? reloj.hora(Date.parse(s.pico.en)) : undefined} />
        <Cifra etiqueta="Estancia promedio" valor={duracion(s.minutosPromedio)} pie="de los que salieron" />
      </dl>

      {c.atencion.length > 0 && (
        <section aria-label="Pide atención" className="rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
          <h2 className="mb-1.5 text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">Pide atención · {c.atencion.length}</h2>
          <ul className="flex flex-col gap-1.5">
            {c.atencion.map((a, i) => {
              const t = ATENCION[a.tipo];
              return (
                <li key={`${a.en}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-detalle">
                  <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-etiqueta font-semibold", TONO[t.tono])}>
                    <t.Icono className="size-(--icono-etiqueta)" aria-hidden="true" />
                    {t.texto}
                  </span>
                  <span className="min-w-0 flex-1 text-ink-2">
                    <span className="font-semibold text-ink">{a.nino}</span>: {a.detalle}
                  </span>
                  <span className="tnum text-nota text-ink-3">{reloj.hora(Date.parse(a.en))}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="Familias" className="flex flex-col gap-2">
        <h2 className="text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">Familias · {c.familias.length}</h2>
        {c.familias.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-detalle text-ink-3">Todavía no entró nadie hoy.</p>
        ) : (
          c.familias.map((f, i) => (
            <div key={`${f.representante}-${i}`} className="rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 font-semibold text-ink">{f.representante}</span>
                <span className="tnum shrink-0 text-nota text-ink-3" data-privado>
                  {f.telefono}
                </span>
              </div>
              <ul className="mt-1 flex flex-col">
                {f.ninos.map((n, j) => (
                  <li key={`${n.pulsera}-${j}`} className={cn("grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-dashed border-line py-1.5 first:border-t-0", n.anulada && "opacity-60")}>
                    <span className="min-w-0 text-detalle">
                      <span className={cn("font-semibold text-ink", n.anulada && "line-through")}>{n.nombre}</span>
                      <span className="text-ink-3"> · </span>
                      <span className="font-mono text-nota whitespace-nowrap text-ink-2">{n.pulsera}</span>
                    </span>
                    <span className="tnum text-right text-detalle text-ink-2">{entradaYSalida(n, reloj.hora)}</span>
                    <span className="text-nota text-ink-3">
                      {n.paquete}
                      {n.recogio && (
                        <>
                          {" · "}
                          <span className={n.recogio.otro ? "font-semibold text-state-warn" : undefined}>la recogió {n.recogio.nombre}</span>
                        </>
                      )}
                      {n.mesa ? ` · ${n.mesa}` : ""}
                    </span>
                    <span className="tnum text-right text-nota text-ink-3">
                      {n.anulada ? "—" : duracion(n.minutos)}
                      {n.deMas ? <span className="ml-1 font-semibold text-state-warn">+{duracion(n.deMas)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section aria-label="Para cuadrar" className="grid grid-cols-2 gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-card">
        <div>
          <h2 className="flex items-center gap-1 text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <ScanLine className="size-(--icono-etiqueta)" aria-hidden="true" />
            Pulseras
          </h2>
          <p className="tnum font-semibold text-ink">{c.pulseras.usadas === 1 ? "1 usada" : `${c.pulseras.usadas} usadas`}</p>
          {c.pulseras.desde && (
            <p className="font-mono text-nota text-ink-3">{c.pulseras.desde === c.pulseras.hasta ? c.pulseras.desde : `${c.pulseras.desde} a ${c.pulseras.hasta}`}</p>
          )}
        </div>
        <div>
          <h2 className="flex items-center gap-1 text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">
            <Shirt className="size-(--icono-etiqueta)" aria-hidden="true" />
            Medias
          </h2>
          <p className="tnum font-semibold text-ink">{c.medias.pares === 1 ? "1 par" : `${c.medias.pares} pares`}</p>
          {c.medias.quedan !== null && <p className="tnum text-nota text-ink-3">quedan {c.medias.quedan}</p>}
        </div>
        {c.cumpleanos.map((x, i) => (
          <div key={`${x.cumpleanero}-${i}`} className="col-span-2 border-t border-line pt-2">
            <h2 className="flex items-center gap-1 text-etiqueta font-semibold tracking-[0.08em] text-ink-3 uppercase">
              <Cake className="size-(--icono-etiqueta)" aria-hidden="true" />
              Cumpleaños de {x.cumpleanero}
            </h2>
            <p className="tnum text-detalle text-ink">
              {x.reservados} reservados · {x.entraron} {x.entraron === 1 ? "entró" : "entraron"}
            </p>
          </div>
        ))}
      </section>

      {/* El PDF de cierre, con la sala en cero (decidido el 2026-10-19); antes, esto es un corte del momento. */}
      {enSala === 0 ? (
        <Link
          href={"/informes/cierre-del-parque" as Route}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-4 font-semibold text-on-brand transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <FileText className="size-(--icono-texto)" aria-hidden="true" />
          Guardar PDF del cierre
        </Link>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <button type="button" disabled className="inline-flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-4 font-semibold text-ink-3">
            <FileText className="size-(--icono-texto)" aria-hidden="true" />
            Guardar PDF del cierre
          </button>
          <p className="text-center text-nota text-ink-3">
            {enSala === 1 ? "Queda 1 niño en la sala" : `Quedan ${enSala} niños en la sala`}: el PDF de cierre sale cuando salgan todos. Esto es un corte del momento.
          </p>
        </div>
      )}
    </Container>
  );
}

function Cifra({ etiqueta, valor, pie }: { etiqueta: string; valor: string; pie?: string | undefined }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 shadow-card">
      <dt className="text-etiqueta font-semibold tracking-[0.06em] text-ink-3 uppercase">{etiqueta}</dt>
      <dd className="tnum font-display text-seccion font-bold text-ink">
        {valor}
        {pie && <span className="ml-1.5 font-sans text-nota font-normal text-ink-3">{pie}</span>}
      </dd>
    </div>
  );
}

/** Las secciones del PDF: cada familia con sus niños (en una sola tabla), lo que pide atención y los cumpleaños. */
function seccionesDelCierre(c: CierreDelParqueDto, hora: (t: number) => string): SeccionDeInforme[] {
  const columnas = [
    { titulo: "Niño" },
    // Lo que se lee de corrido no se parte en la hoja: un renglón por niño.
    { titulo: "Pulsera", clase: "whitespace-nowrap" },
    { titulo: "Entrada y salida", clase: "whitespace-nowrap" },
    { titulo: "Paquete", clase: "whitespace-nowrap" },
    { titulo: "Tiempo", derecha: true },
    { titulo: "De más", derecha: true },
    { titulo: "Lo recogió" },
    { titulo: "Mesa" },
  ];
  const familias = c.familias.map(
    (f, i): SeccionDeInforme => ({
      id: `f-${i}`,
      titulo: `${f.representante} · ${f.telefono}`,
      columnas,
      filas: f.ninos.map((n): ReactNode[] => [
        n.anulada ? `${n.nombre} (anulada)` : n.nombre,
        n.pulsera,
        entradaYSalida(n, hora),
        n.paquete,
        n.anulada ? "—" : duracion(n.minutos),
        n.deMas ? duracion(n.deMas) : "—",
        n.recogio ? `${n.recogio.nombre}${n.recogio.otro ? " (otra persona)" : ""}` : "—",
        n.mesa ?? "—",
      ]),
      vacio: "Sin niños.",
    }),
  );
  return [
    familias.length > 0
      ? enBandas("familias", `Familias · ${c.familias.length}`, familias)
      : { id: "familias", titulo: "Familias", columnas, filas: [], vacio: "No entró nadie." },
    {
      id: "atencion",
      titulo: `Pide atención · ${c.atencion.length}`,
      columnas: [{ titulo: "Hora" }, { titulo: "Qué" }, { titulo: "Niño" }, { titulo: "Detalle" }],
      filas: c.atencion.map((a) => [hora(Date.parse(a.en)), ATENCION[a.tipo].texto, a.nino, a.detalle]),
      vacio: "Nada que revisar.",
    },
    {
      id: "cumpleanos",
      titulo: "Cumpleaños",
      columnas: [{ titulo: "Cumpleañero" }, { titulo: "Reservados", derecha: true }, { titulo: "Entraron", derecha: true }],
      filas: c.cumpleanos.map((x) => [x.cumpleanero, String(x.reservados), String(x.entraron)]),
      vacio: "Sin cumpleaños hoy.",
    },
  ];
}

/**
 * El PDF del cierre del parque (B4-21): una hoja A4 que el navegador imprime o guarda como PDF, con las cifras arriba,
 * lo que se cuadra (pulseras y medias) y cada familia. Sale con la sala en cero: antes, lo dice y no hay hoja.
 */
export function CierreDelParqueImpreso({ cierre }: { cierre: Resultado<CierreDelParqueDto> | null }) {
  const reloj = useReloj();
  if (!cierre || !cierre.ok || cierre.valor.resumen.enSala > 0) {
    const texto = !cierre
      ? "Entra con tu PIN para ver el cierre del parque."
      : !cierre.ok
        ? cierre.mensaje
        : `Quedan ${cierre.valor.resumen.enSala} en la sala: el PDF de cierre sale cuando salgan todos.`;
    return (
      <div className="mx-auto flex max-w-[210mm] flex-col gap-3 px-3 py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-4 py-3 text-detalle font-medium text-state-warn">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {texto}
        </p>
        <a href="/monitor/cierre" className="text-detalle font-semibold text-brand underline">
          Volver al cierre del parque
        </a>
      </div>
    );
  }
  const c = cierre.valor;
  const s = c.resumen;
  return (
    <DocumentoDeInforme titulo="Cierre del parque" local={c.encabezado.local} periodo={diaDelInforme(c.dia)} generadoEn={c.encabezado.generadoEn} generadoPor={c.encabezado.generadoPor} volver="/monitor/cierre">
      <dl className="mb-3 grid grid-cols-6 gap-x-3 gap-y-1 border-b border-current/40 pb-2 text-[9.5pt]">
        <Dato termino="Niños" valor={String(s.ninos)} pie={`${s.familias} ${s.familias === 1 ? "familia" : "familias"}`} />
        <Dato termino="Máximo a la vez" valor={s.pico ? String(s.pico.ninos) : "—"} pie={s.pico ? reloj.hora(Date.parse(s.pico.en)) : "sin estancias"} />
        <Dato termino="Estancia promedio" valor={duracion(s.minutosPromedio)} pie="sin pausas por comida" />
        <Dato termino="En sala" valor={String(s.enSala)} pie="para cerrar, cero" />
        <Dato termino="Pulseras" valor={String(c.pulseras.usadas)} pie={c.pulseras.desde ? (c.pulseras.desde === c.pulseras.hasta ? c.pulseras.desde : `${c.pulseras.desde} a ${c.pulseras.hasta}`) : "ninguna"} />
        <Dato termino="Medias" valor={c.medias.pares === 1 ? "1 par" : `${c.medias.pares} pares`} pie={c.medias.quedan !== null ? `quedan ${c.medias.quedan}` : "sin contar"} />
      </dl>
      {seccionesDelCierre(c, reloj.hora).map((x) => (
        <SeccionImpresa key={x.id} seccion={x} />
      ))}
    </DocumentoDeInforme>
  );
}

function Dato({ termino, valor, pie }: { termino: string; valor: string; pie: string }) {
  return (
    <div>
      <dt className="text-[8pt] font-semibold tracking-[0.05em] uppercase">{termino}</dt>
      <dd className="tnum text-[12pt] font-bold">{valor}</dd>
      <dd className="text-[8pt]">{pie}</dd>
    </div>
  );
}
