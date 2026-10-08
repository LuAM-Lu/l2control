import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { InformeDeVentasDto, OrigenDeVenta } from "@l2/contracts";
import { TAMANO_ICONO, cn } from "@l2/ui";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { diaDelInforme, importe, porciento, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones del informe de ventas (B11-1): por medio, por origen, por cajera, por turno y lo anulado. Las pintan
 * la pantalla (una por pestaña) y el documento A4 (todas, una tras otra).
 */

/** La dirección de un informe: su periodo y, si se eligió, la cajera. */
export function direccionDeVentas(base: string, p: { desde: string; hasta: string; cajera: string | null }): string {
  const q = new URLSearchParams({ desde: p.desde, hasta: p.hasta });
  if (p.cajera) q.set("cajera", p.cajera);
  return `${base}?${q.toString()}`;
}

export type SeccionDeVentas = "medios" | "origen" | "cajeras" | "turnos" | "anuladas";

export const NOMBRE_ORIGEN: Readonly<Record<OrigenDeVenta, string>> = {
  PARQUE: "Parque",
  RESTAURANTE: "Restaurante",
  MOSTRADOR: "Mostrador",
  CUMPLEANOS: "Cumpleaños",
};

const CUADRE = {
  CUADRA: { Icono: CircleCheck, texto: "Cuadra con su Z", color: "text-state-ok" },
  NO_CUADRA: { Icono: TriangleAlert, texto: "No cuadra con su Z", color: "text-state-crit" },
  SIN_Z: { Icono: Clock, texto: "Sin Z todavía", color: "text-ink-2" },
} as const;

/** El cuadre de un turno con su Z: color, icono y texto (§8.2); en el papel, tinta negra. */
function Cuadre({ cuadre, papel }: { cuadre: InformeDeVentasDto["porTurno"][number]["cuadre"]; papel: boolean }) {
  const c = CUADRE[cuadre.estado];
  return (
    <span className="flex flex-col gap-0.5">
      <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && c.color)}>
        <c.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
        {c.texto}
      </span>
      {cuadre.diferencias.length > 0 && <span className={cn(!papel && "text-state-crit")}>{cuadre.diferencias.join(" · ")}</span>}
    </span>
  );
}

/** El punto de un turno abierto fuera del punto de cobro (B3-9, M-31): quién lo autorizó y por qué; en el papel, tinta negra. */
function Punto({ punto, fuera, papel }: { punto: string; fuera: { autorizadoPor: string; motivo: string }; papel: boolean }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{punto}</span>
      <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && "text-state-warn")}>
        <TriangleAlert size={TAMANO_ICONO.texto} aria-hidden="true" />
        Fuera del punto de cobro
      </span>
      <span className={cn(!papel && "text-ink-2")}>
        Autorizó {fuera.autorizadoPor}: «{fuera.motivo}»
      </span>
    </span>
  );
}

