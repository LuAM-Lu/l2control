"use client";

import type { CatalogoDto } from "@l2/contracts";
import { DocumentoDeInforme, NombreDeProducto, SeccionImpresa, enBandas } from "../reportes/informe.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * La hoja de conteo a ciegas (B9-10, M-29): los productos que se cuentan, por categoría, con una casilla en blanco para
 * lo que hay en el estante. NO lleva lo que dice el sistema: quien cuenta no tiene un número al que acercarse. Se imprime
 * entera o de una categoría, se llena a mano con el local cerrado y se carga en Salidas y conteo → Contar.
 * B11-5 (M-35): una sola tabla, la categoría como franja y un renglón por producto con su presentación al lado; la
 * casilla, alta para escribir. Unos 40 productos por hoja.
 */
export function HojaDeConteo({ catalogo, categoria, generadoEn }: { catalogo: CatalogoDto; categoria: string | null; generadoEn: string }) {
  const { ajustes } = useSucursal();
  const productos = catalogo.productos
    .filter((p) => p.controlaStock && p.activo && (categoria === null || p.categoria === categoria))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es"));
  const categorias = [...new Set(productos.map((p) => p.categoria))];
  let n = 0;
  return (
    <DocumentoDeInforme
      titulo="Hoja de conteo"
      local={ajustes.nombre}
      periodo="Contado el ____ / ____ / ______, de las ______ a las ______"
      filtro={categoria ? `Categoría ${categoria}` : "Todo el inventario"}
      generadoEn={generadoEn}
      volver="/panel/inventario/salidas"
    >
      <p className="mb-2 text-[9pt]">
        Cuenta lo que hay en el estante y escríbelo en «Contado». Esta hoja no dice lo que espera el sistema, a propósito. Con
        el local cerrado; después se carga en Inventario → Salidas y conteo → Contar.
      </p>
      {productos.length === 0 ? (
        <p className="text-[10pt]">Ningún producto que se cuente{categoria ? ` en ${categoria}` : ""}.</p>
      ) : (
        <SeccionImpresa
          seccion={enBandas(
            "productos",
            `${productos.length} ${productos.length === 1 ? "producto" : "productos"}`,
            categorias.map((c) => ({
              id: c,
              titulo: c,
              columnas: [
                { titulo: "N.º", clase: "w-[9mm]" },
                { titulo: "Producto" },
                { titulo: "SKU · código", clase: "text-[8pt]" },
                { titulo: "Contado", clase: "h-[6mm] w-[30mm] border-l border-current/50" },
              ],
              filas: productos
                .filter((p) => p.categoria === c)
                .map((p) => [String(++n), <NombreDeProducto key="p" nombre={p.nombre} detalle={p.presentacion} papel />, [p.sku, p.codigoBarras].filter(Boolean).join(" · "), ""]),
              vacio: "",
            })),
          )}
        />
      )}
      <div className="mt-6 grid grid-cols-2 gap-8 text-[9.5pt]">
        <p className="border-t border-current pt-1">Contó (nombre y firma)</p>
        <p className="border-t border-current pt-1">Revisó (nombre y firma)</p>
      </div>
    </DocumentoDeInforme>
  );
}
