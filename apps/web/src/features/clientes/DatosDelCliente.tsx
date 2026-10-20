"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { TriangleAlert, UserCheck } from "lucide-react";
import { DatosDelClienteSchema, type ClienteEncontradoDto, type DatosDelClienteDto } from "@l2/contracts";
import { contactKey, documentKey, telefonoLegible } from "@l2/domain-park";
import { money, sum, toMajor } from "@l2/domain-money";
import type { Exigido } from "@l2/domain-orders";
import { Input, formatMoneyVE, type Surface } from "@l2/ui";
import { CampoCedula, CampoTelefono } from "./CamposDelCliente.tsx";
import { CampoDelCliente, type ClienteElegido, type ParaQue } from "./CampoDelCliente.tsx";
import { buscarCliente } from "./clientes.acciones";

/**
 * Los datos del cliente de una cuenta — B6-9 (M-33): cédula, teléfono y nombre, los tres obligatorios. Lo usan sentar a
 * alguien en Mesas y dejar pendiente una venta en la caja.
 *
 * La cédula va primero: el que ya vino se reconoce por ella (o por su teléfono) y lo demás se rellena solo, sin pisar
 * lo que ya se escribió. Todo el que atiende ve los datos completos (M-33); los campos llevan `data-privado` para que la
 * captura de un reporte de problema no los lleve (PLAN §7.6).
 *
 * T-23 (M-38): arriba, el campo del cliente («Cédula, teléfono o nombre»), que propone a quien está aquí y busca por
 * nombre; al elegir, rellena lo que esté vacío y «No es esta persona» lo deja como estaba.
 *
 * B6-22 (M-40): `exige` dice qué hace falta además del nombre (al sentar, lo deciden los ajustes de la sucursal). Lo que
 * no se exige puede quedar vacío; si se escribe, tiene que valer.
 */

export const SIN_DATOS: DatosDelClienteDto = { nombre: "", cedula: "", telefono: "" };

/** Los tres datos: lo de siempre fuera de sentar (dejar pendiente una venta, una deuda sin cliente). */
export const TODO_EL_CLIENTE: Exigido = { cedula: true, telefono: true };

/** Los problemas de cada campo según el contrato, o `null` si valen. Lo no exigido puede ir vacío (B6-22). */
export function problemasDelCliente(d: DatosDelClienteDto, exige: Exigido = TODO_EL_CLIENTE): Partial<Record<keyof DatosDelClienteDto, string>> | null {
  const r = DatosDelClienteSchema.safeParse(d);
  if (r.success) return null;
  const p: Partial<Record<keyof DatosDelClienteDto, string>> = {};
  for (const i of r.error.issues) {
    const campo = i.path[0] as keyof DatosDelClienteDto;
    if (campo !== "nombre" && !exige[campo] && d[campo].trim() === "") continue;
    p[campo] ??= i.message;
  }
  return Object.keys(p).length > 0 ? p : null;
}

export function DatosDelCliente({
  valor,
  onCambio,
  errores,
  surface = "tablet",
  autoFocus = false,
  onElegido,
  trasElElegido,
  para = "MESA",
  exige = TODO_EL_CLIENTE,
}: {
  /** Dónde se usa: ordena «Aquí ahora» (T-24). */
  para?: ParaQue;
  /** Lo que hace falta además del nombre (B6-22): lo demás se puede dejar vacío. */
  exige?: Exigido;
  /** Lo que va justo debajo del campo del cliente (sentar: «Llevar el tiempo de sus niños»), a la vista al elegir. */
  trasElElegido?: ReactNode;
  valor: DatosDelClienteDto;
  onCambio: (d: DatosDelClienteDto) => void;
  /** El cliente que se eligió en el campo del cliente (T-23), o `null` al deshacerlo: sentar lo usa para sus niños. */
  onElegido?: (c: ClienteElegido | null) => void;
  /** Los problemas a la vista, después de intentar enviar. */
  errores?: Partial<Record<keyof DatosDelClienteDto, string>> | null;
  surface?: Surface;
  autoFocus?: boolean;
}) {
  const [conocido, setConocido] = useState<ClienteEncontradoDto | null>(null);
  // T-23: el elegido en el campo del cliente y lo que había antes, para deshacerlo.
  const [elegido, setElegido] = useState<{ cliente: ClienteElegido; antes: DatosDelClienteDto } | null>(null);
  const elegir = (c: ClienteElegido) => {
    setElegido({ cliente: c, antes: valor });
    onElegido?.(c);
    // Nada pisa lo escrito: se rellena lo que esté vacío.
    onCambio({
      nombre: valor.nombre.trim() === "" ? c.nombre : valor.nombre,
      cedula: valor.cedula.trim() === "" && c.cedula ? c.cedula : valor.cedula,
      telefono: valor.telefono.trim() === "" ? c.telefono : valor.telefono,
    });
  };
  const deshacer = () => {
    if (elegido) onCambio(elegido.antes);
    setElegido(null);
    setConocido(null);
    onElegido?.(null);
  };
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
      {/* T-24: un solo campo, «Cédula o RIF», con «Aquí ahora» y «Buscar por nombre o teléfono»; al elegir, lo de abajo
          se rellena. */}
      <CampoDelCliente
        elegido={elegido?.cliente ?? null}
        onElegir={elegir}
        onDeshacer={deshacer}
        surface={surface}
        autoFocus={autoFocus}
        para={para}
        cedula={{
          valor: valor.cedula,
          onCambio: (cedula) => onCambio({ ...valor, cedula }),
          required: exige.cedula,
          error: errores?.cedula,
          // B6-22: con «Más rápido» se puede dejar para después; se pide antes del segundo pedido.
          hint: exige.cedula ? undefined : "Si la da ahora; si no, antes del segundo pedido",
        }}
      />
      {trasElElegido}
      {/* El elegido sin cédula (de antes de T-19): se escribe aquí. */}
      {elegido && !elegido.cliente.cedula && (
        <CampoCedula label="Cédula o RIF" surface={surface} valor={valor.cedula} onCambio={(cedula) => onCambio({ ...valor, cedula })} required={exige.cedula} error={errores?.cedula} />
      )}
      <CampoTelefono
        surface={surface}
        valor={valor.telefono}
        onCambio={(telefono) => onCambio({ ...valor, telefono })}
        required={exige.telefono}
        error={errores?.telefono}
        // B6-22: «Solo si queda una deuda»: si lo da, queda en el directorio.
        hint={exige.telefono ? undefined : "Si lo da: así queda en el directorio"}
      />
      <Input
        label="Nombre y apellido"
        surface={surface}
        value={valor.nombre}
        onChange={(e) => onCambio({ ...valor, nombre: e.target.value })}
        maxLength={80}
        autoComplete="off"
        // B6-17: las reglas de teclado de B4-18 en sentar: mayúscula inicial e Intro «Listo».
        autoCapitalize="words"
        enterKeyHint="done"
        spellCheck={false}
        placeholder="María Pérez"
        aria-required="true"
        error={errores?.nombre}
      />
      {sigueSiendo && !elegido && (
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
