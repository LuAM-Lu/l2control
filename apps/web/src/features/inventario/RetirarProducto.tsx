"use client";

import { useState } from "react";
import { ArchiveRestore, ArchiveX, TriangleAlert } from "lucide-react";
import type { MotivoSalida, ProductoDto, Rechazo } from "@l2/contracts";
import { Button, Input, Sheet, avisar, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { autorizadoresDeInventario } from "./salidas.acciones";
import { devolverProducto, retirarProducto } from "./retiro.acciones";
import { MOTIVOS } from "./SalidasScreen.tsx";

/**
 * Retirar un producto del catálogo, o devolverlo — B9-11 (M-34, S-2).
 *
 * Retirar lo saca de Productos, la caja, la carta, la tablet y las listas de carga; su historia queda en Reportes y el
 * kárdex. Si le queda existencia, se elige cómo sale (como una salida, B9-4). Lo autoriza administración con su PIN.
 * Devolverlo lo trae apartado: se pone a la venta con «Volver a la venta».
 */
export function RetirarProducto({
  producto,
  modo,
  onCerrar,
  onHecho,
}: {
  producto: ProductoDto;
  modo: "RETIRAR" | "DEVOLVER";
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const a = useAutorizacion("inventario.ajustar", true, { cargar: autorizadoresDeInventario });
  const [motivo, setMotivo] = useState("");
  const [salida, setSalida] = useState<MotivoSalida | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [clave] = useState(() => globalThis.crypto.randomUUID());
  const retirar = modo === "RETIRAR";
  const quedan = retirar && producto.existencia !== null ? producto.existencia : 0;

  async function confirmar() {
    const e: Record<string, string> = {};
    if (motivo.trim().length < 3) e.motivo = retirar ? "Di por qué se retira" : "Di por qué vuelve";
    if (quedan > 0 && !salida) e.salida = "Elige cómo salen las que quedan";
    const falta = a.falta();
    if (Object.keys(e).length > 0 || falta) {
      setErrores({ ...e, ...((falta ?? {}) as Record<string, string>) });
      return;
    }
    setEnviando(true);
    const razon = `${retirar ? "Retirar" : "Devolver al catálogo"} «${producto.nombre}»: ${motivo.trim()}`;
    const r = await (retirar
      ? retirarProducto({ idempotencyKey: clave, productId: producto.id, motivo: motivo.trim(), ...(quedan > 0 && salida ? { salida } : {}) }, a.autorizacion(razon))
      : devolverProducto({ productId: producto.id, motivo: motivo.trim() }, a.autorizacion(razon))
    ).catch(() => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se cambió nada." }) as Rechazo);
    setEnviando(false);
    if (r.ok) {
      avisar.ok(retirar ? `${producto.nombre}: retirado del catálogo` : `${producto.nombre}: de vuelta en el catálogo`, {
        detalle: retirar
          ? r.valor.unidadesSacadas > 0
            ? `Salieron ${r.valor.unidadesSacadas} ${r.valor.unidadesSacadas === 1 ? "unidad" : "unidades"}. Su historia queda en Reportes y el kárdex.`
            : "Su historia queda en Reportes y el kárdex."
          : "Vuelve apartado: ponlo a la venta con «Volver a la venta».",
      });
      onHecho();
      return;
    }
    const ep = erroresDeRechazo(r.mensaje);
    if (ep.pin) a.borrarPin();
    setErrores({ general: r.mensaje, ...(ep as Record<string, string>) });
  }

  return (
    <Sheet
      abierto
      onCerrar={onCerrar}
      titulo={retirar ? `Retirar «${producto.nombre}»` : `Devolver «${producto.nombre}» al catálogo`}
      descripcion={
        retirar
          ? "Sale de Productos, la caja, la carta, la tablet y las listas de carga. No se borra: su historia queda en Reportes y el kárdex, y se puede devolver."
          : "Vuelve a Productos apartado de la venta; se pone a la venta aparte."
      }
      pie={
        <div className="flex w-full flex-col gap-2">
          {errores.general && (
            <p role="alert" className="flex items-start gap-1.5 text-[12.5px] font-medium text-state-crit">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errores.general}
            </p>
          )}
          <Button surface="admin" variant={retirar ? "danger" : "primary"} className="w-full gap-1.5" disabled={enviando} onClick={() => void confirmar()}>
            {retirar ? <ArchiveX size={15} aria-hidden="true" /> : <ArchiveRestore size={15} aria-hidden="true" />}
            {enviando ? "Guardando…" : retirar ? "Retirar del catálogo" : "Devolver al catálogo"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label={retirar ? "1 · Por qué se retira" : "1 · Por qué vuelve"}
          surface="admin"
          value={motivo}
          maxLength={200}
          placeholder={retirar ? "Duplicado de la carga inicial, ya no se vende…" : "Vuelve en temporada…"}
          error={errores.motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setErrores(({ motivo: _, ...r }) => r);
          }}
          autoFocus
        />

        {quedan > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-etiqueta font-semibold text-ink-2 uppercase">2 · Quedan {quedan}: cómo salen</legend>
            <div role="radiogroup" className="grid grid-cols-2 gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={salida === m.id}
                  onClick={() => {
                    setSalida(m.id);
                    setErrores(({ salida: _, ...r }) => r);
                  }}
                  className={cn(
                    "flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 py-1.5 text-left",
                    salida === m.id ? "border-brand bg-brand/15 text-ink" : "border-line bg-base/40 text-ink-2 hover:border-line-strong",
                  )}
                >
                  <span className="text-[13px] font-semibold">{m.texto}</span>
                  <span className="text-[11px] text-ink-3">{m.detalle}</span>
                </button>
              ))}
            </div>
            {errores.salida && <p className="text-nota text-state-crit">{errores.salida}</p>}
          </fieldset>
        )}

        <CampoAutorizacion
          a={a}
          numero={quedan > 0 ? 3 : 2}
          denegado="Tu puesto no puede retirar productos del catálogo: lo hace administración."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
      </div>
    </Sheet>
  );
}