export function seccionesDeVentas(informe: InformeDeVentasDto, reloj: Reloj, papel = false): readonly SeccionDeInforme<SeccionDeVentas>[] {
  const { resumen } = informe;
  const vendido = BigInt(resumen.vendido.minor);
  const horario = (t: InformeDeVentasDto["porTurno"][number]) =>
    t.cerrado ? `${reloj.hora(Date.parse(t.abierto))} a ${reloj.hora(Date.parse(t.cerrado))}` : `Abierto desde ${reloj.hora(Date.parse(t.abierto))}`;
  return [
    {
      id: "medios",
      titulo: "Por medio de pago",
      columnas: [{ titulo: "Medio" }, { titulo: "Cobrado", derecha: true }, { titulo: "Vuelto", derecha: true }, { titulo: "Neto", derecha: true }, { titulo: "En dólares", derecha: true }],
      filas: informe.porMedio.map((m) => [m.nombre, importe(m.cobrado), importe(m.vuelto), importe(m.neto), m.enDolares ? importe(m.enDolares) : "Sin tasa"]),
      pie: ["Total cobrado", "", "", "", resumen.cobradoEnDolares ? importe(resumen.cobradoEnDolares) : "Sin tasa"],
      vacio: "Nada cobrado en el periodo.",
      nota: "Cada medio en su moneda. En dólares, con la tasa con que se cobró cada pago: lo de ayer no cambia con la tasa de hoy.",
    },
    {
      id: "origen",
      titulo: "Por origen",
      columnas: [{ titulo: "Origen" }, { titulo: "Ventas", derecha: true }, { titulo: "Vendido", derecha: true }, { titulo: "Parte", derecha: true }],
      filas: resumen.ventas === 0 ? [] : informe.porOrigen.map((o) => [NOMBRE_ORIGEN[o.origen], o.ventas, importe(o.vendido), porciento(BigInt(o.vendido.minor), vendido)]),
      pie: ["Total", resumen.ventas, importe(resumen.vendido), resumen.ventas === 0 ? "—" : "100,0 %"],
      vacio: "Ninguna venta en el periodo.",
      nota: "El origen es la cuenta en que se cobró: una familia es del parque, una mesa o una cuenta de pie del restaurante y un evento, un cumpleaños.",
    },
    {
      id: "cajeras",
      titulo: "Por cajera",
      columnas: [{ titulo: "Cajera" }, { titulo: "Ventas", derecha: true }, { titulo: "Vendido", derecha: true }, { titulo: "Anuladas", derecha: true }],
      filas: informe.porCajera.map((c) => [c.cajera, c.ventas, importe(c.vendido), c.anuladas]),
      pie: ["Total", resumen.ventas, importe(resumen.vendido), resumen.anuladas],
      vacio: "Ninguna venta en el periodo.",
    },
    {
      id: "turnos",
      titulo: "Por turno",
      columnas: [
        { titulo: "Día", clase: "whitespace-nowrap" },
        { titulo: "Punto" },
        { titulo: "Abrió" },
        { titulo: "Horario", clase: "whitespace-nowrap" },
        { titulo: "Ventas", derecha: true },
        { titulo: "Anuladas", derecha: true },
        { titulo: "Vendido", derecha: true },
        { titulo: "Cierre Z" },
      ],
      filas: informe.porTurno.map((t) => [
        diaDelInforme(t.dia),
        t.fueraDelPunto ? <Punto key="p" punto={t.punto} fuera={t.fueraDelPunto} papel={papel} /> : t.punto,
        t.abrio,
        horario(t),
        t.ventas,
        t.anuladas,
        importe(t.vendido),
        <Cuadre key="z" cuadre={t.cuadre} papel={papel} />,
      ]),
      pie: ["Total", "", "", "", resumen.ventas, resumen.anuladas, importe(resumen.vendido), ""],
      vacio: "Ningún turno en el periodo.",
      nota: "Un turno con su Z da lo mismo que su Z. Sin Z, sus cifras pueden cambiar hasta que se cierre. «Fuera del punto de cobro»: se abrió en otro equipo, con el PIN de administración y su motivo.",
    },
    {
      id: "anuladas",
      titulo: "Ventas anuladas",
      columnas: [
        { titulo: "Orden" },
        { titulo: "Cobrada", clase: "whitespace-nowrap" },
        { titulo: "Anulada", clase: "whitespace-nowrap" },
        { titulo: "Cajera" },
        { titulo: "Total", derecha: true },
        { titulo: "Motivo" },
        { titulo: "Autorizó" },
      ],
      filas: informe.anuladas.map((a) => [`#${a.orden}`, reloj.diaYHora(Date.parse(a.cobradaEn)), reloj.diaYHora(Date.parse(a.anuladaEn)), a.cajera, importe(a.total), a.motivo, a.autorizadoPor]),
      pie: ["Total anulado", "", "", "", importe(resumen.anulado), "", ""],
      vacio: "Ninguna venta anulada en el periodo.",
      nota: "Lo anulado no entra en lo vendido ni en lo cobrado.",
    },
  ];
}
