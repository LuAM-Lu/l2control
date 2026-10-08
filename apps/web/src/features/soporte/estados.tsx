"use client";

import { CircleCheckBig, CircleDot, Eye, Hammer, MailCheck, MailWarning, MailQuestion } from "lucide-react";
import type { EstadoReporte, ReporteDto } from "@l2/contracts";
import { Badge, type Tone } from "@l2/ui";

/**
 * Cómo se dice el estado de un reporte (T-11), con color, icono y texto (§8.2). «Nuevo» pide atención (aviso);
 * «resuelto» es el bueno (ok); «en curso», de la marca; «visto», neutro.
 */
const ESTADO: Readonly<Record<EstadoReporte, { texto: string; tono: Tone; Icono: typeof CircleDot }>> = {
  NUEVO: { texto: "Nuevo", tono: "warn", Icono: CircleDot },
  VISTO: { texto: "Visto", tono: "idle", Icono: Eye },
  EN_CURSO: { texto: "En curso", tono: "brand", Icono: Hammer },
  RESUELTO: { texto: "Resuelto", tono: "ok", Icono: CircleCheckBig },
};

export function EstadoDeReporte({ reporte }: { reporte: Pick<ReporteDto, "estado" | "resueltoEn"> }) {
  const e = ESTADO[reporte.estado];
  return (
    <Badge tone={e.tono} icon={<e.Icono size={12} aria-hidden="true" />}>
      {reporte.estado === "RESUELTO" && reporte.resueltoEn ? `Resuelto en v${reporte.resueltoEn}` : e.texto}
    </Badge>
  );
}

export const textoDeEstado = (estado: EstadoReporte) => ESTADO[estado].texto;

const AVISO: Readonly<Record<ReporteDto["aviso"], { texto: string; tono: Tone; Icono: typeof MailCheck }>> = {
  PENDIENTE: { texto: "Aviso pendiente", tono: "idle", Icono: MailQuestion },
  ENVIADO: { texto: "Avisado", tono: "ok", Icono: MailCheck },
  FALLO: { texto: "El aviso no salió", tono: "crit", Icono: MailWarning },
};

/** Cómo va el aviso por correo al desarrollo (D-SOP). */
export function AvisoDeReporte({ aviso }: { aviso: ReporteDto["aviso"] }) {
  const a = AVISO[aviso];
  return (
    <Badge tone={a.tono} icon={<a.Icono size={12} aria-hidden="true" />}>
      {a.texto}
    </Badge>
  );
}
