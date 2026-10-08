"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, CircleCheck, FileDown, HandCoins, Receipt, TriangleAlert, Wallet } from "lucide-react";
import type { InformeDeVentasDto } from "@l2/contracts";
import { CAMPO_DE_FILTRO, Cifra, Container, FiltroSegmentado, PageHeader, Resumen, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { VentasPedidas } from "./reportes.servidor.ts";
import { FiltroDePeriodo, TablaDeInforme, importe, periodoEnPalabras } from "./informe.tsx";
import { deudasEnUnaLinea, direccionDeVentas, hayDeudas, seccionesDeVentas, type SeccionDeVentas } from "./ventas.tsx";
import { direccionDeDeudas } from "./deudas.tsx";

/**
 * Panel → Reportes → Ventas (B11-1, F9-01, M-29). De solo lectura, para administración y supervisión: lo vendido y lo
 * cobrado de un día o de un rango, por medio y moneda, por origen, por cajera y por turno, con lo anulado aparte. Todo
 * sale de los asientos y un turno con su Z da lo mismo que su Z (el informe lo dice). El periodo va en la dirección: se
 * puede guardar o compartir el enlace; el PDF es su vista de impresión.
 *
 * Arriba, las cifras; debajo, una sección por pestaña para que la página no desplace en el portátil de caja.
 */

const PESTANA: Readonly<Record<SeccionDeVentas, string>> = { medios: "Medios de pago", origen: "Origen", cajeras: "Cajeras", turnos: "Turnos", anuladas: "Anuladas" };

const RUTA = "/panel/reportes/ventas";
const IMPRESION = "/informes/ventas";

export function VentasScreen({ hoy, pedido, informe }: VentasPedidas) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: { desde: string; hasta: string; cajera: string | null }) => iniciar(() => router.push(direccionDeVentas(RUTA, p) as Route));
  // Lo de hoy se mueve mientras se mira: cada venta o cierre vuelve a leerlo.
  useAlCambiar(["ventas", "turno"], () => router.refresh());

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Ventas" }]}
        titulo="Ventas"
        descripcion="Lo vendido y lo cobrado de un día o de un rango, como lo dicen los asientos. Un turno con su Z da lo mismo que su Z."
        acciones={
          informe.ok && (
            <Link
              href={direccionDeVentas(IMPRESION, pedido) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />

      <FiltroDePeriodo key={`${pedido.desde}|${pedido.hasta}`} hoy={hoy} desde={pedido.desde} hasta={pedido.hasta} cargando={cargando} onPeriodo={(p) => ir({ ...p, cajera: pedido.cajera })}>
        {informe.ok && informe.valor.cajeras.length > 0 && (
          <label className="flex items-center gap-1.5 text-detalle text-ink-2">
            Cajera
            <select value={pedido.cajera ?? ""} onChange={(e) => ir({ desde: pedido.desde, hasta: pedido.hasta, cajera: e.target.value || null })} className={CAMPO_DE_FILTRO}>
              <option value="">Todas</option>
              {informe.valor.cajeras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </FiltroDePeriodo>

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

function Informe({ informe, cargando }: { informe: InformeDeVentasDto; cargando: boolean }) {
  const reloj = useReloj();
  const [pestana, setPestana] = useState<SeccionDeVentas>("medios");
  const { resumen } = informe;
  const secciones = seccionesDeVentas(informe, reloj);
  const actual = secciones.find((s) => s.id === pestana) ?? secciones[0]!;
  const noCuadran = informe.porTurno.filter((t) => t.cuadre.estado === "NO_CUADRA").length;
  const conZ = resumen.turnos - resumen.turnosSinZ;

  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">
        {periodoEnPalabras(informe.periodo)}
        {informe.cajera ? ` · solo los turnos de ${informe.cajera.nombre}` : ""}
      </p>
      <Resumen etiqueta="Resumen de ventas">
        <Cifra etiqueta="Vendido" icono={<Receipt />} valor={importe(resumen.vendido)} pie={`${resumen.ventas} ${resumen.ventas === 1 ? "venta" : "ventas"}${resumen.desdePapel > 0 ? ` · ${resumen.desdePapel} desde papel` : ""}`} />
        <Cifra
          etiqueta="Cobrado"
          icono={<Wallet />}
          valor={resumen.cobradoEnDolares ? importe(resumen.cobradoEnDolares) : "Sin tasa"}
          pie={resumen.cobradoEnDolares ? "A la tasa de su cobro" : "Un cobro en Bs. no tiene tasa"}
          tono={resumen.cobradoEnDolares ? "idle" : "warn"}
          onClick={() => setPestana("medios")}
          activo={pestana === "medios"}
        />
        <Cifra
          etiqueta="Anuladas"
          icono={<Ban />}
          valor={String(resumen.anuladas)}
          pie={resumen.anuladas > 0 ? `${importe(resumen.anulado)} en total` : "Ninguna"}
          tono={resumen.anuladas > 0 ? "warn" : "idle"}
          onClick={() => setPestana("anuladas")}
          activo={pestana === "anuladas"}
        />
        <Cifra
          etiqueta="Cierres Z"
          icono={noCuadran > 0 ? <TriangleAlert /> : <CircleCheck />}
          valor={resumen.turnos === 0 ? "—" : `${conZ} de ${resumen.turnos}`}
          pie={
            noCuadran > 0
              ? `${noCuadran} no ${noCuadran === 1 ? "cuadra" : "cuadran"} con su Z`
              : resumen.turnosSinZ > 0
                ? `${resumen.turnosSinZ} sin Z: pueden cambiar`
                : resumen.turnos === 0
                  ? "Ningún turno"
                  : "Todos cuadran"
          }
          tono={noCuadran > 0 ? "crit" : resumen.turnos > 0 && resumen.turnosSinZ === 0 ? "ok" : "idle"}
          onClick={() => setPestana("turnos")}
          activo={pestana === "turnos"}
        />
      </Resumen>

      {hayDeudas(informe.deudas) && (
        // Las deudas de clientes del periodo (B11-4): lo recuperado está en lo vendido (se cobró en su cuenta); lo que quedó y lo perdido, no. El detalle, en su informe.
        <Link
          href={direccionDeDeudas("/panel/reportes/deudas", informe.periodo) as Route}
          className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 text-detalle text-ink-2 hover:border-line-strong"
        >
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", informe.deudas.perdido.cantidad > 0 ? "text-state-crit" : "text-state-warn")}>
            <HandCoins size={TAMANO_ICONO.texto} aria-hidden="true" />
            Deudas de clientes
          </span>
          <span className="tnum">{deudasEnUnaLinea(informe.deudas)}</span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand group-hover:underline">
            Ver el informe
            <ArrowRight size={TAMANO_ICONO.texto} aria-hidden="true" />
          </span>
        </Link>
      )}

      <FiltroSegmentado<SeccionDeVentas>
        etiqueta="Sección del informe"
        opciones={secciones.map((s) => ({
          id: s.id,
          nombre: PESTANA[s.id],
          cuenta: s.id === "anuladas" ? resumen.anuladas : s.id === "turnos" ? resumen.turnos : undefined,
        }))}
        valor={pestana}
        onCambiar={setPestana}
      />
      <div role="tabpanel" aria-label={actual.titulo}>
        <TablaDeInforme seccion={actual} />
      </div>
    </div>
  );
}
