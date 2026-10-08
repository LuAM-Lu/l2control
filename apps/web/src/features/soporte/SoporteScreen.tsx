"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, CircleDot, Copy, Eye, Hammer, ImageIcon, Inbox, MonitorSmartphone, TriangleAlert } from "lucide-react";
import type { EstadoReporte, ReporteDto, ReportesDto, Resultado } from "@l2/contracts";
import { Button, Cifra, Container, EmptyState, FiltroSegmentado, Input, PageHeader, Resumen, Sheet, avisar, cn } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { NOMBRE_ROL } from "../identity/permisos.ts";
import { VERSION } from "../shell/version.ts";
import { cambiarEstadoDeReporte } from "./soporte.acciones.ts";
import { AvisoDeReporte, EstadoDeReporte } from "./estados.tsx";

type Filtro = "ABIERTOS" | EstadoReporte | "TODOS";

/**
 * Ajustes → Soporte (T-11, M-27, P-4, D-SOP): los problemas que reportó el personal. Cada uno con lo que contó la
 * persona, su pantalla, versión, equipo y rol, los últimos errores y la captura. Se marca visto, en curso o resuelto en
 * una versión, y quien lo reportó lo ve en «Mis reportes». Los del mismo error dicen cuántos son. Lo usa
 * administración y la cuenta de soporte del desarrollo; se actualiza solo (tema «soporte»).
 */
