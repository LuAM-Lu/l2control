import { Baby, Footprints, ScanLine, Shirt } from "lucide-react";
import type { ExcepcionDelParqueDto, InformeDelParqueDto } from "@l2/contracts";
import { TAMANO_ICONO, cn } from "@l2/ui";
import type { Reloj } from "../sucursal/SucursalProvider.tsx";
import { diaDelInforme, importe, type SeccionDeInforme } from "./informe.tsx";

/**
 * Las secciones del informe del parque (B11-6, M-37): por día, por hora de entrada, el dinero del tiempo, las estancias
 * y las excepciones. Las pintan la pantalla (una por pestaña) y el documento A4 (todas, compactas).
 */

export type SeccionDelParque = "dias" | "horas" | "dinero" | "estancias" | "excepciones";

/** La dirección del informe: su periodo. */
export function direccionDelParque(base: string, p: { desde: string; hasta: string }): string {
  return `${base}?${new URLSearchParams({ desde: p.desde, hasta: p.hasta }).toString()}`;
}

/** «2:00 pm» (o «14:00» con el formato de 24 h del local): una hora del día, no un instante, así que sin zona. */
export function horaDelDia(h: number, formato: "12h" | "24h"): string {
  if (formato === "24h") return `${String(h).padStart(2, "0")}:00`;
  const doce = h % 12 === 0 ? 12 : h % 12;
  return `${doce}:00 ${h < 12 ? "am" : "pm"}`;
}

/** «1 h 25 min», «40 min». */
export const duracion = (min: number | null) => (min === null ? "—" : min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);

const TIPO: Readonly<Record<ExcepcionDelParqueDto["tipo"], { texto: string; Icono: typeof Baby }>> = {
  SIN_PULSERA: { texto: "Sin pulsera", Icono: ScanLine },
  A_REVISAR: { texto: "A revisar", Icono: Footprints },
  RECOGIDO_POR_OTRO: { texto: "Lo recogió otra persona", Icono: Baby },
  MEDIAS: { texto: "Medias", Icono: Shirt },
};

/** El tipo de una excepción, con su icono y su texto (§8.2); en el papel, tinta negra. */
function TipoDeExcepcion({ tipo, papel }: { tipo: ExcepcionDelParqueDto["tipo"]; papel: boolean }) {
  const t = TIPO[tipo];
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold whitespace-nowrap", !papel && "text-ink-2")}>
      <t.Icono size={TAMANO_ICONO.texto} aria-hidden="true" />
      {t.texto}
    </span>
  );
}

