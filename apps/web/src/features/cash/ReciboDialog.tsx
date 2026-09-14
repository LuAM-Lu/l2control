"use client";

import { useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { Button, Dialog, Input } from "@l2/ui";
import { enlaceWhatsApp, textoRecibo, type Recibo } from "./recibo.ts";

/**
 * El recibo no fiscal del último cobro: en pantalla, para imprimir y para
 * mandar por WhatsApp.
 *
 * Imprimir usa la impresora del equipo y una hoja de estilo de impresión que
 * deja solo el recibo, al ancho de un ticket de 80 mm.
 * TODO(F1-12): la impresora térmica en red y sus plantillas de 58 y 80 mm.
 *
 * WhatsApp: solo si el cliente lo pide. Se propone el teléfono de la familia
 * si se conoce; si no, se teclea.
 */
export function ReciboDialog({ recibo, onCerrar }: { recibo: Recibo | null; onCerrar: () => void }) {
  const [telefono, setTelefono] = useState("");
  const [paraOrden, setParaOrden] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  if (recibo && recibo.orden !== paraOrden) {
    setParaOrden(recibo.orden);
    setTelefono(recibo.telefono ?? "");
    setError(undefined);
  }

  function enviar() {
    if (!recibo) return;
    const url = enlaceWhatsApp(telefono, textoRecibo(recibo));
    if (!url) {
      setError("Teléfono no válido: 0414-1234567");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog
      abierto={recibo !== null}
      onCerrar={onCerrar}
      titulo={recibo ? `Recibo · Orden ${recibo.orden}` : "Recibo"}
      descripcion="Comprobante no fiscal. La factura la emite la máquina fiscal."
      pie={
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <Input
              label="WhatsApp del cliente"
              surface="tablet"
              inputMode="tel"
              autoComplete="off"
              placeholder="0414-1234567"
              value={telefono}
              onChange={(e) => {
                setTelefono(e.target.value);
                setError(undefined);
              }}
              error={error}
              className="min-w-0"
            />
            <Button surface="pos" variant="neutral" onClick={enviar} className="shrink-0">
              <MessageCircle size={17} aria-hidden="true" />
              Enviar
            </Button>
          </div>
          <Button surface="pos" variant="primary" onClick={() => window.print()}>
            <Printer size={17} aria-hidden="true" />
            Imprimir recibo
          </Button>
        </div>
      }
    >
      {recibo && (
        <article className="l2-recibo mx-auto flex max-w-[20rem] flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base px-4 py-3 text-[12.5px] text-ink">
          <header className="text-center">
            {/* `text-[16px]` y no `text-base`: con el token `--color-base`, Tailwind
                también lo lee como color y el nombre salía del color del fondo. */}
            <p className="font-display text-[16px] font-bold text-ink">Abby Kingdom</p>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">Recibo no fiscal</p>
            <p className="tnum mt-1 text-ink-2">
              Orden {recibo.orden} · {recibo.cuando}
            </p>
            <p className="text-ink-2">Factura a: {recibo.facturaA}</p>
          </header>

          <ul className="flex flex-col gap-0.5 border-y border-dashed border-line py-2">
            {recibo.lineas.map((l, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="tnum w-5 shrink-0 text-right text-ink-2">{l.cantidad}</span>
                <span className="min-w-0 flex-1">{l.concepto}</span>
                <span className="tnum shrink-0">{l.importe}</span>
              </li>
            ))}
          </ul>

          <dl className="flex flex-col gap-0.5">
            <Renglon etiqueta="Subtotal" valor={recibo.subtotal} />
            {recibo.impuestos.map((t) => (
              <Renglon key={t.etiqueta} etiqueta={t.etiqueta} valor={t.monto} />
            ))}
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-1 text-[14px] font-bold">
              <dt>Total</dt>
              <dd className="tnum">{recibo.total}</dd>
            </div>
            {recibo.totalBs && <Renglon etiqueta={`En bolívares${recibo.tasa ? ` · ${recibo.tasa}` : ""}`} valor={recibo.totalBs} />}
          </dl>

          <ul className="flex flex-col gap-0.5 border-t border-dashed border-line pt-2">
            {recibo.pagos.map((p, i) => (
              <li key={i}>
                <span className="flex items-baseline justify-between gap-2">
                  <span>{p.medio}</span>
                  <span className="tnum">{p.monto}</span>
                </span>
                {p.detalle && <span className="tnum block text-[11px] text-ink-3">{p.detalle}</span>}
              </li>
            ))}
            {recibo.vuelto && <Renglon etiqueta={recibo.destinoVuelto ?? "Vuelto"} valor={recibo.vuelto} />}
          </ul>

          <footer className="text-center text-[11px] text-ink-3">
            {recibo.cajera ? `Atendió ${recibo.cajera} · ` : ""}¡Gracias por visitarnos!
          </footer>
        </article>
      )}
    </Dialog>
  );
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-2">{etiqueta}</dt>
      <dd className="tnum">{valor}</dd>
    </div>
  );
}
