"use client";

import { useState } from "react";
import type { DatosDelClienteDto, DeudaDto, FamilyAccountDto, Rechazo } from "@l2/contracts";
import { toMajor } from "@l2/domain-money";
import { Button, Dialog, Input, MoneyDisplay, avisar } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "../cash/Autorizacion.tsx";
import { DatosDelCliente, SIN_DATOS, problemasDelCliente } from "../clientes/DatosDelCliente.tsx";
import { nombreDeCuenta, numeroDeOrden, pendiente } from "../cuentas/cuentas.ts";
import { marcarDeuda } from "./deudas.acciones";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";

/**
 * «Se fue sin pagar» — B3-11 (M-33). La cuenta sale de la cola y del cierre, la mesa queda libre y lo que debe queda a
 * nombre de su cliente, para cobrárselo cuando vuelva. Con la autorización de supervisión (quien supervisa confirma con
 * su PIN). Una cuenta sin cliente (de antes de B6-9, o una venta sin datos) los pide aquí.
 */
export function MarcarDeudaDialog({
  cuenta,
  onCerrar,
  onHecha,
}: {
  cuenta: FamilyAccountDto | null;
  onCerrar: () => void;
  onHecha: (r: { cuenta: FamilyAccountDto; deuda: DeudaDto }) => void;
}) {
  const a = useAutorizacion("cuenta.deuda", cuenta !== null);
  // Con los precios sin IVA, lo que se ve es el consumo: la deuda queda con su IVA, como se cobraría.
  const { preciosConIva } = useSucursal().ajustes;
  const [detalle, setDetalle] = useState("");
  const [datos, setDatos] = useState<DatosDelClienteDto>(SIN_DATOS);
  const [erroresCliente, setErroresCliente] = useState<ReturnType<typeof problemasDelCliente>>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);
  const [clave, setClave] = useState("");

  // Cada cuenta abre el formulario limpio, con su clave. Derivado en el render, sin efecto.
  if ((cuenta?.id ?? null) !== para) {
    setPara(cuenta?.id ?? null);
    setDetalle("");
    setDatos(SIN_DATOS);
    setErroresCliente(null);
    setErrores({});
    setClave(globalThis.crypto.randomUUID());
  }
  if (!cuenta) return null;
  const sinCliente = !cuenta.cliente;

  async function confirmar() {
    if (!cuenta || enviando) return;
    const nuevos: Record<string, string> = { ...(a.falta() ?? {}) };
    const problemas = sinCliente ? problemasDelCliente(datos) : null;
    setErroresCliente(problemas);
    if (problemas) nuevos.cliente = "Faltan los datos del cliente";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    setEnviando(true);
    const r = await marcarDeuda(
      {
        idempotencyKey: clave,
        accountId: cuenta.id,
        version: cuenta.version,
        ...(detalle.trim() ? { detalle: detalle.trim() } : {}),
        ...(sinCliente ? { cliente: datos } : {}),
      },
      a.autorizacion(`Se fue sin pagar${detalle.trim() ? ` · ${detalle.trim()}` : ""}`),
    ).catch((): Rechazo => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la cuenta sigue como estaba." }));
    setEnviando(false);
    if (r.ok) {
      avisar.ok(`${numeroDeOrden(r.valor.cuenta)} queda en deuda a nombre de ${r.valor.deuda.cliente.nombre}`, {
        detalle: "Sale de la cola y del cierre; se cobra cuando vuelva (Caja → Deudas).",
      });
      onHecha(r.valor);
      return;
    }
    const e = erroresDeRechazo(r.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Se fue sin pagar"
      descripcion="La cuenta sale de la cola y del cierre y la mesa queda libre. Lo que debe queda a nombre de su cliente: se cobra cuando vuelva. Nada se borra."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="danger" onClick={() => void confirmar()} disabled={a.permiso === "DENEGADO" || enviando}>
            {enviando ? "Anotando…" : "Dejar en deuda"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3 rounded-[var(--radius-control)] border border-line p-3">
          <span className="min-w-0">
            <span className="tnum font-semibold text-ink">{numeroDeOrden(cuenta)}</span>
            <span className="text-ink-2"> · {nombreDeCuenta(cuenta)}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-1.5 text-detalle text-ink-3">
            {preciosConIva ? "Debe" : "Consumo"}
            <MoneyDisplay value={toMajor(pendiente(cuenta))} currency="USD" />
            {!preciosConIva && <span>+ IVA</span>}
          </span>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-etiqueta font-semibold text-ink-3 uppercase">1 · A nombre de</legend>
          {sinCliente ? (
            <>
              <p className="text-detalle text-ink-2">Esta cuenta no tiene cliente: escribe sus datos para poder cobrárselo.</p>
              <DatosDelCliente
                valor={datos}
                onCambio={(d) => {
                  setDatos(d);
                  if (erroresCliente) setErroresCliente(problemasDelCliente(d));
                }}
                errores={erroresCliente}
                surface="tablet"
              />
            </>
          ) : (
            <p className="flex flex-col gap-0.5 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-cuerpo">
              <span className="font-semibold text-ink">{cuenta.cliente!.nombre}</span>
              <span data-privado="" className="tnum text-detalle text-ink-2">
                {cuenta.cliente!.cedula} · {cuenta.cliente!.telefono}
              </span>
            </p>
          )}
          <Input
            label="Detalle (opcional)"
            surface="tablet"
            value={detalle}
            maxLength={200}
            placeholder="Mesa junto a la puerta, local lleno"
            onChange={(e) => setDetalle(e.target.value)}
          />
        </fieldset>
        <CampoAutorizacion
          a={a}
          numero={2}
          denegado="Tu puesto no puede dejar cuentas en deuda."
          errores={errores}
          deshabilitado={enviando}
          onConfirmar={() => void confirmar()}
        />
        {(errores.general || errores.cliente) && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-detalle text-state-crit">
            {errores.general || errores.cliente}
          </p>
        )}
      </div>
    </Dialog>
  );
}
