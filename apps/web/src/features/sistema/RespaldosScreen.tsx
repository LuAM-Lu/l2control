"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleSlash, Download, HardDrive, ShieldAlert, TriangleAlert } from "lucide-react";
import type { CopiaDeRespaldoDto, EstadoDeRespaldosDto, NivelDeRespaldos, Resultado } from "@l2/contracts";
import { Container, PageHeader, cn } from "@l2/ui";
import { useAlCambiar } from "../operacion/TiempoRealProvider.tsx";
import { useReloj, useSucursal } from "../sucursal/SucursalProvider.tsx";
import { PcDelLocal } from "./PcDelLocal.tsx";

/**
 * Ajustes → Sistema · Respaldos (B7-4, M-26). Cada noche el servidor hace un respaldo cifrado de la base y una
 * PC del local lo baja; aquí se ve si el de anoche se hizo y si ya salió del servidor. Nada se configura desde
 * aquí: lo hace el servidor (`infra/produccion/respaldar.sh`) y la PC del local (su tarea programada).
 */

const NIVEL: Readonly<Record<NivelDeRespaldos, { tono: "ok" | "warn" | "crit"; icono: typeof CheckCircle2 }>> = {
  AL_DIA: { tono: "ok", icono: CheckCircle2 },
  SIN_BAJAR: { tono: "warn", icono: TriangleAlert },
  SIN_RESPALDOS: { tono: "warn", icono: TriangleAlert },
  ATRASADO: { tono: "crit", icono: ShieldAlert },
  FALLIDO: { tono: "crit", icono: AlertTriangle },
};

const numero = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 });
/** «412 KB», «1,2 MB». */
function tamano(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1_048_576) return `${numero.format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${numero.format(bytes / 1_048_576)} MB`;
}

