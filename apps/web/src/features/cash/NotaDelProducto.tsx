"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Input } from "@l2/ui";
import { conNotaRapida } from "@l2/domain-orders";
import { notasRapidas } from "../mesas/pedidos.acciones";

/**
 * La nota para la cocina de un producto que vende la caja — B6-16 (M-37).
 *
 * Como la del mesero (B6-12): las más pedidas para ese producto, un toque las añade y lo escrito se queda. Sale en la
 * comanda de la venta, al cobrarla o al dejarla pendiente.
 */
export function NotaDelProducto({
  producto,
  nota,
  onGuardar,
  onCerrar,
}: {
  /** El producto (su id y su nombre); `null`, el diálogo está cerrado. */
  producto: Readonly<{ id: string; nombre: string }> | null;
  nota: string;
  onGuardar: (nota: string) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(nota);
  const [frecuentes, setFrecuentes] = useState<{ notas: readonly string[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!producto) return;
    setTexto(nota);
    let vivo = true;
    setFrecuentes(null);
    notasRapidas(producto.id)
      .then((r) => vivo && setFrecuentes(r.ok ? { notas: r.valor.notas, error: false } : { notas: [], error: true }))
      .catch(() => vivo && setFrecuentes({ notas: [], error: true }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id]);

  return (
    <Dialog
      abierto={producto !== null}
      onCerrar={onCerrar}
      titulo={`Nota · ${producto?.nombre ?? ""}`}
      descripcion="La cocina (o la barra) la lee en la comanda. Corta y concreta."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            surface="pos"
            variant="primary"
            onClick={() => {
              onGuardar(texto.trim().slice(0, 80));
              onCerrar();
            }}
          >
            Guardar nota
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <section aria-label="Notas frecuentes" className="flex flex-col gap-1.5">
          <span className="text-etiqueta font-semibold tracking-[0.07em] text-ink-3 uppercase">Las más pedidas</span>
          {frecuentes === null ? (
            <p className="text-detalle text-ink-3">Buscando las notas de este producto…</p>
          ) : frecuentes.error ? (
            <p role="alert" className="text-detalle text-state-warn">No se pudieron traer las notas frecuentes: escríbela.</p>
          ) : frecuentes.notas.length === 0 ? (
            <p className="text-detalle text-ink-3">Todavía no hay notas para este producto: las que escribas aparecerán aquí.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {frecuentes.notas.map((n) => (
                <Button key={n} variant="neutral" surface="pos" onClick={() => setTexto((t) => conNotaRapida(t, n))}>
                  {n}
                </Button>
              ))}
            </div>
          )}
        </section>
        <Input label="Nota para la comanda" surface="pos" maxLength={80} value={texto} onChange={(e) => setTexto(e.target.value)} hint={`${texto.length} de 80 caracteres`} />
      </div>
    </Dialog>
  );
}
