"use client";

import { useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { Button, Dialog, Input } from "@l2/ui";
import { enlaceWhatsApp, textoRecibo, type Recibo } from "./recibo.ts";

/**
 * El recibo no fiscal de una venta: en pantalla, para imprimir y para mandar
 * por WhatsApp. Lo abren la caja (el último cobro) y «Ventas» (cualquiera del
 * turno).
 *
 * ORIGINAL Y COPIA (§5.4): la primera impresión es el original; cualquier otra
 * sale marcada «COPIA» en grande. Quien llama anota cada impresión con
 * `onImprimir`, y lo hace DESPUÉS de imprimir, para que el papel refleje si ya
 * se había impreso antes y no la impresión que se está haciendo.
 * TODO(F1-12): la impresora térmica en red y sus plantillas de 58 y 80 mm.
 *
 * WhatsApp: solo si el cliente lo pide. Se propone el teléfono de la familia
 * si se conoce; si no, se teclea.
 */
export function ReciboDialog({
  recibo,
  copia,
  onImprimir,
  onCerrar,
}: {
  recibo: Recibo | null;
  /** Si ya se imprimió: lo que salga ahora es una copia. */
  copia: boolean;
  onImprimir: () => void;
  onCerrar: () => void;
}) {
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
          <Button
            surface="pos"
            variant="primary"
            onClick={() => {
              window.print();
              onImprimir();
            }}
          >
            <Printer size={17} aria-hidden="true" />
            {copia ? "Reimprimir (copia)" : "Imprimir recibo"}
          </Button>
        </div>
      }
    >
      {recibo && <ReciboImpreso recibo={recibo} copia={copia} />}
    </Dialog>
  );
}

/** El recibo tal como sale en papel. También lo usa «Ventas» en su detalle. */
export function ReciboImpreso({
  recibo,
  copia,
  anulada = false,
  className,
}: {
  recibo: Recibo;
  copia: boolean;
  /** Un cobro anulado lo dice en el recibo, más fuerte que la copia. */
  anulada?: boolean;
  className?: string;
}) {
  return (
    <article
      className={
        "l2-recibo mx-auto flex w-full max-w-[20rem] flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-base px-4 py-3 text-[12.5px] text-ink " +
        (className ?? "")
      }
    >
      <header className="text-center">
        {/* `text-[16px]` y no `text-base`: con el token `--color-base`, Tailwind
            también lo lee como color y el nombre salía del color del fondo. */}
        <p className="font-display text-[16px] font-bold text-ink">Abby Kingdom</p>
        <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-2 uppercase">Recibo no fiscal</p>
        {anulada ? (
          <p className="mx-auto mt-1 w-fit rounded border-2 border-state-crit px-2 text-[13px] font-bold tracking-[0.2em] text-state-crit">
            ANULADA
          </p>
        ) : (
          copia && (
            <p className="mx-auto mt-1 w-fit rounded border-2 border-ink px-2 text-[13px] font-bold tracking-[0.2em] text-ink">
              COPIA
            </p>
          )
        )}
        <p className="tnum mt-1 text-ink-2">
          Orden {recibo.orden} · {recibo.cuando}
        </p>
        {recibo.parte && <p className="tnum font-semibold text-ink">{recibo.parte}</p>}
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
