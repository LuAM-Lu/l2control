import type { InformeDeInventarioDto } from "@l2/contracts";
import { EstadoStock } from "../inventario/EstadoStock.tsx";
import { NombreDeProducto, importe, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones del inventario al momento (B11-2): una por categoría, con su subtotal. Las pintan la pantalla y el
 * documento A4; el filtro (estado y categoría) es el mismo en los dos, y va en la dirección del PDF.
 */

export type FiltroDeEstado = "TODOS" | "AGOTADO" | "BAJO_MINIMO" | "SIN_INICIAL";
export type FiltroDeInventario = Readonly<{ estado: FiltroDeEstado; categoria: string | null }>;

const TEXTO_ESTADO = { SIN_INICIAL: "Sin inventario inicial", AGOTADO: "Agotado", BAJO_MINIMO: "Bajo mínimo", BIEN: "Bien" } as const;

/** Lo que el filtro deja ver. */
export function productosFiltrados(i: InformeDeInventarioDto, f: FiltroDeInventario) {
  return i.productos.filter((p) => (f.estado === "TODOS" || p.estado === f.estado) && (f.categoria === null || p.categoria === f.categoria));
}

/** La dirección del PDF con el filtro puesto. */
export function direccionDeInventario(base: string, f: FiltroDeInventario): string {
  const q = new URLSearchParams();
  if (f.estado !== "TODOS") q.set("estado", f.estado);
  if (f.categoria) q.set("categoria", f.categoria);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function seccionesDeInventario(i: InformeDeInventarioDto, f: FiltroDeInventario, papel = false): readonly SeccionDeInforme[] {
  const productos = productosFiltrados(i, f);
  const categorias = [...new Set(productos.map((p) => p.categoria))];
  return categorias.map((categoria) => {
    const de = productos.filter((p) => p.categoria === categoria);
    const valor = de.reduce((s, p) => s + BigInt(p.valor.minor), 0n);
    const unidades = de.reduce((s, p) => s + p.existencia, 0);
    return {
      id: categoria,
      titulo: `${categoria} · ${de.length} ${de.length === 1 ? "producto" : "productos"}`,
      columnas: [
        { titulo: "Producto" },
        // B11-5: «Sin inventario inicial» en un renglón: partido, duplicaba el alto de cada fila del PDF.
        { titulo: "Estado", clase: "whitespace-nowrap" },
        { titulo: "Existencia", derecha: true },
        { titulo: "Mínimo", derecha: true },
        { titulo: "Costo prom.", derecha: true },
        { titulo: "Valor al costo", derecha: true },
      ],
      filas: de.map((p) => [
        // B11-5: en el papel, el nombre y su SKU y presentación en un renglón.
        <NombreDeProducto key="n" nombre={`${p.nombre}${p.retirado ? " (retirado)" : ""}`} detalle={[p.sku, p.presentacion].filter(Boolean).join(" · ")} papel={papel} />,
        papel ? TEXTO_ESTADO[p.estado] : <EstadoStock key="e" estado={p.estado} />,
        p.estado === "SIN_INICIAL" ? "—" : p.existencia,
        p.minimo ?? "—",
        p.costoPromedio ? importe(p.costoPromedio) : "—",
        importe(p.valor),
      ]),
      pie: [`Total de ${categoria}`, "", unidades, "", "", importe({ minor: String(valor), currency: "USD" })],
      vacio: "",
    };
  });
}
