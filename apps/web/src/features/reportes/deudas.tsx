import { CircleCheckBig, CircleX, Clock } from "lucide-react";
import type { InformeDeDeudasDto, PasoDeDeudaDto } from "@l2/contracts";
import { TAMANO_ICONO, cn } from "@l2/ui";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { importe, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones del informe de deudas (B11-4, M-33): las deudas del periodo, por mesero, por quien autorizó y la
 * historia de cada una. Las pintan la pantalla (una por pestaña, la historia de la elegida) y el documento A4 (todas,
 * una tras otra). El cliente va con su cédula y su teléfono completos: el informe es para cobrarle. En la pantalla
 * llevan `data-privado`, para que la captura de un reporte de problema no los lleve.
 */

export type DeudaDelInforme = InformeDeDeudasDto["deudas"][number];
export type SeccionDeDeudas = "deudas" | "meseros" | "autorizaron";

/** La dirección del informe: su periodo. */
export function direccionDeDeudas(base: string, p: { desde: string; hasta: string }): string {
  return `${base}?${new URLSearchParams({ desde: p.desde, hasta: p.hasta }).toString()}`;
}

export const ordenDeDeuda = (n: number) => `#${String(n).padStart(4, "0")}`;

export const NOMBRE_PASO: Readonly<Record<PasoDeDeudaDto["que"], string>> = {
  SENTADO: "Lo sentó",
  VENTA: "La vendió",
  PEDIDO: "Pidió",
  SERVIDO: "Servido",
  SE_FUE: "Se fue sin pagar",
  EN_COBRO: "Pasó a la caja",
  DEVUELTA: "Volvió a deudas",
  COBRADA: "Cobrada",
  PERDIDA: "Dada por perdida",
};

const ESTADO = {
  PENDIENTE: { Icono: Clock, texto: "Pendiente", color: "text-state-warn" },
  COBRADA: { Icono: CircleCheckBig, texto: "Cobrada", color: "text-state-ok" },
  PERDIDA: { Icono: CircleX, texto: "Perdida", color: "text-state-crit" },
} as const;

/** Los días que lleva una pendiente: «desde hoy», «1 día», «3 días». */
export const diasQueLleva = (dias: number) => (dias === 0 ? "desde hoy" : dias === 1 ? "1 día" : `${dias} días`);

/** Cómo terminó una deuda: color, icono y texto (§8.2); una pendiente, con los días que lleva. En el papel, tinta negra. */
export function EstadoDeDeuda({ estado, dias, papel = false }: { estado: DeudaDelInforme["estado"]; dias?: number | undefined; papel?: boolean }) {
  const e = ESTADO[estado];
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 font-semibold", !papel && e.color)}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <e.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
        {e.texto}
      </span>
      {/* Los días bajan a su renglón si no caben: nunca se cortan. */}
      {estado === "PENDIENTE" && dias !== undefined && <span className="font-normal whitespace-nowrap">· {diasQueLleva(dias)}</span>}
    </span>
  );
}

/**
 * El detalle de un paso con su importe: lo que valía un pedido, o lo cobrado y con qué. Con los precios sin IVA (ajuste
 * de la sucursal), lo pedido es antes del IVA: «$ 2.50 + IVA», y la deuda, con él.
 */
export function detalleDelPaso(p: PasoDeDeudaDto, preciosConIva: boolean): string {
  const iva = !preciosConIva && (p.que === "PEDIDO" || p.que === "VENTA") ? " + IVA" : "";
  const con = p.medios && p.medios.length > 0 ? ` con ${p.medios.map((m) => `${m.nombre} (${importe(m.monto)})`).join(", ")}` : "";
  return [p.detalle, p.monto ? `${importe(p.monto)}${iva}${con}` : null].filter(Boolean).join(" · ");
}

