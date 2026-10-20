"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Baby, Clock, Coins, FileDown, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import type { InformeDelParqueDto } from "@l2/contracts";
import { Cifra, Container, FiltroSegmentado, PageHeader, Resumen, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { ParquePedido } from "./reportes.servidor.ts";
import { FiltroDePeriodo, TablaDeInforme, importe, periodoEnPalabras, porciento } from "./informe.tsx";
import { CONTRA, DIAS_DE_LA_SEMANA, diferencia, diferenciaEnMinutos, direccionDelParque, duracion, horaCorta, horaDelDia, seccionesDelParque, type SeccionDelParque } from "./parque.tsx";

/**
 * Panel → Reportes → Parque (B11-6, M-37). De solo lectura, para administración y supervisión: los niños por día y por
 * hora con el aforo pico, el dinero del tiempo (también lo que se pagó en las mesas), las estancias y las excepciones. El
 * periodo va en la dirección; el PDF lleva todas las secciones.
 */

const RUTA = "/panel/reportes/parque";
const IMPRESION = "/informes/parque";

/** Las pestañas: «De un vistazo» primero (B11-8); «Día y hora» y «Qué se vende» van en el vistazo y en el PDF. */
type Pestana = "vistazo" | Exclude<SeccionDelParque, "semana" | "paquetes">;
const PESTANA: Readonly<Record<Pestana, string>> = { vistazo: "De un vistazo", dias: "Por día", horas: "Por hora", dinero: "Dinero", estancias: "Estancias", excepciones: "Excepciones" };

export function ParqueReporteScreen({ hoy, pedido, informe }: ParquePedido) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: { desde: string; hasta: string }) => iniciar(() => router.push(direccionDelParque(RUTA, p) as Route));
  // Una entrada, una salida o una recarga mientras se mira.
  useAlCambiar(["sala"], () => router.refresh());

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Parque" }]}
        titulo="Parque"
        descripcion="De un vistazo: las cifras clave contra el periodo anterior, cuándo viene la gente, de dónde sale el dinero y qué se vende. En las pestañas, el detalle por día, por hora, del dinero, las estancias y las excepciones."
        acciones={
          informe.ok && (
            <Link
              href={direccionDelParque(IMPRESION, pedido) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />

      <FiltroDePeriodo key={`${pedido.desde}|${pedido.hasta}`} hoy={hoy} desde={pedido.desde} hasta={pedido.hasta} cargando={cargando} onPeriodo={ir} />

      {!informe.ok ? (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.problemas?.[0]?.message ?? informe.mensaje}
        </p>
      ) : (
        <Informe informe={informe.valor} cargando={cargando} />
      )}
    </Container>
  );
}

function Informe({ informe, cargando }: { informe: InformeDelParqueDto; cargando: boolean }) {
  const reloj = useReloj();
  const { formatoHora } = useSucursal().ajustes;
  const [pestana, setPestana] = useState<Pestana>("vistazo");
  const secciones = seccionesDelParque(informe, reloj, formatoHora).filter((x) => x.id !== "semana" && x.id !== "paquetes");
  const seccion = secciones.find((x) => x.id === pestana);
  const r = informe.resumen;
  const a = informe.anterior;
  // B11-8: cada cifra con su diferencia contra el periodo anterior (si no vino, lo de siempre).
  const contra = (ahora: bigint, antes: bigint | undefined, sinAntes: string) => (a && antes !== undefined ? diferencia(ahora, antes, a.con) : sinAntes);
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">
        {periodoEnPalabras(informe.periodo)}
        {a && <span className="text-ink-3"> · comparado con {periodoEnPalabras(a)} ({CONTRA[a.con]})</span>}
      </p>
      <Resumen etiqueta="Resumen del parque">
        <Cifra etiqueta="Niños" icono={<Baby />} valor={String(r.ninos)} pie={contra(BigInt(r.ninos), a ? BigInt(a.ninos) : undefined, r.ninos === 0 ? "Nadie entró" : `${informe.porDia.length} ${informe.porDia.length === 1 ? "día" : "días"}`)} tono="idle" onClick={() => setPestana("dias")} activo={pestana === "dias"} />
        <Cifra etiqueta="Dinero del parque" icono={<Wallet />} valor={importe(r.dinero)} pie={contra(BigInt(r.dinero.minor), a ? BigInt(a.dinero.minor) : undefined, `de ello en mesas ${importe(informe.dinero.enMesas.monto)}`)} tono="idle" onClick={() => setPestana("dinero")} activo={pestana === "dinero"} />
        <Cifra etiqueta="Promedio por niño" icono={<Coins />} valor={importe(r.porNino)} pie={contra(BigInt(r.porNino.minor), a ? BigInt(a.porNino.minor) : undefined, "lo del tiempo, por niño")} tono="idle" />
        <Cifra etiqueta="Estancia promedio" icono={<Clock />} valor={duracion(r.minutosPromedio)} pie={a ? diferenciaEnMinutos(r.minutosPromedio, a.minutosPromedio, a.con) : "sin las pausas por comida"} tono="idle" onClick={() => setPestana("estancias")} activo={pestana === "estancias"} />
        <Cifra
          etiqueta="Pico"
          icono={<TrendingUp />}
          valor={r.pico ? `${r.pico.ninos} de ${r.aforo}` : "—"}
          pie={r.pico ? reloj.diaYHora(Date.parse(r.pico.en)) : "Sin estancias"}
          tono={r.pico && r.pico.ninos >= r.aforo ? "warn" : "idle"}
          onClick={() => setPestana("horas")}
          activo={pestana === "horas"}
        />
      </Resumen>
      <FiltroSegmentado<Pestana>
        etiqueta="Qué ver"
        opciones={(["vistazo", ...secciones.map((x) => x.id)] as Pestana[]).map((id) => ({ id, nombre: PESTANA[id], ...(id === "excepciones" ? { cuenta: informe.excepciones.length } : {}) }))}
        valor={pestana}
        onCambiar={setPestana}
      />
      {pestana === "vistazo" || !seccion ? <DeUnVistazo informe={informe} formatoHora={formatoHora} onExcepciones={() => setPestana("excepciones")} /> : <TablaDeInforme seccion={seccion} />}
    </div>
  );
}

