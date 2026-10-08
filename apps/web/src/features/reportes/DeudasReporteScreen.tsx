"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { CircleCheckBig, CircleX, Clock, FileDown, HandCoins, TriangleAlert } from "lucide-react";
import type { InformeDeDeudasDto } from "@l2/contracts";
import { Cifra, Container, FiltroSegmentado, PageHeader, Resumen, Sheet, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { DeudasPedidas } from "./reportes.servidor.ts";
import { FiltroDePeriodo, TablaDeInforme, importe, periodoEnPalabras } from "./informe.tsx";
import { EstadoDeDeuda, NOMBRE_PASO, detalleDelPaso, direccionDeDeudas, ordenDeDeuda, seccionesDeDeudas, type DeudaDelInforme, type SeccionDeDeudas } from "./deudas.tsx";

/**
 * Panel → Reportes → Deudas (B11-4, M-33). De solo lectura, para administración y supervisión: lo que quedó en deuda
 * en un periodo, lo recuperado y lo perdido; a nombre de quién sentó al cliente y de quién lo autorizó; y la historia
 * de cada deuda, de la mesa al desenlace (su número de orden la abre en una hoja). El periodo va en la dirección; el PDF
 * lleva la historia de todas.
 */

const PESTANA: Readonly<Record<SeccionDeDeudas, string>> = { deudas: "Deudas", meseros: "Por mesero", autorizaron: "Por quien autorizó" };

const RUTA = "/panel/reportes/deudas";
const IMPRESION = "/informes/deudas";

export function DeudasReporteScreen({ hoy, pedido, informe }: DeudasPedidas) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: { desde: string; hasta: string }) => iniciar(() => router.push(direccionDeDeudas(RUTA, p) as Route));
  // Una deuda que se marca, se cobra o se da por perdida mientras se mira.
  useAlCambiar(["cuentas"], () => router.refresh());

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Deudas" }]}
        titulo="Deudas"
        descripcion="Quien se fue sin pagar: lo que quedó en deuda, lo recuperado y lo perdido, quién sentó al cliente, quién lo autorizó y la historia de cada una."
        acciones={
          informe.ok && (
            <Link
              href={direccionDeDeudas(IMPRESION, pedido) as Route}
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

function Informe({ informe, cargando }: { informe: InformeDeDeudasDto; cargando: boolean }) {
  const reloj = useReloj();
  const [pestana, setPestana] = useState<SeccionDeDeudas>("deudas");
  const [elegida, setElegida] = useState<string | null>(null);
  const { resumen } = informe;
  const actual = informe.deudas.find((d) => d.id === elegida);
  // El número de orden abre la historia de esa deuda en una hoja: la tabla sigue a la vista.
  const secciones = seccionesDeDeudas(informe, reloj).map((s) =>
    s.id !== "deudas"
      ? s
      : {
          ...s,
          filas: s.filas.map((f, i) => {
            const d = informe.deudas[i]!;
            return [
              <button
                key="o"
                type="button"
                aria-haspopup="dialog"
                aria-label={`Historia de ${ordenDeDeuda(d.orden)}`}
                onClick={() => setElegida(d.id)}
                className="tnum cursor-pointer font-semibold whitespace-nowrap text-brand underline underline-offset-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
              >
                {ordenDeDeuda(d.orden)}
              </button>,
              ...f.slice(1),
            ];
          }),
        },
  );
  const seccion = secciones.find((s) => s.id === pestana) ?? secciones[0]!;
  const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">{periodoEnPalabras(informe.periodo)}</p>
      <Resumen etiqueta="Resumen de deudas">
        <Cifra
          etiqueta="Quedaron en deuda"
          icono={<HandCoins />}
          valor={importe(resumen.quedaron.monto)}
          pie={resumen.quedaron.cantidad === 0 ? "Nadie se fue sin pagar" : n(resumen.quedaron.cantidad, "deuda", "deudas")}
          tono={resumen.quedaron.cantidad > 0 ? "warn" : "idle"}
          onClick={() => setPestana("deudas")}
          activo={pestana === "deudas"}
        />
        <Cifra
          etiqueta="Recuperado"
          icono={<CircleCheckBig />}
          valor={importe(resumen.recuperado.monto)}
          pie={resumen.recuperado.cantidad === 0 ? "Ninguna cobrada" : n(resumen.recuperado.cantidad, "cobrada", "cobradas")}
          tono={resumen.recuperado.cantidad > 0 ? "ok" : "idle"}
        />
        <Cifra
          etiqueta="Perdido"
          icono={<CircleX />}
          valor={importe(resumen.perdido.monto)}
          pie={resumen.perdido.cantidad === 0 ? "Ninguna perdida" : n(resumen.perdido.cantidad, "dada por perdida", "dadas por perdidas")}
          tono={resumen.perdido.cantidad > 0 ? "crit" : "idle"}
          onClick={() => setPestana("autorizaron")}
          activo={pestana === "autorizaron"}
        />
        <Cifra
          etiqueta="Pendiente al terminar"
          icono={<Clock />}
          valor={importe(resumen.pendienteAlTerminar.monto)}
          pie={resumen.pendienteAlTerminar.cantidad === 0 ? "Nada por cobrar" : `${n(resumen.pendienteAlTerminar.cantidad, "deuda", "deudas")} por cobrar`}
          tono={resumen.pendienteAlTerminar.cantidad > 0 ? "warn" : "idle"}
        />
      </Resumen>

      <FiltroSegmentado<SeccionDeDeudas>
        etiqueta="Sección del informe"
        opciones={secciones.map((s) => ({ id: s.id, nombre: PESTANA[s.id], cuenta: s.id === "deudas" ? informe.deudas.length : undefined }))}
        valor={pestana}
        onCambiar={setPestana}
      />
      <div role="tabpanel" aria-label={seccion.titulo}>
        <TablaDeInforme seccion={seccion} />
      </div>
      <Sheet
        abierto={actual !== undefined}
        onCerrar={() => setElegida(null)}
        titulo={actual ? `Historia de ${ordenDeDeuda(actual.orden)}` : "Historia"}
        {...(actual ? { descripcion: `${actual.lugar} · debe ${importe(actual.monto)}` } : {})}
      >
        {actual && <Historia deuda={actual} />}
      </Sheet>
    </div>
  );
}

/** La historia de una deuda, de la mesa al desenlace: el cliente con sus datos y cada paso, con su hora y quién. */
function Historia({ deuda }: { deuda: DeudaDelInforme }) {
  const reloj = useReloj();
  const { preciosConIva } = useSucursal().ajustes;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5 text-detalle">
        <dt className="text-ink-3">Cliente</dt>
        <dd className="font-semibold text-ink">{deuda.cliente.nombre}</dd>
        <dt className="text-ink-3">Cédula</dt>
        <dd data-privado className="tnum text-ink">
          {deuda.cliente.cedula}
        </dd>
        <dt className="text-ink-3">Teléfono</dt>
        <dd data-privado className="tnum text-ink">
          {deuda.cliente.telefono}
        </dd>
        <dt className="text-ink-3">Lo sentó</dt>
        <dd className="text-ink">{deuda.sentadoPor}</dd>
        <dt className="text-ink-3">Cómo está</dt>
        <dd>
          <EstadoDeDeuda estado={deuda.estado} dias={deuda.diasPendiente} />
        </dd>
      </dl>
      <ol aria-label="Lo que pasó" className="flex flex-col">
        {deuda.historia.map((p, i) => (
          <li key={`${p.en}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {/* La línea que une un paso con el siguiente. */}
            {i < deuda.historia.length - 1 && <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-px bg-line-strong" />}
            <span aria-hidden="true" className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-surface", p.que === "SE_FUE" ? "bg-state-warn" : p.que === "PERDIDA" ? "bg-state-crit" : p.que === "COBRADA" ? "bg-state-ok" : "bg-ink-3")} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2 text-detalle">
                <span className="font-semibold text-ink">{p.que === "COBRADA" || p.que === "PERDIDA" ? <EstadoDeDeuda estado={p.que} /> : NOMBRE_PASO[p.que]}</span>
                <span className="tnum text-ink-3">{reloj.diaYHora(Date.parse(p.en))}</span>
              </p>
              <p className="text-detalle text-ink-2">
                {p.quien}
                {detalleDelPaso(p, preciosConIva) ? ` · ${detalleDelPaso(p, preciosConIva)}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
