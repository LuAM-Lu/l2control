import type { InformeDeMovimientosDto, TipoDeMovimiento } from "@l2/contracts";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { diaDelInforme, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones del kárdex (B11-3): una por producto, con el saldo al empezar, cada movimiento con el saldo que dejó y el
 * saldo al terminar. Las pintan la pantalla (el producto elegido) y el documento A4 (todos, uno tras otro).
 */

export type ProductoDelKardex = InformeDeMovimientosDto["productos"][number];

export const NOMBRE_MOVIMIENTO: Readonly<Record<TipoDeMovimiento, string>> = {
  VENTA: "Venta",
  DEVOLUCION: "Devolución",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste por conteo",
  CONTEO: "Conteo",
  INICIAL: "Inventario inicial",
  ANULACION: "Entrada anulada",
  RETORNO: "Devuelto por un cliente",
};

/** Una cantidad con su signo: «+24», «−2», «0». */
export const conSigno = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** La dirección del kárdex: su periodo y el producto o la categoría. */
export function direccionDeMovimientos(base: string, p: { desde: string; hasta: string; producto: string | null; categoria: string | null }): string {
  // La vista del kárdex (B11-7): Movimientos, sin ella, es todo lo que pasó en el periodo.
  const q = new URLSearchParams({ vista: "kardex", desde: p.desde, hasta: p.hasta });
  if (p.producto) q.set("producto", p.producto);
  else if (p.categoria) q.set("categoria", p.categoria);
  return `${base}?${q.toString()}`;
}

export function seccionDeKardex(p: ProductoDelKardex, periodo: { desde: string; hasta: string }, reloj: Reloj): SeccionDeInforme {
  return {
    id: p.id,
    titulo: `${p.nombre} · ${p.sku}`,
    columnas: [
      { titulo: "Fecha", clase: "whitespace-nowrap" },
      { titulo: "Movimiento", clase: "whitespace-nowrap" },
      { titulo: "Detalle" },
      { titulo: "Quién" },
      { titulo: "Cantidad", derecha: true },
      { titulo: "Saldo", derecha: true },
    ],
    filas: [
      [diaDelInforme(periodo.desde), "Saldo al empezar", "", "", "", p.inicial],
      ...p.movimientos.map((m) => [
        reloj.diaYHora(Date.parse(m.en)),
        NOMBRE_MOVIMIENTO[m.tipo],
        m.detalle,
        m.autorizo && m.autorizo !== m.quien ? `${m.quien} · autorizó ${m.autorizo}` : m.quien,
        conSigno(m.cantidad),
        m.saldo,
      ]),
    ],
    pie: ["Saldo al terminar", "", "", `Entraron ${p.entradas} · salieron ${p.salidas}`, conSigno(p.entradas - p.salidas), p.final],
    vacio: "",
    ...(p.movimientos.length === 0 ? { nota: "Ningún movimiento en el periodo." } : {}),
  };
}

/** El resumen de una categoría: un renglón por producto. */
export function seccionDeResumen(i: InformeDeMovimientosDto): SeccionDeInforme {
  return {
    id: "resumen",
    titulo: "Resumen",
    columnas: [{ titulo: "Producto" }, { titulo: "Al empezar", derecha: true }, { titulo: "Entraron", derecha: true }, { titulo: "Salieron", derecha: true }, { titulo: "Al terminar", derecha: true }, { titulo: "Hoy hay", derecha: true }],
    filas: i.productos.map((p) => [`${p.nombre} · ${p.sku}`, p.inicial, p.entradas, p.salidas, p.final, p.existencia]),
    vacio: "Ningún producto que se cuente.",
  };
}