const TARJETA = "rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card";

/** Las tres capas del dinero: cada una de un tono de la marca (no de estado: no dicen bien ni mal). */
const CAPAS = [
  { id: "paquetes", nombre: "Paquetes", clase: "bg-brand" },
  { id: "recargas", nombre: "Más tiempo", clase: "bg-brand/55" },
  { id: "tiempoDeMas", nombre: "Tiempo de más", clase: "bg-brand/25" },
] as const;

/**
 * «De un vistazo» (B11-8): cuándo viene la gente (por hora, y día de la semana por hora), de dónde sale el dinero (en una
 * barra, con lo pagado en mesas y lo regalado aparte), qué se vende y lo que pide atención.
 */
function DeUnVistazo({ informe, formatoHora, onExcepciones }: { informe: InformeDelParqueDto; formatoHora: "12h" | "24h"; onExcepciones: () => void }) {
  const corta = (h: number) => horaCorta(h, formatoHora);
  const horas = informe.porHora.length > 0 ? Array.from({ length: Math.max(...informe.porHora.map((h) => h.hora)) - Math.min(...informe.porHora.map((h) => h.hora)) + 1 }, (_, k) => Math.min(...informe.porHora.map((h) => h.hora)) + k) : [];
  const porHora = new Map(informe.porHora.map((h) => [h.hora, h.ninos]));
  const maxHora = Math.max(1, ...informe.porHora.map((h) => h.ninos));
  const celda = new Map(informe.porSemanaYHora.map((x) => [`${x.dia}|${x.hora}`, x.ninos]));
  const maxCelda = Math.max(1, ...informe.porSemanaYHora.map((x) => x.ninos));
  const masLleno = [...informe.porSemanaYHora].sort((a, b) => b.ninos - a.ninos)[0];
  const d = informe.dinero;
  const total = BigInt(informe.resumen.dinero.minor);
  const capa = (id: (typeof CAPAS)[number]["id"]) => BigInt(d[id].monto.minor);
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section aria-labelledby="vistazo-cuando" className={TARJETA}>
        <h3 id="vistazo-cuando" className="font-display text-subtitulo font-bold text-ink">Cuándo viene la gente</h3>
        {horas.length === 0 ? (
          <p className="mt-2 text-detalle text-ink-3">Ningún niño entró en este periodo.</p>
        ) : (
          <>
            <p className="text-nota text-ink-3">Los niños que entraron a cada hora, sumando los días del periodo.</p>
            <div className="mt-2 flex h-28 items-end gap-1" role="img" aria-label={`La hora con más entradas: ${corta(informe.porHora.reduce((m, h) => (h.ninos > m.ninos ? h : m)).hora)}`}>
              {horas.map((h) => (
                <div key={h} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${horaDelDia(h, formatoHora)}: ${porHora.get(h) ?? 0}`}>
                  <span className="block rounded-t-[3px] bg-brand" style={{ height: `${Math.round(((porHora.get(h) ?? 0) / maxHora) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-etiqueta text-ink-3">
              {/* Con muchas horas, una de cada dos: la etiqueta no se corta. */}
              {horas.map((h, k) => (
                <span key={h} className="tnum min-w-0 flex-1 text-center whitespace-nowrap">
                  {horas.length <= 12 || k % 2 === 0 ? corta(h) : ""}
                </span>
              ))}
            </div>
            <p className="mt-4 text-nota text-ink-3">Día de la semana por hora: más intenso, más niños.</p>
            <div
              className="mt-1 grid gap-0.5"
              style={{ gridTemplateColumns: `2.25rem repeat(${horas.length}, minmax(0, 1fr))` }}
              role="img"
              aria-label={masLleno ? `Lo más lleno: ${DIAS_DE_LA_SEMANA[masLleno.dia - 1]} a las ${corta(masLleno.hora)}, ${masLleno.ninos} niños` : "Sin entradas"}
            >
              {DIAS_DE_LA_SEMANA.map((nombre, k) => (
                <div key={nombre} className="contents">
                  <span className="text-etiqueta text-ink-3">{nombre}</span>
                  {horas.map((h) => {
                    const n = celda.get(`${k + 1}|${h}`) ?? 0;
                    return (
                      <span
                        key={h}
                        title={`${nombre} ${horaDelDia(h, formatoHora)}: ${n}`}
                        className={cn("h-4 rounded-[3px]", n === 0 ? "bg-surface-2" : "bg-brand")}
                        style={n === 0 ? undefined : { opacity: 0.2 + 0.8 * (n / maxCelda) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="flex min-w-0 flex-col gap-3">
        <section aria-labelledby="vistazo-dinero" className={TARJETA}>
          <h3 id="vistazo-dinero" className="font-display text-subtitulo font-bold text-ink">De dónde sale el dinero</h3>
          {total === 0n ? (
            <p className="mt-2 text-detalle text-ink-3">Sin dinero del parque en este periodo.</p>
          ) : (
            <>
              <div className="mt-2 flex h-5 overflow-hidden rounded-[6px]" role="img" aria-label={CAPAS.map((c) => `${c.nombre} ${porciento(capa(c.id), total)}`).join(", ")}>
                {CAPAS.map((c) => (
                  <span key={c.id} className={c.clase} style={{ width: porciento(capa(c.id), total).replace(",", ".").replace(" %", "%") }} />
                ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-nota text-ink-2">
                {CAPAS.map((c) => (
                  <li key={c.id} className="tnum flex items-center gap-1.5">
                    <span className={cn("inline-block size-2.5 rounded-[2px]", c.clase)} aria-hidden="true" />
                    {c.nombre} {importe(d[c.id].monto)} · {porciento(capa(c.id), total)}
                  </li>
                ))}
              </ul>
              <p className="tnum mt-2 text-nota text-ink-3">
                De esto, {importe(d.enMesas.monto)} se pagó en mesas. Regalado aparte: {importe(d.regalado.monto)} en {d.regalado.cantidad} {d.regalado.cantidad === 1 ? "cortesía" : "cortesías"}.
              </p>
            </>
          )}
        </section>

        <section aria-labelledby="vistazo-paquetes" className={TARJETA}>
          <h3 id="vistazo-paquetes" className="font-display text-subtitulo font-bold text-ink">Qué se vende</h3>
          {d.porPaquete.length === 0 ? (
            <p className="mt-2 text-detalle text-ink-3">Ningún paquete en este periodo.</p>
          ) : (
            <table className="mt-1 w-full text-detalle">
              <thead>
                <tr className="text-etiqueta text-ink-3 uppercase">
                  <th className="py-1 text-left font-semibold">Paquete</th>
                  <th className="py-1 text-right font-semibold">Niños</th>
                  <th className="w-[38%] py-1 pl-3 text-left font-semibold">Del total</th>
                </tr>
              </thead>
              <tbody>
                {d.porPaquete.map((p) => (
                  <tr key={p.paquete} className="border-t border-line/60">
                    <td className="py-1.5 text-ink">{p.paquete}</td>
                    <td className="tnum py-1.5 text-right text-ink">{p.ninos}</td>
                    <td className="py-1.5 pl-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 rounded-full bg-brand/75" style={{ width: porciento(BigInt(p.ninos), BigInt(informe.resumen.ninos)).replace(",", ".").replace(" %", "%") }} />
                        <span className="tnum shrink-0 text-nota text-ink-3">{porciento(BigInt(p.ninos), BigInt(informe.resumen.ninos))}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <button type="button" onClick={onExcepciones} className={cn(TARJETA, "flex cursor-pointer items-center justify-between gap-3 py-3 text-left hover:border-line-strong")}>
          <span className="flex items-center gap-2 text-detalle text-ink">
            <TriangleAlert className={cn("size-(--icono-texto)", informe.excepciones.length > 0 ? "text-state-warn" : "text-ink-3")} aria-hidden="true" />
            {informe.excepciones.length === 0 ? "Sin excepciones en este periodo" : `Pide atención: ${informe.excepciones.length} ${informe.excepciones.length === 1 ? "excepción" : "excepciones"}`}
          </span>
          <span className="text-detalle font-semibold text-brand">Ver el detalle</span>
        </button>
      </div>
    </div>
  );
}