/** El cliente con sus datos completos, para llamarlo y cobrarle. */
export function ClienteDeLaDeuda({ cliente, papel = false }: { cliente: DeudaDelInforme["cliente"]; papel?: boolean }) {
  return (
    <span className="flex flex-col">
      <span className={cn("font-semibold", !papel && "text-ink")}>{cliente.nombre}</span>
      <span data-privado className={cn("tnum whitespace-nowrap", !papel && "text-ink-2")}>
        {cliente.cedula} · {cliente.telefono}
      </span>
    </span>
  );
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function seccionesDeDeudas(informe: InformeDeDeudasDto, reloj: Reloj, papel = false): readonly SeccionDeInforme<SeccionDeDeudas>[] {
  const { resumen } = informe;
  const marcadoEl = (d: DeudaDelInforme) => d.historia.find((p) => p.que === "SE_FUE")?.en;
  // En una pantalla angosta, la hora y el lugar se leen en la historia: la tabla deja a la vista lo que debe y cómo está.
  const secundaria = papel ? "whitespace-nowrap" : "whitespace-nowrap max-lg:hidden";
  return [
    {
      id: "deudas",
      titulo: "Las deudas",
      columnas: [
        { titulo: "Orden", clase: "whitespace-nowrap" },
        { titulo: "Se fue", clase: secundaria },
        { titulo: "Cliente" },
        { titulo: "Lugar", clase: secundaria },
        { titulo: "Lo sentó" },
        { titulo: "Debe", derecha: true },
        { titulo: "Cómo está" },
      ],
      filas: informe.deudas.map((d) => {
        const en = marcadoEl(d);
        return [
          ordenDeDeuda(d.orden),
          en ? reloj.diaYHora(Date.parse(en)) : "—",
          <ClienteDeLaDeuda key="c" cliente={d.cliente} papel={papel} />,
          d.lugar,
          d.sentadoPor,
          importe(d.monto),
          <EstadoDeDeuda key="e" estado={d.estado} dias={d.diasPendiente} papel={papel} />,
        ];
      }),
      pie: ["Quedaron en el periodo", "", plural(resumen.quedaron.cantidad, "deuda", "deudas"), "", "", importe(resumen.quedaron.monto), ""],
      vacio: "Nadie se fue sin pagar en el periodo.",
      nota: "Salen las que quedaron en el periodo y las que se cobraron o se dieron por perdidas en él. «Lo sentó»: quien abrió la cuenta y pidió los datos; en el mostrador, la cajera que dejó la venta pendiente.",
    },
    {
      id: "meseros",
      titulo: "Por mesero",
      columnas: [
        { titulo: "Lo sentó" },
        { titulo: "Deudas", derecha: true },
        { titulo: "Por", derecha: true },
        { titulo: "Cobradas", derecha: true },
        { titulo: "Perdidas", derecha: true },
        { titulo: "Pendientes", derecha: true },
      ],
      filas: informe.porMesero.map((m) => [m.nombre, m.deudas, importe(m.monto), m.cobradas, m.perdidas, m.pendientes]),
      pie: [
        "Total",
        resumen.quedaron.cantidad,
        importe(resumen.quedaron.monto),
        informe.porMesero.reduce((n, m) => n + m.cobradas, 0),
        informe.porMesero.reduce((n, m) => n + m.perdidas, 0),
        informe.porMesero.reduce((n, m) => n + m.pendientes, 0),
      ],
      vacio: "Nadie se fue sin pagar en el periodo.",
      nota: "Las que quedaron en el periodo, a nombre de quien sentó al cliente, y cómo están hoy.",
    },
    {
      id: "autorizaron",
      titulo: "Por quien autorizó",
      columnas: [{ titulo: "Autorizó" }, { titulo: "Dejó en deuda", derecha: true }, { titulo: "Por", derecha: true }, { titulo: "Dio por perdidas", derecha: true }],
      filas: informe.porAutorizador.map((a) => [a.nombre, a.marcadas, importe(a.monto), a.perdidas]),
      pie: ["Total", resumen.quedaron.cantidad, importe(resumen.quedaron.monto), resumen.perdido.cantidad],
      vacio: "Nadie autorizó una deuda en el periodo.",
      nota: "«Se fue sin pagar» pide el PIN de supervisión; «Dar por perdida», el de administración, con su motivo.",
    },
  ];
}

/** La historia de una deuda, de la mesa al desenlace: cada paso con su hora, quién y el detalle. */
export function seccionDeHistoria(d: DeudaDelInforme, reloj: Reloj, preciosConIva: boolean, papel = false): SeccionDeInforme {
  return {
    id: d.id,
    titulo: `${ordenDeDeuda(d.orden)} · ${d.cliente.nombre} · ${d.lugar} · ${importe(d.monto)}`,
    columnas: [{ titulo: "Cuándo", clase: "whitespace-nowrap" }, { titulo: "Qué pasó", clase: "whitespace-nowrap" }, { titulo: "Quién" }, { titulo: "Detalle" }],
    filas: d.historia.map((p) => [
      reloj.diaYHora(Date.parse(p.en)),
      p.que === "COBRADA" || p.que === "PERDIDA" ? <EstadoDeDeuda key="e" estado={p.que} papel={papel} /> : NOMBRE_PASO[p.que],
      p.quien,
      detalleDelPaso(p, preciosConIva),
    ]),
    vacio: "",
  };
}