/** «hace 5 h», «hace 2 días». */
function hace(iso: string, ahora: number): string {
  const h = Math.max(0, Math.floor((ahora - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "hace menos de una hora";
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

export function RespaldosScreen({ estado: r, servidor }: { estado: Resultado<EstadoDeRespaldosDto>; servidor: string }) {
  const router = useRouter();
  const { ajustes } = useSucursal();
  const reloj = useReloj();
  // Lo que escribe el servidor (el respaldo de la noche) y la PC (su bajada) llega en vivo.
  useAlCambiar(["sistema"], () => router.refresh());

  if (!r.ok) {
    return (
      <Container ancho="panel" className="py-8">
        <p role="alert" className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-4 py-3 text-[13px] text-state-crit">
          <TriangleAlert size={16} aria-hidden="true" />
          {r.mensaje}
        </p>
      </Container>
    );
  }
  const e = r.valor;
  const ahora = Date.now();
  const n = NIVEL[e.nivel];
  const Icono = n.icono;
  const enServidor = e.copias.filter((c) => c.estado === "HECHO" && !c.retiradoEn).length;

  return (
    <Container ancho="panel" className="py-8">
      <PageHeader
        migas={[{ texto: ajustes.nombre, href: "/panel" }, { texto: "Ajustes", href: "/panel/ajustes" }, { texto: "Respaldos" }]}
        titulo="Respaldos"
        descripcion="Cada noche el servidor guarda un respaldo de la base, cifrado con la clave del local, y una PC del local lo baja. Sin esa clave, que no está en el servidor, nadie lo puede abrir."
      />

      <p
        role={n.tono === "ok" ? "status" : "alert"}
        className={cn(
          "mb-4 flex items-start gap-2 rounded-[var(--radius-card)] border px-4 py-3 text-[13.5px] font-medium",
          n.tono === "ok" && "border-state-ok/40 bg-state-ok-bg text-state-ok",
          n.tono === "warn" && "border-state-warn/40 bg-state-warn-bg text-state-warn",
          n.tono === "crit" && "border-state-crit/40 bg-state-crit-bg text-state-crit",
        )}
      >
        <Icono size={17} className="mt-px shrink-0" aria-hidden="true" />
        {e.aviso}
      </p>

      <section aria-label="Resumen" className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line shadow-card lg:grid-cols-3">
        <Cifra
          titulo="Último respaldo"
          valor={e.ultimo ? reloj.diaYHora(Date.parse(e.ultimo.hechoEn)) : "Ninguno"}
          detalle={e.ultimo ? `${hace(e.ultimo.hechoEn, ahora)} · ${tamano(e.ultimo.bytes)}` : "El servidor todavía no hace respaldos"}
        />
        <Cifra
          titulo="Fuera del servidor"
          valor={e.ultimoBajado ? reloj.diaYHora(Date.parse(e.ultimoBajado.hechoEn)) : "Ninguno"}
          detalle={e.ultimoBajado?.bajadoEn ? `Bajado por la PC del local ${hace(e.ultimoBajado.bajadoEn, ahora)}` : "La PC del local no ha bajado ninguno"}
        />
        <Cifra
          titulo="En el servidor"
          valor={`${enServidor} ${enServidor === 1 ? "respaldo" : "respaldos"}`}
          detalle="Las últimas noches; la PC guarda los de meses"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <PcDelLocal pc={e.pc} servidor={servidor} />

      <section aria-labelledby="copias" className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card">
        <h2 id="copias" className="mb-2 font-display text-base font-bold text-ink">
          Las últimas noches
        </h2>
        {e.copias.length === 0 ? (
          <p className="py-3 text-[13px] text-ink-2">Todavía no hay ninguno. Se instalan en el servidor una vez y desde entonces se hacen solos cada noche.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {e.copias.map((c) => (
              <Fila key={c.id} copia={c} />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-[12px] text-ink-3">
        Para abrir un respaldo hacen falta su clave privada y la clave de cifrado del sistema, guardadas fuera del servidor. Cada mes se ensaya una restauración completa.
      </p>
    </Container>
  );
}

function Cifra({ titulo, valor, detalle, className }: { titulo: string; valor: string; detalle: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 bg-surface px-4 py-3", className)}>
      <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">{titulo}</span>
      <span className="tnum truncate font-display text-[19px] leading-tight font-bold text-ink">{valor}</span>
      <span className="truncate text-[12px] text-ink-3">{detalle}</span>
    </div>
  );
}

function Fila({ copia: c }: { copia: CopiaDeRespaldoDto }) {
  const reloj = useReloj();
  const fallido = c.estado === "FALLIDO";
  return (
    <li className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="flex min-w-0 items-center gap-2">
        {fallido ? (
          <AlertTriangle size={14} className="shrink-0 text-state-crit" aria-hidden="true" />
        ) : c.bajadoEn ? (
          <Download size={14} className="shrink-0 text-state-ok" aria-hidden="true" />
        ) : (
          <HardDrive size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
        )}
        <span className="tnum text-[13.5px] font-semibold text-ink">{reloj.diaYHora(Date.parse(c.hechoEn))}</span>
        {!fallido && <span className="tnum text-[12.5px] text-ink-3">{tamano(c.bytes)}</span>}
      </span>
      <span className={cn("min-w-0 text-[12.5px] sm:ml-auto sm:text-right", fallido ? "font-semibold text-state-crit" : c.bajadoEn ? "text-state-ok" : "text-ink-2")}>
        {fallido ? (
          `Falló: ${c.detalle ?? "sin motivo"}`
        ) : c.bajadoEn ? (
          `En la PC del local desde ${reloj.diaYHora(Date.parse(c.bajadoEn))}`
        ) : c.retiradoEn ? (
          <span className="inline-flex items-center gap-1 text-ink-3">
            <CircleSlash size={12} aria-hidden="true" />
            Ya no está en el servidor y no se bajó
          </span>
        ) : (
          "Solo en el servidor, sin bajar"
        )}
      </span>
    </li>
  );
}
