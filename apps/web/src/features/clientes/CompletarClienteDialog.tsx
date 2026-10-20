"use client";

import { useRef, useState } from "react";
import { IdCard } from "lucide-react";
import type { DatosDelClienteDto, FamilyAccountDto } from "@l2/contracts";
import { exigidoAlCompletar } from "@l2/domain-orders";
import { Button, Dialog, type Surface } from "@l2/ui";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { DatosDelCliente, problemasDelCliente } from "./DatosDelCliente.tsx";
import type { ParaQue } from "./CampoDelCliente.tsx";
import { asignarCliente } from "./clientes.acciones";

/**
 * «Falta la cédula» — B6-22 (M-40).
 *
 * Una cuenta sentada «Más rápido» lleva el nombre de su cliente y nada más: su cédula se pide antes del segundo pedido
 * (en la tablet, al tocar «Tomar pedido») y antes de cobrar (en la caja, en «Factura a»). Es el mismo campo «Cédula o
 * RIF» de sentar (T-24), con el directorio cruzado; el teléfono, según la sucursal. Completarla es de quien atiende, sin
 * autorización: hasta ahora la cuenta no tenía a quién cobrarle.
 */
export function CompletarClienteDialog({
  cuenta,
  motivo,
  surface = "tablet",
  para = "MESA",
  accion = "Anotar la cédula",
  onCerrar,
  onHecho,
}: {
  /** La cuenta a la que le falta la cédula, o `null` (cerrado). */
  cuenta: FamilyAccountDto | null;
  /** Por qué se pide ahora: «Antes del segundo pedido», «Antes de cobrar». */
  motivo: string;
  surface?: Surface;
  para?: ParaQue;
  /** El botón que la anota: «Anotar y tomar el pedido» en la tablet. */
  accion?: string;
  onCerrar: () => void;
  /** La cuenta con su cliente completo, ya en el servidor. */
  onHecho: (cuenta: FamilyAccountDto) => void;
}) {
  const { telefonoDelCliente } = useSucursal().ajustes;
  const exige = exigidoAlCompletar(telefonoDelCliente, false);
  const [datos, setDatos] = useState<DatosDelClienteDto>({ nombre: "", cedula: "", telefono: "" });
  const [errores, setErrores] = useState<ReturnType<typeof problemasDelCliente>>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eraDe, setEraDe] = useState<string | null>(null);
  /** Reintentarlo (se cortó la red) no anota dos veces. */
  const clave = useRef<string | null>(null);

  // Cada cuenta empieza con lo que ya tiene: su nombre y, si lo dio, su teléfono.
  if ((cuenta?.id ?? null) !== eraDe) {
    setEraDe(cuenta?.id ?? null);
    setDatos({ nombre: cuenta?.cliente?.nombre ?? cuenta?.family ?? "", cedula: "", telefono: cuenta?.cliente?.telefono ?? "" });
    setErrores(null);
    setError(null);
    clave.current = null;
  }

  async function anotar() {
    if (!cuenta) return;
    const problemas = problemasDelCliente(datos, exige);
    setErrores(problemas);
    if (problemas) return;
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    setError(null);
    const r = await asignarCliente({ idempotencyKey: clave.current, accountId: cuenta.id, cliente: datos }).catch(() => null);
    setEnviando(false);
    if (!r) {
      setError("Sin conexión con el servidor: la cédula no se anotó. Vuelve a intentarlo.");
      return;
    }
    if (!r.ok) {
      setError(r.mensaje);
      clave.current = null;
      return;
    }
    onHecho(r.valor);
  }

  const nombre = cuenta?.cliente?.nombre ?? cuenta?.family ?? "";
  return (
    <Dialog
      abierto={cuenta !== null}
      onCerrar={onCerrar}
      titulo={`Falta la cédula de ${nombre}`}
      descripcion={`${motivo}: si se va sin pagar, la deuda tiene a quién cobrarle. Si ya vino, aparece sola.`}
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          <Button surface={surface} variant="neutral" onClick={onCerrar} disabled={enviando}>
            Ahora no
          </Button>
          <Button surface={surface} variant="primary" onClick={() => void anotar()} disabled={enviando}>
            <IdCard className="size-(--icono-texto)" aria-hidden="true" />
            {enviando ? "Anotando…" : accion}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <DatosDelCliente
          para={para}
          valor={datos}
          exige={exige}
          // Después del primer intento, lo que falta se recalcula al escribir: un error corregido se va solo.
          onCambio={(d) => {
            setDatos(d);
            if (errores) setErrores(problemasDelCliente(d, exige));
          }}
          errores={errores}
          surface={surface}
          autoFocus
        />
        {error && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
