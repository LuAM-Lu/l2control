"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert, UserCheck } from "lucide-react";
import { DatosDelClienteSchema, type ClienteEncontradoDto, type DatosDelClienteDto } from "@l2/contracts";
import { contactKey, documentKey, documentoLegible, telefonoLegible } from "@l2/domain-park";
import { money, sum, toMajor } from "@l2/domain-money";
import { Input, formatMoneyVE, type Surface } from "@l2/ui";
import { buscarCliente } from "./clientes.acciones";

/**
 * Los datos del cliente de una cuenta — B6-9 (M-33): cédula, teléfono y nombre, los tres obligatorios. Lo usan sentar a
 * alguien en Mesas y dejar pendiente una venta en la caja.
 *
 * La cédula va primero: el que ya vino se reconoce por ella (o por su teléfono) y lo demás se rellena solo, sin pisar
 * lo que ya se escribió. Todo el que atiende ve los datos completos (M-33); los campos llevan `data-privado` para que la
 * captura de un reporte de problema no los lleve (PLAN §7.6).
 */

export const SIN_DATOS: DatosDelClienteDto = { nombre: "", cedula: "", telefono: "" };

/** Los problemas de cada campo según el contrato, o `null` si los tres valen. */
export function problemasDelCliente(d: DatosDelClienteDto): Partial<Record<keyof DatosDelClienteDto, string>> | null {
  const r = DatosDelClienteSchema.safeParse(d);
  if (r.success) return null;
  const p: Partial<Record<keyof DatosDelClienteDto, string>> = {};
  for (const i of r.error.issues) {
    const campo = i.path[0] as keyof DatosDelClienteDto;
    p[campo] ??= i.message;
  }
  return p;
}

export function DatosDelCliente({
  valor,
  onCambio,
  errores,
  surface = "tablet",
  autoFocus = false,
}: {
  valor: DatosDelClienteDto;
  onCambio: (d: DatosDelClienteDto) => void;
  /** Los problemas a la vista, después de intentar enviar. */
  errores?: Partial<Record<keyof DatosDelClienteDto, string>> | null;
  surface?: Surface;
  autoFocus?: boolean;
}) {
  const [conocido, setConocido] = useState<ClienteEncontradoDto | null>(null);
  // Lo último que se buscó: la misma cédula o el mismo teléfono no se vuelven a pedir.
  const buscado = useRef<string | null>(null);
  // Lo último que se escribió y a quién avisar, sin reiniciar la búsqueda en cada render.
  const actual = useRef(valor);
  const alCambiar = useRef(onCambio);
  useEffect(() => {
    actual.current = valor;
    alCambiar.current = onCambio;
  });

  const cedulaKey = documentKey(valor.cedula);
  const telefonoKey = telefonoLegible(valor.telefono) ? contactKey(valor.telefono) : null;
  const llave = cedulaKey && cedulaKey.length >= 7 ? `c:${cedulaKey}` : telefonoKey ? `t:${telefonoKey}` : null;

  // Con una cédula o un teléfono completos, ¿ya vino? Si sí, se rellena lo que falta (nunca se pisa lo escrito).
  useEffect(() => {
    if (!llave || llave === buscado.current) return;
    buscado.current = llave;
    let vivo = true;
    const consulta = llave.startsWith("c:") ? { cedula: actual.current.cedula } : { telefono: actual.current.telefono };
    const t = window.setTimeout(() => {
      buscarCliente(consulta)
        .then((r) => {
          if (!vivo || !r.ok || !r.valor) return;
          const c = r.valor;
          const d = actual.current;
          // Un teléfono de otro cliente con otra cédula no es este: no se ofrece.
          if (llave.startsWith("t:") && c.cedula && documentKey(d.cedula) && documentKey(c.cedula) !== documentKey(d.cedula)) return;
          setConocido(c);
          alCambiar.current({
            nombre: d.nombre.trim() === "" ? c.nombre : d.nombre,
            cedula: d.cedula.trim() === "" && c.cedula ? c.cedula : d.cedula,
            telefono: d.telefono.trim() === "" ? c.telefono : d.telefono,
          });
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(t);
    };
  }, [llave]);

  const sigueSiendo = conocido !== null && (documentKey(conocido.cedula ?? "") === cedulaKey || contactKey(conocido.telefono) === contactKey(valor.telefono));

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">Datos del cliente</legend>
      <Input
        label="Cédula o RIF"
        surface={surface}
        value={valor.cedula}
        onChange={(e) => onCambio({ ...valor, cedula: e.target.value })}
        onBlur={() => {
          const legible = documentoLegible(valor.cedula);
          if (legible && legible !== valor.cedula) onCambio({ ...valor, cedula: legible });
        }}
        maxLength={16}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="V-12345678"
        aria-required="true"
        autoFocus={autoFocus}
        data-privado=""
        error={errores?.cedula}
      />
      <Input
        label="Teléfono"
        surface={surface}
        type="tel"
        inputMode="tel"
        value={valor.telefono}
        onChange={(e) => onCambio({ ...valor, telefono: e.target.value })}
        onBlur={() => {
          const legible = telefonoLegible(valor.telefono);
          if (legible && legible !== valor.telefono) onCambio({ ...valor, telefono: legible });
        }}
        maxLength={16}
        autoComplete="off"
        placeholder="0414-1234567"
        aria-required="true"
        data-privado=""
        error={errores?.telefono}
      />
      <Input
        label="Nombre y apellido"
        surface={surface}
        value={valor.nombre}
        onChange={(e) => onCambio({ ...valor, nombre: e.target.value })}
        maxLength={80}
        autoComplete="off"
        placeholder="María Pérez"
        aria-required="true"
        error={errores?.nombre}
      />
      {sigueSiendo && (
        <p role="status" className="flex items-center gap-1.5 text-detalle text-ink-2">
          <UserCheck className="size-(--icono-texto) shrink-0 text-brand" aria-hidden="true" />
          Ya vino antes: sus datos se rellenaron solos.
        </p>
      )}
      {/* Lo que dejó sin pagar (B3-11): se avisa al encontrarlo, y se cobra en la caja. */}
      {sigueSiendo && conocido.deudas.length > 0 && (
        <p role="alert" className="flex items-start gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg px-3 py-2 text-detalle text-state-warn">
          <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
          <span>
            Debe {formatMoneyVE(toMajor(sum(conocido.deudas.map((d) => money(BigInt(d.monto.minor), "USD")), "USD")), "USD")} de antes (
            {conocido.deudas.map((d) => `#${String(d.orden).padStart(4, "0")} · ${d.lugar}`).join("; ")}). Se cobra en la caja.
          </span>
        </p>
      )}
    </fieldset>
  );
}
