"use client";

import { useEffect, useState } from "react";
import { DatosImpresoraSchema, type ImpresoraCommand, type ImpresoraDto } from "@l2/contracts";
import { Button, Input, Sheet, cn } from "@l2/ui";

/**
 * Alta y edición de una impresora, en una hoja lateral (abajo en el teléfono): la lista queda detrás y
 * no se pierde de vista dónde se estaba. Lo que se valida aquí lo vuelve a validar el servidor.
 */

const ETIQUETA = "text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase";

type Form = { nombre: string; ip: string; puerto: string; ancho: 58 | 80; recibos: boolean; comandas: boolean; enVlanDeHardware: boolean; ipFija: boolean };
const VACIO: Form = { nombre: "", ip: "", puerto: "9100", ancho: 80, recibos: true, comandas: true, enVlanDeHardware: false, ipFija: false };
const deImpresora = (i: ImpresoraDto): Form => ({
  nombre: i.nombre,
  ip: i.ip,
  puerto: String(i.puerto),
  ancho: i.ancho,
  recibos: i.recibos,
  comandas: i.comandas,
  enVlanDeHardware: i.enVlanDeHardware,
  ipFija: i.ipFija,
});

export type Mandar = (cmd: ImpresoraCommand, ok: string) => Promise<{ hecho: boolean; problemas?: Record<string, string> | undefined }>;

export function ImpresoraForm({
  abierta,
  impresora,
  onCerrar,
  mandar,
  enviando,
}: {
  abierta: boolean;
  /** La que se edita; `null` para una nueva. */
  impresora: ImpresoraDto | null;
  onCerrar: () => void;
  mandar: Mandar;
  enviando: boolean;
}) {
  const [form, setForm] = useState<Form>(VACIO);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // Cada vez que se abre, empieza de lo que hay (o de cero). Por su id: si la lista se vuelve a leer
  // mientras se edita (otro equipo cambió algo), no se pierde lo que se lleva escrito.
  const id = impresora?.id ?? null;
  useEffect(() => {
    if (!abierta) return;
    setForm(impresora ? deImpresora(impresora) : VACIO);
    setErrores({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, id]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const v = DatosImpresoraSchema.safeParse({ ...form, puerto: Number(form.puerto) });
    if (!v.success) {
      setErrores(Object.fromEntries(v.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    const r = await mandar(
      impresora ? { kind: "EDITAR", impresoraId: impresora.id, datos: v.data } : { kind: "CREAR", datos: v.data },
      impresora ? `Impresora guardada: ${v.data.nombre}` : `Impresora añadida: ${v.data.nombre}. Pruébala y enciéndela.`,
    );
    if (r.hecho) onCerrar();
    else if (r.problemas) setErrores(r.problemas);
  }

  const campo = (k: keyof Form) => ({
    value: String(form[k]),
    error: errores[k] || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setErrores((x) => ({ ...x, [k]: "" }));
    },
  });
  const marca = (k: "recibos" | "comandas" | "enVlanDeHardware" | "ipFija", texto: string, pista?: string) => (
    <label className="flex min-h-9 cursor-pointer items-start gap-2 text-[13px] text-ink">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-brand)]"
        checked={form[k]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [k]: e.target.checked }));
          setErrores((x) => ({ ...x, recibos: "" }));
        }}
      />
      <span>
        {texto}
        {pista && <span className="block text-[11.5px] text-ink-3">{pista}</span>}
      </span>
    </label>
  );

  return (
    <Sheet
      abierto={abierta}
      onCerrar={onCerrar}
      titulo={impresora ? `Editar «${impresora.nombre}»` : "Nueva impresora"}
      descripcion={impresora ? "Los cambios valen para lo que se imprima desde ahora." : "Nace apagada: se prueba y se enciende desde la lista."}
      pie={
        <div className="flex gap-2">
          <Button type="button" variant="ghost" surface="admin" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" form="impresora-form" variant="primary" surface="admin" className="flex-1" disabled={enviando}>
            {enviando ? "Guardando…" : impresora ? "Guardar" : "Añadir impresora"}
          </Button>
        </div>
      }
    >
      <form id="impresora-form" onSubmit={guardar} className="flex flex-col gap-3">
        <Input surface="admin" label="Nombre" placeholder="Caja" autoComplete="off" maxLength={40} {...campo("nombre")} />
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
          <Input surface="admin" label="IP en la red del local" placeholder="192.168.1.50" inputMode="decimal" autoComplete="off" {...campo("ip")} />
          <Input surface="admin" label="Puerto" inputMode="numeric" {...campo("puerto")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className={ETIQUETA}>Papel</span>
          <div role="radiogroup" aria-label="Ancho del papel" className="grid grid-cols-2 gap-1.5">
            {([80, 58] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={form.ancho === a}
                onClick={() => setForm((f) => ({ ...f, ancho: a }))}
                className={cn(
                  "min-h-9 cursor-pointer rounded-[var(--radius-control)] border text-[13px]",
                  form.ancho === a ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                )}
              >
                {a} mm
              </button>
            ))}
          </div>
        </div>
        <fieldset className="flex flex-col gap-0.5">
          <legend className={cn(ETIQUETA, "mb-1")}>Imprime</legend>
          {marca("recibos", "Recibos y ticket del corte")}
          {marca("comandas", "Comandas del restaurante", "Hoy la de caja; mañana, la de la cocina")}
          {errores.recibos && <p className="text-[12px] font-medium text-state-crit">{errores.recibos}</p>}
        </fieldset>
        <fieldset className="flex flex-col gap-0.5">
          <legend className={cn(ETIQUETA, "mb-1")}>Para encenderla</legend>
          {marca("enVlanDeHardware", "Está en la red de los equipos (VLAN de hardware)", "Fuera del wifi de los clientes")}
          {marca("ipFija", "Tiene IP fija", "Reservada en el router: no cambia al reiniciarlo")}
        </fieldset>
      </form>
    </Sheet>
  );
}
