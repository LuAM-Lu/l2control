"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ClipboardList, FileDown, PackageX, TriangleAlert, Wallet } from "lucide-react";
import type { InformeDeInventarioDto, Resultado } from "@l2/contracts";
import { CAMPO_DE_FILTRO, Cifra, Container, FiltroSegmentado, PageHeader, Resumen, TAMANO_ICONO } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { TablaDeInforme, importe } from "./informe.tsx";
import { direccionDeInventario, productosFiltrados, seccionesDeInventario, type FiltroDeEstado } from "./inventario.tsx";

/**
 * Panel → Reportes → Inventario al momento (B11-2, M-29). Lo que hay a esta hora y lo que vale al costo, por categoría y
 * producto, con lo agotado, lo bajo mínimo y lo que nunca se contó. Las cifras filtran; el PDF lleva el filtro puesto.
 * Se relee solo cuando cambia la existencia (una venta, una entrada, un conteo).
 */

const ESTADOS: readonly { id: FiltroDeEstado; nombre: string }[] = [
  { id: "TODOS", nombre: "Todos" },
  { id: "AGOTADO", nombre: "Agotados" },
  { id: "BAJO_MINIMO", nombre: "Bajo mínimo" },
  { id: "SIN_INICIAL", nombre: "Sin contar" },
];

export function InventarioAlMomentoScreen({ informe }: { informe: Resultado<InformeDeInventarioDto> }) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  useAlCambiar(["catalogo"], () => router.refresh());
  const [estado, setEstado] = useState<FiltroDeEstado>("TODOS");
  const [categoria, setCategoria] = useState<string | null>(null);
  const filtro = { estado, categoria };

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Inventario al momento" }]}
        titulo="Inventario al momento"
        descripcion="Lo que hay a esta hora y lo que vale al costo, por categoría y producto, con lo que pide atención."
        acciones={
          informe.ok && (
            <Link
              href={direccionDeInventario("/informes/inventario", filtro) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />
      {!informe.ok ? (
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.mensaje}
        </p>
      ) : (
        <Cuerpo informe={informe.valor} estado={estado} categoria={categoria} onEstado={setEstado} onCategoria={setCategoria} />
      )}
    </Container>
  );
}

function Cuerpo({
  informe,
  estado,
  categoria,
  onEstado,
  onCategoria,
}: {
  informe: InformeDeInventarioDto;
  estado: FiltroDeEstado;
  categoria: string | null;
  onEstado: (e: FiltroDeEstado) => void;
  onCategoria: (c: string | null) => void;
}) {
  const reloj = useReloj();
  const r = informe.resumen;
  const instante = Date.parse(informe.encabezado.generadoEn);
  const filtro = { estado, categoria };
  const secciones = seccionesDeInventario(informe, filtro);
  const cuenta = (e: FiltroDeEstado) => (e === "TODOS" ? r.productos : e === "AGOTADO" ? r.agotados : e === "BAJO_MINIMO" ? r.bajoMinimo : r.sinInicial);
  const alternar = (e: FiltroDeEstado) => onEstado(estado === e ? "TODOS" : e);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-detalle text-ink-2">
        A las {reloj.hora(instante)} del {reloj.diaConAnio(instante)}
      </p>
      <Resumen etiqueta="Resumen del inventario">
        <Cifra etiqueta="Valor al costo" icono={<Wallet />} valor={importe(r.valor)} pie={`${r.unidades} unidades`} />
        <Cifra etiqueta="Agotados" icono={<PackageX />} tono={r.agotados > 0 ? "crit" : "idle"} valor={String(r.agotados)} pie="No se venden" activo={estado === "AGOTADO"} onClick={() => alternar("AGOTADO")} />
        <Cifra etiqueta="Bajo mínimo" icono={<TriangleAlert />} tono={r.bajoMinimo > 0 ? "warn" : "idle"} valor={String(r.bajoMinimo)} pie="Hay que reponer" activo={estado === "BAJO_MINIMO"} onClick={() => alternar("BAJO_MINIMO")} />
        <Cifra etiqueta="Sin contar" icono={<ClipboardList />} valor={String(r.sinInicial)} pie="Sin inventario inicial" activo={estado === "SIN_INICIAL"} onClick={() => alternar("SIN_INICIAL")} />
      </Resumen>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <FiltroSegmentado<FiltroDeEstado>
          etiqueta="Estado"
          opciones={ESTADOS.map((e) => ({ ...e, cuenta: cuenta(e.id), alerta: e.id === "AGOTADO" }))}
          valor={estado}
          onCambiar={onEstado}
        />
        <label className="flex items-center gap-1.5 text-detalle text-ink-2">
          Categoría
          <select value={categoria ?? ""} onChange={(e) => onCategoria(e.target.value || null)} className={CAMPO_DE_FILTRO}>
            <option value="">Todas</option>
            {informe.categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria}
              </option>
            ))}
          </select>
        </label>
        <span className="text-detalle text-ink-3">
          {productosFiltrados(informe, filtro).length} de {r.productos}
        </span>
      </div>

      {secciones.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-6 text-center text-cuerpo text-ink-3">
          {r.productos === 0 ? "Todavía no hay productos que se cuenten en este local." : "Ningún producto con este filtro."}
        </p>
      ) : (
        secciones.map((s) => (
          <section key={s.id} aria-label={s.titulo}>
            <h2 className="mb-2 text-tarjeta font-semibold text-ink">{s.titulo}</h2>
            <TablaDeInforme seccion={s} />
          </section>
        ))
      )}
    </div>
  );
}
