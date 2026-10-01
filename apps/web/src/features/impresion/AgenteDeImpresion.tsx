"use client";

import { useEffect, useState } from "react";
import { Copy, Download, Laptop, Wifi, WifiOff } from "lucide-react";
import type { AgenteDto } from "@l2/contracts";
import { Button, Dialog, Input, avisar, cn } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import type { Mandar } from "./ImpresoraForm.tsx";

/**
 * El agente de impresión (ADR-026): el programa de la laptop de caja que recibe los trabajos del
 * servidor y los manda a la impresora por la red del local. Aquí se descarga, se vincula con un código
 * de un solo uso y se retira.
 */

const TARJETA = "flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-card";

export function AgenteDeImpresion({
  agentes,
  puede,
  mandar,
  enviando,
  codigo,
  onCodigoListo,
  worker,
  descargable,
}: {
  agentes: readonly AgenteDto[];
  puede: boolean;
  mandar: Mandar;
  enviando: boolean;
  /** El código recién generado (se enseña una sola vez). */
  codigo: string | null;
  onCodigoListo: () => void;
  worker: { url: string; puerto: number };
  descargable: { version: string; sha256: string; mb: number } | null;
}) {
  const reloj = useReloj();
  const [equipo, setEquipo] = useState("Laptop de caja");
  const [retirar, setRetirar] = useState<AgenteDto | null>(null);
  const [servidor, setServidor] = useState(worker.url);
  // Sin dirección pública configurada, el worker está en esta misma máquina, en su puerto.
  useEffect(() => {
    if (!worker.url) setServidor(`${window.location.protocol}//${window.location.hostname}:${worker.puerto}`);
  }, [worker.url, worker.puerto]);

  const estado = (a: AgenteDto) =>
    a.vinculadoEn === null
      ? `Esperando su código, hasta las ${reloj.hora(Date.parse(a.codigoHasta!))}`
      : a.conectado
        ? "Conectado"
        : a.ultimaVez
          ? `Sin conexión desde ${reloj.diaYHora(Date.parse(a.ultimaVez))}`
          : "Sin conexión";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="Equipos con el agente" className={TARJETA}>
        <h2 className="font-display flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <Laptop size={15} aria-hidden="true" /> Equipos con el agente
        </h2>
        {agentes.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-state-warn/35 bg-state-warn-bg px-3 py-2 text-[13px] text-state-warn">
            Sin agente vinculado: nada sale en papel.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {agentes.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-ink">{a.nombre}</span>
                  <span className={cn("flex items-center gap-1 text-[12px]", a.conectado ? "text-state-ok" : "text-ink-3")}>
                    {a.conectado ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
                    {estado(a)}
                  </span>
                  {a.vinculadoEn && <span className="block text-[11.5px] text-ink-3">Vinculado el {reloj.diaConAnio(Date.parse(a.vinculadoEn))}</span>}
                </span>
                {puede && (
                  <Button type="button" variant="ghost" surface="admin" disabled={enviando} aria-label={`Retirar ${a.nombre}`} onClick={() => setRetirar(a)}>
                    Retirar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {codigo ? (
          <div role="status" className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-brand/40 bg-brand/8 p-3">
            <span className="text-[12px] text-ink-2">Código de un solo uso (vale 10 minutos):</span>
            <span className="tnum font-display text-2xl font-bold tracking-[0.12em] text-ink">{codigo}</span>
            <span className="text-[12px] text-ink-2">
              En la laptop de caja, abre <b>l2-impresion.exe</b> y pega esto cuando lo pida:
            </span>
            <div className="flex items-center gap-1.5">
              <code className="block min-w-0 flex-1 rounded bg-base px-2 py-1.5 text-[12px] break-all text-ink">
                {servidor} {codigo}
              </code>
              <Button
                type="button"
                variant="neutral"
                surface="admin"
                aria-label="Copiar la dirección y el código"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${servidor} ${codigo}`).then(() => avisar.ok("Copiado"));
                }}
              >
                <Copy size={14} aria-hidden="true" />
              </Button>
            </div>
            <Button type="button" variant="ghost" surface="admin" onClick={onCodigoListo}>
              Listo
            </Button>
          </div>
        ) : (
          puede && (
            <div className="mt-auto flex flex-col gap-1.5 border-t border-line pt-3">
              <span className="text-[12.5px] text-ink-2">Vincular otro equipo: genera un código y pégalo en el agente.</span>
              <div className="flex items-end gap-2">
                <Input surface="admin" label="Nombre del equipo" value={equipo} onChange={(e) => setEquipo(e.target.value)} maxLength={40} />
                <Button
                  type="button"
                  variant="neutral"
                  surface="admin"
                  disabled={enviando || equipo.trim().length < 2}
                  onClick={() => void mandar({ kind: "VINCULAR_AGENTE", nombre: equipo.trim() }, "Código generado")}
                >
                  Vincular
                </Button>
              </div>
            </div>
          )
        )}
      </section>

      <section aria-label="Instalar el agente" className={TARJETA}>
        <h2 className="font-display flex items-center gap-1.5 text-[14px] font-bold text-ink">
          <Download size={15} aria-hidden="true" /> Instalar en la laptop de caja
        </h2>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-ink-2 marker:text-ink-3">
          <li>Descarga el agente en la laptop de caja (Windows).</li>
          <li>Ábrelo: pide permiso de administrador una vez.</li>
          <li>Pega la dirección y el código que da «Vincular». Queda instalado: arranca solo con la laptop.</li>
        </ol>
        {descargable ? (
          <a
            href="/descargas/agente"
            download="l2-impresion.exe"
            className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line px-3 text-[13px] font-semibold text-ink no-underline hover:border-line-strong hover:bg-surface-2"
          >
            <Download size={15} aria-hidden="true" />
            Descargar el agente
            <span className="ml-auto text-[11.5px] font-normal text-ink-3">
              v{descargable.version} · {descargable.mb} MB
            </span>
          </a>
        ) : (
          <p className="text-[12.5px] text-ink-3">El agente todavía no está empaquetado en este servidor.</p>
        )}
        {descargable?.sha256 && (
          <p className="text-[11px] break-all text-ink-3" title="Huella SHA-256 del instalador">
            SHA-256 {descargable.sha256}
          </p>
        )}
        <p className="text-[12px] text-ink-3">
          Si la laptop se apaga o pierde internet, lo que se mande a imprimir espera y sale solo cuando vuelve. Un solo agente basta para todas las impresoras
          del local.
        </p>
      </section>

      <Dialog
        abierto={retirar !== null}
        onCerrar={() => setRetirar(null)}
        titulo={`¿Retirar «${retirar?.nombre ?? ""}»?`}
        pie={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" surface="admin" onClick={() => setRetirar(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              surface="admin"
              disabled={enviando}
              onClick={() => {
                const a = retirar;
                if (a) void mandar({ kind: "RETIRAR_AGENTE", agenteId: a.id }, `Agente retirado: ${a.nombre}`).then(() => setRetirar(null));
              }}
            >
              Sí, retirar
            </Button>
          </div>
        }
      >
        <p className="text-[13px] text-ink-2">Ese equipo deja de imprimir en el acto: su credencial ya no vale. Para volver a usarlo hay que vincularlo de nuevo.</p>
      </Dialog>
    </div>
  );
}
