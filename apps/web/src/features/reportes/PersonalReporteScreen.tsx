"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FileDown, ReceiptText, TriangleAlert, UsersRound } from "lucide-react";
import type { ValesDelPersonalDto } from "@l2/contracts";
import { Cifra, Container, FiltroSegmentado, PageHeader, Resumen, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { ValesPedidos } from "./reportes.servidor.ts";
import { FiltroDePeriodo, PERIODOS_POR_QUINCENA, TablaDeInforme, importe, periodoEnPalabras } from "./informe.tsx";
import { direccionDelPersonal, seccionesDelPersonal, type SeccionDelPersonal } from "./personal.tsx";

/**
 * Panel → Reportes → Personal (B3-17, M-37). De solo lectura, para administración y supervisión: lo que consumió cada
 * persona del equipo en la quincena, con sus vales (lo consumido, quién lo cobró, si se anuló o se devolvió algo). El
 * periodo va en la dirección; el PDF lleva las dos tablas. El descuento del sueldo se hace fuera del sistema.
 */

const RUTA = "/panel/reportes/personal";
const IMPRESION = "/informes/personal";

export function PersonalReporteScreen({ hoy, pedido, informe }: ValesPedidos) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: { desde: string; hasta: string }) => iniciar(() => router.push(direccionDelPersonal(RUTA, p) as Route));
  // Un consumo que se cobra, se anula o se devuelve mientras se mira.
  useAlCambiar(["ventas"], () => router.refresh());

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Personal" }]}
        titulo="Consumo del personal"
        descripcion="Lo que consumió cada persona del equipo en la quincena, vale por vale, firmado con su PIN. Sin tope: el descuento del sueldo se hace fuera del sistema."
        acciones={
          informe.ok && (
            <Link
              href={direccionDelPersonal(IMPRESION, pedido) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />

      <FiltroDePeriodo
        key={`${pedido.desde}|${pedido.hasta}`}
        hoy={hoy}
        desde={pedido.desde}
        hasta={pedido.hasta}
        cargando={cargando}
        onPeriodo={ir}
        periodos={PERIODOS_POR_QUINCENA}
      />

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

function Informe({ informe, cargando }: { informe: ValesDelPersonalDto; cargando: boolean }) {
  const reloj = useReloj();
  const [pestana, setPestana] = useState<SeccionDelPersonal>("personas");
  const secciones = seccionesDelPersonal(informe, reloj);
  const seccion = secciones.find((s) => s.id === pestana) ?? secciones[0]!;
  const vales = informe.porPersona.reduce((n, p) => n + p.vales, 0);
  const anulados = informe.vales.filter((v) => v.anulado).length;
  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">{periodoEnPalabras(informe.periodo)}</p>
      <Resumen etiqueta="Resumen del consumo del personal">
        <Cifra
          etiqueta="Consumió el equipo"
          icono={<UsersRound />}
          valor={importe(informe.total)}
          pie={informe.porPersona.length === 0 ? "Nadie consumió" : `${informe.porPersona.length} ${informe.porPersona.length === 1 ? "persona" : "personas"}`}
          tono="idle"
          onClick={() => setPestana("personas")}
          activo={pestana === "personas"}
        />
        <Cifra
          etiqueta="Vales"
          icono={<ReceiptText />}
          valor={String(vales)}
          pie={anulados === 0 ? "Ninguno anulado" : `${anulados} ${anulados === 1 ? "anulado" : "anulados"}, sin contar`}
          tono="idle"
          onClick={() => setPestana("vales")}
          activo={pestana === "vales"}
        />
      </Resumen>
      <FiltroSegmentado<SeccionDelPersonal>
        etiqueta="Qué ver"
        opciones={secciones.map((s) => ({ id: s.id, nombre: s.id === "personas" ? "Por persona" : "Los vales" }))}
        valor={pestana}
        onCambiar={setPestana}
      />
      <TablaDeInforme seccion={seccion} />
    </div>
  );
}
