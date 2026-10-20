"use client";

import { useRef, useState } from "react";
import { Check, Hourglass, ShieldCheck, X } from "lucide-react";
import type { AnulacionPedidaDto, Rechazo } from "@l2/contracts";
import { can } from "@l2/domain-identity";
import { Button, Dialog, Input, avisar } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { textoDinero, textoMotivo } from "../cash/anulacion.ts";
import { ordenDe } from "../cash/recibo.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import { useHora } from "../sucursal/SucursalProvider.tsx";
import { responderAnulacion } from "./anulaciones.acciones";
import { usePedidosDeAnulacion } from "./usePedidosDeAnulacion.ts";

/**
 * «Por aprobar» en Inicio — B3-30 (M-40).
 *
 * Lo que la caja pidió anular sin administración en el local: la venta, quién la cobró y quién la pide, el motivo y qué
 * se hará con la cuenta. Administración la aprueba con su PIN (es la autorización de anular, D-AUT) o la rechaza con su
 * motivo, también desde su teléfono, en vivo. Aprobada, la caja la hace sin PIN; aquí sigue a la vista hasta que la haga.
 * Solo lo ve quien puede anular.
 */
export function PorAprobar() {
  const actor = useActorEnSesion();
  const puede = actor !== null && can(actor, "cobro.anular") === "PERMITIDO";
  const { pedidas } = usePedidosDeAnulacion(puede);
  const hora = useHora();
  const [aprobando, setAprobando] = useState<AnulacionPedidaDto | null>(null);
  const [rechazando, setRechazando] = useState<AnulacionPedidaDto | null>(null);
  const abiertas = pedidas.filter((p) => p.estado === "PEDIDA" || p.estado === "APROBADA");
  if (!puede || abiertas.length === 0) return null;
  return (
    <section aria-labelledby="por-aprobar" className="mb-3 flex flex-col gap-2 rounded-[var(--radius-card)] border border-state-warn/40 bg-surface p-3 shadow-card xl:mb-4">
      <h2 id="por-aprobar" className="flex items-center gap-1.5 text-detalle font-bold text-ink">
        <Hourglass className="size-(--icono-texto) text-state-warn" aria-hidden="true" />
        Por aprobar · <span className="tnum">{abiertas.length}</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {abiertas.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="tnum text-cuerpo font-semibold text-ink">
                Anular la orden {ordenDe(p.orden)} · {p.cuenta} · {textoDinero(p.total)}
              </p>
              <p className="text-detalle text-ink-2">
                {textoMotivo(p.motivo)}
                {p.detalle ? ` «${p.detalle}»` : ""} · {p.camino === "ANULAR_VENTA" ? `anular la venta entera${p.inventario === "MERMA" ? " (a merma)" : ""}` : "cobrarla de nuevo"}
              </p>
              <p className="tnum text-nota text-ink-3">
                La cobró {p.cobradaPor} a las {hora(Date.parse(p.cobradaEl))} · la pide {p.pedidaPor} a las {hora(Date.parse(p.pedidaEl))}
              </p>
            </div>
            {p.estado === "APROBADA" ? (
              <p className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-state-ok/10 px-3 py-2 text-detalle font-semibold text-ink">
                <ShieldCheck className="size-(--icono-texto) text-state-ok" aria-hidden="true" />
                Aprobada: la caja la hace
              </p>
            ) : (
              <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                <Button surface="tablet" variant="neutral" onClick={() => setRechazando(p)}>
                  <X className="size-(--icono-texto)" aria-hidden="true" />
                  Rechazar
                </Button>
                <Button surface="tablet" variant="primary" onClick={() => setAprobando(p)}>
                  <Check className="size-(--icono-texto)" aria-hidden="true" />
                  Aprobar
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <AprobarDialog pedido={aprobando} onCerrar={() => setAprobando(null)} />
      <RechazarDialog pedido={rechazando} onCerrar={() => setRechazando(null)} />
    </section>
  );
}

/** Aprobar con el PIN propio: es la autorización de anular. */
function AprobarDialog({ pedido, onCerrar }: { pedido: AnulacionPedidaDto | null; onCerrar: () => void }) {
  const a = useAutorizacion("cobro.anular", pedido !== null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const clave = useRef<string | null>(null);
  async function aprobar() {
    if (!pedido || enviando) return;
    const falta = a.falta();
    if (falta) return setErrores(falta as Record<string, string>);
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await responderAnulacion({ idempotencyKey: clave.current, pedidoId: pedido.id, respuesta: "APROBAR" }, a.autorizacion(`Aprobada: ${textoMotivo(pedido.motivo)}`)).catch(
      () => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se aprobó." }) as Rechazo,
    );
    setEnviando(false);
    if (!r.ok) {
      const e = erroresDeRechazo(r.mensaje);
      if (e.pin) a.borrarPin();
      clave.current = null;
      return setErrores(e as Record<string, string>);
    }
    clave.current = null;
    setErrores({});
    onCerrar();
    avisar.ok(`Aprobada la anulación de la orden ${ordenDe(pedido.orden)}`, { detalle: "La caja la hace sin PIN y devuelve el dinero." });
  }
  return (
    <Dialog
      abierto={pedido !== null}
      onCerrar={onCerrar}
      titulo={pedido ? `Aprobar la anulación de la orden ${ordenDe(pedido.orden)}` : ""}
      descripcion={pedido ? `${pedido.cuenta} · ${textoDinero(pedido.total)} · ${textoMotivo(pedido.motivo)}. Tu PIN es la autorización: la caja la hace después.` : ""}
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="tablet" variant="neutral" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="primary" onClick={() => void aprobar()} disabled={enviando || a.permiso === "DENEGADO"}>
            {enviando ? "Aprobando…" : "Aprobar"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CampoAutorizacion a={a} denegado="Aprobar una anulación es de administración." errores={errores} deshabilitado={enviando} onConfirmar={() => void aprobar()} />
        {errores.general && (
          <p role="alert" className="text-detalle text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Rechazar con su motivo: la caja lo lee en la venta. */
function RechazarDialog({ pedido, onCerrar }: { pedido: AnulacionPedidaDto | null; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eraDe, setEraDe] = useState<string | null>(null);
  if ((pedido?.id ?? null) !== eraDe) {
    setEraDe(pedido?.id ?? null);
    setMotivo("");
    setError(null);
  }
  async function rechazar() {
    if (!pedido || enviando) return;
    if (motivo.trim().length < 3) return setError("Di por qué no, en unas palabras");
    setEnviando(true);
    const r = await responderAnulacion({ idempotencyKey: globalThis.crypto.randomUUID(), pedidoId: pedido.id, respuesta: "RECHAZAR", motivo: motivo.trim() }).catch(() => null);
    setEnviando(false);
    if (!r) return setError("Sin conexión con el servidor: no se rechazó.");
    if (!r.ok) return setError(r.mensaje);
    onCerrar();
    avisar.info(`Rechazada la anulación de la orden ${ordenDe(pedido.orden)}`, { detalle: "La caja lo lee en la venta, con tu motivo." });
  }
  return (
    <Dialog
      abierto={pedido !== null}
      onCerrar={onCerrar}
      titulo={pedido ? `Rechazar la anulación de la orden ${ordenDe(pedido.orden)}` : ""}
      descripcion="La venta queda como está; la caja lee tu motivo y puede pedirla otra vez."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="tablet" variant="neutral" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="tablet" variant="danger" onClick={() => void rechazar()} disabled={enviando}>
            {enviando ? "Rechazando…" : "Rechazar"}
          </Button>
        </div>
      }
    >
      <Input label="Por qué no" surface="tablet" value={motivo} maxLength={280} onChange={(e) => setMotivo(e.target.value)} error={error ?? undefined} autoFocus />
    </Dialog>
  );
}
