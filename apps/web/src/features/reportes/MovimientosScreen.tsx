"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, FileDown, Flag, PackageSearch, TriangleAlert } from "lucide-react";
import type { InformeDeMovimientosDto } from "@l2/contracts";
import { CAMPO_DE_FILTRO, Cifra, Container, PageHeader, Resumen, TAMANO_ICONO, cn } from "@l2/ui";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import type { MovimientosPedidos } from "./reportes.servidor.ts";
import { FiltroDePeriodo, TablaDeInforme, periodoEnPalabras } from "./informe.tsx";
import { conSigno, direccionDeMovimientos, seccionDeKardex, type ProductoDelKardex } from "./movimientos.tsx";

/**
 * Panel → Reportes → Movimientos (B11-3, M-29): el kárdex. De un producto o de una categoría y un periodo, cada entrada,
 * venta, salida, ajuste y conteo con su fecha, quién, el motivo y el saldo que dejó; el saldo al terminar es la
 * existencia a esa hora. Con una categoría, arriba un renglón por producto y, debajo, el kárdex del que se elija.
 * Periodo, producto y categoría van en la dirección; el PDF los lleva todos.
 */

const RUTA = "/panel/reportes/movimientos";
const IMPRESION = "/informes/movimientos";

export function MovimientosScreen({ hoy, pedido, informe }: MovimientosPedidos) {
  const { ajustes } = useSucursal();
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (p: MovimientosPedidos["pedido"]) => iniciar(() => router.push(direccionDeMovimientos(RUTA, p) as Route));
  // Una venta, una entrada o un conteo mueven la existencia mientras se mira.
  useAlCambiar(["catalogo"], () => router.refresh());
  const hay = informe.ok && informe.valor.productos.length > 0;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Reportes", href: "/panel/reportes" }, { texto: "Movimientos" }]}
        titulo="Movimientos"
        descripcion="El kárdex: cada entrada, venta, salida y conteo de un producto, con quién, el motivo y el saldo que dejó. El saldo al terminar es la existencia a esa hora."
        acciones={
          hay && (
            <Link
              href={direccionDeMovimientos(IMPRESION, pedido) as Route}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface px-3 text-detalle font-semibold text-ink hover:border-line-strong"
            >
              <FileDown size={TAMANO_ICONO.admin} aria-hidden="true" />
              PDF
            </Link>
          )
        }
      />

      <FiltroDePeriodo key={`${pedido.desde}|${pedido.hasta}`} hoy={hoy} desde={pedido.desde} hasta={pedido.hasta} cargando={cargando} onPeriodo={(p) => ir({ ...pedido, ...p })}>
        {informe.ok && (
          <>
            <label className="flex items-center gap-1.5 text-detalle text-ink-2">
              Producto
              <select value={pedido.producto ?? ""} onChange={(e) => ir({ ...pedido, producto: e.target.value || null, categoria: null })} className={cn(CAMPO_DE_FILTRO, "max-w-56")}>
                <option value="">—</option>
                {informe.valor.opciones.categorias.map((c) => (
                  <optgroup key={c} label={c}>
                    {informe.valor.opciones.productos
                      .filter((p) => p.categoria === c)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} · {p.sku}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-detalle text-ink-2">
              o categoría
              <select value={pedido.categoria ?? ""} onChange={(e) => ir({ ...pedido, producto: null, categoria: e.target.value || null })} className={cn(CAMPO_DE_FILTRO, "max-w-44")}>
                <option value="">—</option>
                {informe.valor.opciones.categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </FiltroDePeriodo>

      {!informe.ok ? (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-detalle font-medium text-state-crit">
          <TriangleAlert size={TAMANO_ICONO.admin} aria-hidden="true" />
          {informe.problemas?.[0]?.message ?? informe.mensaje}
        </p>
      ) : !hay ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-6 py-10 text-center">
          <PackageSearch size={TAMANO_ICONO.pos} className="text-ink-3" aria-hidden="true" />
          <p className="text-cuerpo font-semibold text-ink">Elige un producto o una categoría</p>
          <p className="max-w-[48ch] text-detalle text-ink-3">
            {informe.valor.opciones.productos.length === 0 ? "Todavía no hay productos que se cuenten en este local." : "Sus movimientos del periodo salen aquí, con el saldo después de cada uno."}
          </p>
        </div>
      ) : (
        <Kardex informe={informe.valor} cargando={cargando} />
      )}
    </Container>
  );
}

function Kardex({ informe, cargando }: { informe: InformeDeMovimientosDto; cargando: boolean }) {
  const reloj = useReloj();
  // De una categoría se abre primero el que se movió.
  const [elegido, setElegido] = useState((informe.productos.find((p) => p.movimientos.length > 0) ?? informe.productos[0]!).id);
  const actual: ProductoDelKardex = informe.productos.find((p) => p.id === elegido) ?? informe.productos[0]!;
  const categoria = informe.filtro.categoria;

  return (
    <div className={cn("flex flex-col gap-4 transition-opacity", cargando && "opacity-60")}>
      <p className="text-detalle text-ink-2">
        {periodoEnPalabras(informe.periodo)}
        {categoria ? ` · ${categoria}: ${informe.productos.length} ${informe.productos.length === 1 ? "producto" : "productos"}` : ""}
      </p>

      {categoria && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-detalle">
            <caption className="sr-only">Resumen de {categoria}: toca un producto para ver su kárdex</caption>
            <thead className="bg-surface-2">
              <tr>
                {["Producto", "Al empezar", "Entraron", "Salieron", "Al terminar"].map((t, i) => (
                  <th key={t} scope="col" className={cn("px-3 py-2 text-left text-etiqueta font-semibold tracking-[0.06em] text-ink-2 uppercase", i > 0 && "text-right")}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {informe.productos.map((p) => (
                <tr key={p.id} className={cn(p.id === actual.id && "bg-brand/10")}>
                  <td className="px-3 py-1.5">
                    <button type="button" aria-pressed={p.id === actual.id} onClick={() => setElegido(p.id)} className="cursor-pointer text-left font-semibold text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
                      {p.nombre} <span className="font-normal text-ink-3">· {p.sku}</span>
                    </button>
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">{p.inicial}</td>
                  <td className="tnum px-3 py-1.5 text-right">{p.entradas}</td>
                  <td className="tnum px-3 py-1.5 text-right">{p.salidas}</td>
                  <td className="tnum px-3 py-1.5 text-right font-semibold">{p.final}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Resumen etiqueta={`Resumen de ${actual.nombre}`}>
        <Cifra etiqueta="Al empezar" icono={<Flag />} valor={String(actual.inicial)} pie={categoria ? actual.nombre : "Lo que había el primer día"} />
        <Cifra etiqueta="Entraron" icono={<ArrowDownToLine />} valor={conSigno(actual.entradas)} pie="Compras y sobrantes" />
        <Cifra etiqueta="Salieron" icono={<ArrowUpFromLine />} valor={actual.salidas > 0 ? `−${actual.salidas}` : "0"} pie="Ventas y mermas" />
        <Cifra etiqueta="Al terminar" icono={<Flag />} valor={String(actual.final)} pie={actual.final === actual.existencia ? "Lo que hay ahora" : `Ahora hay ${actual.existencia}`} />
      </Resumen>

      <TablaDeInforme seccion={seccionDeKardex(actual, informe.periodo, reloj)} />
    </div>
  );
}