export function seccionesDelParque(i: InformeDelParqueDto, reloj: Reloj, formatoHora: "12h" | "24h", papel = false): SeccionDeInforme<SeccionDelParque>[] {
  const max = Math.max(1, ...i.porHora.map((h) => h.ninos));
  const d = i.dinero;
  const total = (k: keyof Pick<InformeDelParqueDto["porDia"][number], "paquetes" | "recargas" | "tiempoDeMas" | "total">) =>
    importe({ minor: String(i.porDia.reduce((n, x) => n + BigInt(x[k].minor), 0n)), currency: "USD" });
  return [
    {
      id: "dias",
      titulo: "Por día",
      columnas: [{ titulo: "Día" }, { titulo: "Niños", derecha: true }, { titulo: "Pico", derecha: true }, { titulo: "Paquetes", derecha: true }, { titulo: "Recargas", derecha: true }, { titulo: "Tiempo de más", derecha: true }, { titulo: "Total", derecha: true }],
      filas: i.porDia.map((x) => [
        <span key="d" className="whitespace-nowrap">{diaDelInforme(x.dia)}</span>,
        <span key="n" className="tnum">{x.ninos}</span>,
        <span key="p" className="tnum">{x.pico}</span>,
        <span key="q" className="tnum">{importe(x.paquetes)}</span>,
        <span key="r" className="tnum">{importe(x.recargas)}</span>,
        <span key="t" className="tnum">{importe(x.tiempoDeMas)}</span>,
        <span key="s" className="tnum font-semibold">{importe(x.total)}</span>,
      ]),
      pie: ["Total", <span key="n" className="tnum">{i.resumen.ninos}</span>, <span key="p" className="tnum">{i.resumen.pico?.ninos ?? 0}</span>, total("paquetes"), total("recargas"), total("tiempoDeMas"), total("total")],
      vacio: "Ningún niño entró en este periodo.",
      nota: "Pico: los niños a la vez en la sala, el máximo del día. El dinero es el de las estancias que empezaron ese día, donde terminó cada línea (también en las mesas).",
    },
    {
      id: "horas",
      titulo: "Por hora de entrada",
      columnas: [{ titulo: "Hora" }, { titulo: "Niños", derecha: true }, { titulo: "", clase: "w-1/2" }],
      filas: i.porHora.map((h) => [
        <span key="h" className="tnum whitespace-nowrap">{horaDelDia(h.hora, formatoHora)}</span>,
        <span key="n" className="tnum">{h.ninos}</span>,
        <span key="b" className="block h-2 rounded-full bg-current/50" style={{ width: `${Math.round((h.ninos / max) * 100)}%` }} aria-hidden="true" />,
      ]),
      vacio: "Ningún niño entró en este periodo.",
      nota: "Los que entraron a cada hora, sumando los días del periodo.",
    },
    {
      id: "dinero",
      titulo: "El dinero del tiempo",
      columnas: [{ titulo: "Concepto" }, { titulo: "Cuántos", derecha: true }, { titulo: "Monto", derecha: true }],
      filas: [
        ["Paquetes", <span key="c" className="tnum">{d.paquetes.cantidad}</span>, <span key="m" className="tnum">{importe(d.paquetes.monto)}</span>],
        [`Recargas (${duracion(d.recargas.minutos)})`, <span key="c" className="tnum">{d.recargas.cantidad}</span>, <span key="m" className="tnum">{importe(d.recargas.monto)}</span>],
        ["Tiempo de más", <span key="c" className="tnum">{d.tiempoDeMas.cantidad}</span>, <span key="m" className="tnum">{importe(d.tiempoDeMas.monto)}</span>],
        ["De ello, pagado en mesas", <span key="c" className="tnum">{d.enMesas.cantidad}</span>, <span key="m" className="tnum">{importe(d.enMesas.monto)}</span>],
        ["Regalado (no suma)", <span key="c" className="tnum">{d.regalado.cantidad}</span>, <span key="m" className="tnum">{importe(d.regalado.monto)}</span>],
        ...d.porPaquete.map((p) => [<span key="p" className={cn(!papel && "text-ink-2")}>Paquete {p.paquete}: {p.ninos} {p.ninos === 1 ? "niño" : "niños"}</span>, "", <span key="m" className="tnum">{importe(p.monto)}</span>]),
      ],
      pie: ["Total del parque", "", <span key="t" className="tnum">{importe(i.resumen.dinero)}</span>],
      vacio: "Sin dinero del parque en este periodo.",
      nota: "Lo anulado y lo cambiado por uso no cuentan: cuenta lo que se cobró en su lugar. El IVA va aparte, en Ventas.",
    },
    {
      id: "estancias",
      titulo: "Las estancias",
      columnas: [{ titulo: "Qué" }, { titulo: "Cuántas", derecha: true }],
      filas: [
        ["Salieron", <span key="v" className="tnum">{i.estancias.salieron}</span>],
        ["Siguen en la sala", <span key="v" className="tnum">{i.estancias.enSala}</span>],
        [`Tiempo promedio (sin pausas): ${duracion(i.resumen.minutosPromedio)}`, ""],
        [`Pausas por comida${i.estancias.minutosDePausaPromedio !== null ? ` (${duracion(i.estancias.minutosDePausaPromedio)} en promedio)` : ""}`, <span key="v" className="tnum">{i.estancias.pausas}</span>],
        ["Salieron antes de tiempo", <span key="v" className="tnum">{i.estancias.antesDeTiempo}</span>],
        ["Cobradas por lo que usaron", <span key="v" className="tnum">{i.estancias.porUso}</span>],
        ["Invitados de cumpleaños", <span key="v" className="tnum">{i.estancias.invitadosDeCumpleanos}</span>],
      ],
      vacio: "Sin estancias en este periodo.",
    },
    {
      id: "excepciones",
      titulo: `Las excepciones (${i.excepciones.length})`,
      columnas: [{ titulo: "Cuándo" }, { titulo: "Qué" }, { titulo: "Niño" }, { titulo: "Detalle" }],
      filas: i.excepciones.map((e) => [
        <span key="c" className="tnum whitespace-nowrap">{reloj.diaYHora(Date.parse(e.en))}</span>,
        <TipoDeExcepcion key="t" tipo={e.tipo} papel={papel} />,
        <span key="n">
          <span className="font-semibold">{e.nino}</span>
          <span className={cn("block text-nota", !papel && "text-ink-3")} {...(papel ? {} : { "data-privado": "" })}>
            {e.pulsera} · {e.representante}
          </span>
        </span>,
        <span key="d">{e.detalle}</span>,
      ]),
      vacio: "Sin excepciones en este periodo.",
    },
  ];
}