export function SoporteScreen({ inicial }: { inicial: Resultado<ReportesDto> }) {
  const router = useRouter();
  const reloj = useReloj();
  useAlCambiar(["soporte"], () => router.refresh());
  const [filtro, setFiltro] = useState<Filtro>("ABIERTOS");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  const reportes = inicial.ok ? inicial.valor.reportes : [];
  const cuenta = (e: EstadoReporte) => reportes.filter((r) => r.estado === e).length;
  const visibles = useMemo(
    () => reportes.filter((r) => (filtro === "TODOS" ? true : filtro === "ABIERTOS" ? r.estado !== "RESUELTO" : r.estado === filtro)),
    [reportes, filtro],
  );
  const abierto = reportes.find((r) => r.id === abiertoId) ?? null;
  const sinAviso = reportes.filter((r) => r.aviso === "FALLO").length;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: "Abby Kingdom", href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Soporte" }]}
        titulo="Soporte"
        descripcion="Los problemas que reportó el personal desde su pantalla, con su captura y los últimos errores. Márcalos vistos, en curso o resueltos en una versión: quien lo reportó lo ve en su ayuda."
      />

      {!inicial.ok ? (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-card)] border border-state-crit/40 bg-state-crit-bg p-4 text-cuerpo text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {inicial.mensaje}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <Resumen etiqueta="Los reportes">
            <Cifra etiqueta="Nuevos" icono={<CircleDot aria-hidden="true" />} tono={cuenta("NUEVO") > 0 ? "warn" : "idle"} valor={String(cuenta("NUEVO"))} pie="Sin mirar todavía" onClick={() => setFiltro("NUEVO")} activo={filtro === "NUEVO"} />
            <Cifra etiqueta="En curso" icono={<Hammer aria-hidden="true" />} valor={String(cuenta("EN_CURSO"))} pie="Se está trabajando" onClick={() => setFiltro("EN_CURSO")} activo={filtro === "EN_CURSO"} />
            <Cifra etiqueta="Resueltos" icono={<CircleCheckBig aria-hidden="true" />} tono="ok" valor={String(cuenta("RESUELTO"))} pie="Con su versión" onClick={() => setFiltro("RESUELTO")} activo={filtro === "RESUELTO"} />
            <Cifra
              etiqueta="Aviso por correo"
              icono={<TriangleAlert aria-hidden="true" />}
              tono={sinAviso > 0 ? "crit" : "idle"}
              valor={sinAviso > 0 ? `${sinAviso} sin salir` : "Al día"}
              pie={sinAviso > 0 ? "Revisa el correo del servidor" : "El desarrollo recibe cada uno"}
            />
          </Resumen>

          <FiltroSegmentado<Filtro>
            etiqueta="Qué reportes"
            valor={filtro}
            onCambiar={setFiltro}
            opciones={[
              { id: "ABIERTOS", nombre: "Por resolver", cuenta: reportes.filter((r) => r.estado !== "RESUELTO").length },
              { id: "NUEVO", nombre: "Nuevos", cuenta: cuenta("NUEVO") },
              { id: "VISTO", nombre: "Vistos", cuenta: cuenta("VISTO") },
              { id: "EN_CURSO", nombre: "En curso", cuenta: cuenta("EN_CURSO") },
              { id: "RESUELTO", nombre: "Resueltos", cuenta: cuenta("RESUELTO") },
              { id: "TODOS", nombre: "Todos", cuenta: reportes.length },
            ]}
          />

          {visibles.length === 0 ? (
            <EmptyState icon={<Inbox size={28} aria-hidden="true" />} title={reportes.length === 0 ? "Nadie ha reportado nada" : "Nada con este filtro"} hint="Un reporte entra desde la ayuda de cualquier pantalla o desde el aviso de un error." />
          ) : (
            <ul className="flex flex-col gap-2">
              {visibles.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setAbiertoId(r.id)}
                    className="flex w-full cursor-pointer flex-col gap-1.5 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-left shadow-card transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="tnum font-display text-tarjeta font-bold text-ink">N.º {r.numero}</span>
                      <EstadoDeReporte reporte={r} />
                      {r.iguales > 0 && (
                        <span className="flex items-center gap-1 text-nota text-ink-2">
                          <Copy size={12} aria-hidden="true" />
                          {r.iguales + 1} con el mismo error
                        </span>
                      )}
                      <span className="ml-auto text-nota text-ink-3">{reloj.diaYHora(Date.parse(r.creadoEn))}</span>
                    </span>
                    <span className="line-clamp-2 text-cuerpo text-ink">{r.texto}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-nota text-ink-3">
                      <span>
                        {r.quien.nombre} · {NOMBRE_ROL[r.quien.rol]}
                      </span>
                      {r.equipo && (
                        <span className="flex items-center gap-1">
                          <MonitorSmartphone size={12} aria-hidden="true" />
                          {r.equipo}
                        </span>
                      )}
                      <span className="font-mono">{r.ruta}</span>
                      <span>v{r.version}</span>
                      {r.conCaptura && (
                        <span className="flex items-center gap-1">
                          <ImageIcon size={12} aria-hidden="true" />
                          Captura
                        </span>
                      )}
                      <AvisoDeReporte aviso={r.aviso} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <DetalleDeReporte reporte={abierto} onCerrar={() => setAbiertoId(null)} />
    </Container>
  );
}

/** El reporte entero: lo que contó, los errores, la captura, su historia y los botones de estado. */
function DetalleDeReporte({ reporte, onCerrar }: { reporte: ReporteDto | null; onCerrar: () => void }) {
  const reloj = useReloj();
  const [version, setVersion] = useState(VERSION.numero);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState<EstadoReporte | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function marcar(estado: Exclude<EstadoReporte, "NUEVO">) {
    if (!reporte) return;
    setEnviando(estado);
    setError(null);
    const r = await cambiarEstadoDeReporte({
      reporteId: reporte.id,
      estado,
      ...(estado === "RESUELTO" ? { version: version.trim() } : {}),
      ...(estado !== "VISTO" && nota.trim() ? { nota: nota.trim() } : {}),
    }).catch(() => null);
    setEnviando(null);
    if (!r) return setError("El servidor no respondió: no se cambió.");
    if (!r.ok) return setError(r.mensaje);
    setNota("");
    avisar.ok(`Reporte n.º ${r.valor.numero}: ${estado === "RESUELTO" ? `resuelto en v${r.valor.resueltoEn}` : estado === "EN_CURSO" ? "en curso" : "visto"}`);
  }

  return (
    <Sheet
      abierto={reporte !== null}
      onCerrar={onCerrar}
      titulo={reporte ? `Reporte n.º ${reporte.numero}` : "Reporte"}
      descripcion={reporte ? `${reporte.quien.nombre} · ${NOMBRE_ROL[reporte.quien.rol]} · ${reloj.diaYHora(Date.parse(reporte.creadoEn))}` : ""}
      pie={
        reporte && (
          <div className="flex w-full flex-col gap-2">
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <Input surface="admin" label="Nota (opcional)" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Qué se hizo o qué falta" />
              <Input surface="admin" label="Versión" className="tnum" value={version} onChange={(e) => setVersion(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button surface="admin" variant="ghost" onClick={() => void marcar("VISTO")} disabled={enviando !== null || reporte.estado !== "NUEVO"}>
                <Eye size={15} aria-hidden="true" />
                Visto
              </Button>
              <Button surface="admin" variant="neutral" onClick={() => void marcar("EN_CURSO")} disabled={enviando !== null}>
                <Hammer size={15} aria-hidden="true" />
                En curso
              </Button>
              <Button surface="admin" variant="primary" onClick={() => void marcar("RESUELTO")} disabled={enviando !== null || !/^\d+\.\d+\.\d+$/.test(version.trim())}>
                <CircleCheckBig size={15} aria-hidden="true" />
                Resuelto
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-detalle font-medium text-state-crit">
                {error}
              </p>
            )}
          </div>
        )
      }
    >
      {reporte && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <EstadoDeReporte reporte={reporte} />
            <AvisoDeReporte aviso={reporte.aviso} />
            {reporte.iguales > 0 && <span className="text-nota text-ink-2">{reporte.iguales + 1} reportes con el mismo error</span>}
          </div>
          <section aria-label="Qué pasó">
            <h3 className="mb-1 text-etiqueta font-semibold text-ink-3 uppercase">Qué pasó</h3>
            <p className="text-cuerpo whitespace-pre-wrap text-ink">{reporte.texto}</p>
          </section>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-detalle">
            <dt className="text-ink-3">Pantalla</dt>
            <dd className="font-mono text-ink">{reporte.ruta}</dd>
            <dt className="text-ink-3">Versión</dt>
            <dd className="tnum text-ink">v{reporte.version}</dd>
            <dt className="text-ink-3">Equipo</dt>
            <dd className="text-ink">{reporte.equipo ?? "—"}</dd>
            {reporte.codigoError && (
              <>
                <dt className="text-ink-3">Error conocido</dt>
                <dd className="font-mono text-ink">{reporte.codigoError}</dd>
              </>
            )}
          </dl>
          {reporte.errores.length > 0 && (
            <section aria-label="Últimos errores">
              <h3 className="mb-1 text-etiqueta font-semibold text-ink-3 uppercase">Últimos errores en su pantalla</h3>
              <ol className="flex flex-col gap-1">
                {reporte.errores.map((e, i) => (
                  <li key={`${i}-${e}`} className="flex gap-2 text-detalle text-ink-2">
                    <TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-state-warn" />
                    {e}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {reporte.conCaptura && (
            <section aria-label="Captura">
              <h3 className="mb-1 text-etiqueta font-semibold text-ink-3 uppercase">Captura</h3>
              <a href={`/soporte/captura/${reporte.id}`} target="_blank" rel="noreferrer" className="block">
                {/* Se pide al abrir el reporte, con la sesión: no viaja con la lista. */}
                <img src={`/soporte/captura/${reporte.id}`} alt={`Captura del reporte n.º ${reporte.numero}`} className="w-full rounded border border-line" />
              </a>
            </section>
          )}
          {reporte.historia.length > 0 && (
            <section aria-label="Historia">
              <h3 className="mb-1 text-etiqueta font-semibold text-ink-3 uppercase">Historia</h3>
              <ol className="flex flex-col gap-1.5">
                {reporte.historia.map((h, i) => (
                  <li key={`${i}-${h.en}`} className={cn("text-detalle text-ink-2")}>
                    <span className="font-semibold text-ink">{h.estado === "RESUELTO" ? `Resuelto en v${h.version}` : h.estado === "EN_CURSO" ? "En curso" : "Visto"}</span> ·{" "}
                    {h.por} · {reloj.diaYHora(Date.parse(h.en))}
                    {h.nota && <span className="block text-ink-3">{h.nota}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
