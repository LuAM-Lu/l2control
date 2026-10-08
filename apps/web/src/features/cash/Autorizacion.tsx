"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { can } from "@l2/domain-identity";
import { Input, cn } from "@l2/ui";
import { useOperador } from "../identity/operador.ts";
import { useActorEnSesion } from "../identity/sesion.ts";
import { autorizadoresDeCaja } from "../cuentas/cuentas.acciones";

/**
 * Quién autoriza una operación de la caja que devuelve o regala dinero — §7.3, DEC-24, B3-4.
 *
 * La lista y el PIN son del servidor: él dice quién puede autorizar a quien opera, comprueba el PIN
 * con su bloqueo creciente y deja la autorización en la auditoría antes de ejecutar. Quien puede
 * hacerlo por sí mismo (la administración) confirma igual con su PIN: una operación así no se hace
 * con la sesión que alguien dejó abierta.
 */

export type AccionConPin =
  | "cobro.anular"
  | "cuenta.cortesia"
  | "cuenta.incobrable"
  | "cuenta.descuento"
  | "turno.corteZ"
  | "papel.revisar"
  | "inventario.ajustar"
  | "pedido.anularEnProduccion"
  | "parque.anularEntrada";
const PIN_LONGITUD = 4;

export type Autorizador = { id: string; nombre: string; rol: string };

/**
 * `propio`: quien opera firma con su propio PIN, sin pedírselo a nadie (la cajera firma su corte Z
 * dentro del umbral, JORNADA §1). El servidor rechaza el PIN de otra persona.
 * `cargar`: de dónde sale la lista de quién autoriza, si no es una acción de la caja (el inventario, B9-4).
 */
export function useAutorizacion(
  accion: AccionConPin,
  abierto: boolean,
  { propio = false, cargar }: { propio?: boolean; cargar?: () => Promise<Autorizador[]> } = {},
) {
  const actor = useActorEnSesion();
  const operador = useOperador();
  const segunMatriz = actor ? can(actor, accion) : "DENEGADO";
  const permiso = propio && segunMatriz !== "DENEGADO" ? "PERMITIDO" : segunMatriz;
  const pide = permiso === "REQUIERE_AUTORIZACION";
  const [lista, setLista] = useState<Autorizador[] | null>(null);
  const [autorizadorId, setAutorizadorId] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  // Quién puede autorizar lo dice el servidor, cada vez que se abre.
  useEffect(() => {
    if (!abierto) return;
    setAutorizadorId(null);
    setPin("");
    if (!pide) return;
    let vivo = true;
    setLista(null);
    (cargar ? cargar() : autorizadoresDeCaja(accion))
      .then((l) => vivo && setLista(l))
      .catch(() => vivo && setLista([]));
    return () => {
      vivo = false;
    };
  }, [abierto, pide, accion]);

  const autorizadores = useMemo<Autorizador[]>(() => {
    if (!operador) return [];
    if (permiso === "PERMITIDO") return [{ id: operador.id, nombre: operador.nombre, rol: operador.role }];
    return lista ?? [];
  }, [operador, permiso, lista]);
  const autorizador = autorizadores.find((a) => a.id === autorizadorId) ?? (autorizadores.length === 1 ? autorizadores[0]! : null);

  return {
    permiso,
    propio,
    cargando: pide && lista === null,
    autorizadores,
    autorizador,
    elegir: (id: string) => {
      setAutorizadorId(id);
      setPin("");
    },
    pin,
    setPin: (v: string) => setPin(v.replace(/\D/g, "").slice(0, PIN_LONGITUD)),
    borrarPin: () => setPin(""),
    /** Qué falta para poder pedirlo, o `null`. */
    falta: (): { autorizador?: string; pin?: string } | null => {
      if (!autorizador) return { autorizador: "Elige quién autoriza" };
      if (pin.length !== PIN_LONGITUD) return { pin: "Escribe el PIN de 4 dígitos" };
      return null;
    },
    /** La autorización que viaja al servidor: quién, su PIN y el motivo. */
    autorizacion: (motivo: string) => (autorizador ? { autorizadorId: autorizador.id, pin, motivo: motivo.slice(0, 280).padEnd(3, ".") } : undefined),
  };
}

export type EstadoAutorizacion = ReturnType<typeof useAutorizacion>;

/** El bloque «quién autoriza» con su PIN, igual en anular y en regalar. */
export function CampoAutorizacion({
  a,
  numero,
  denegado,
  errores,
  deshabilitado,
  onConfirmar,
}: {
  a: EstadoAutorizacion;
  numero: number;
  /** Qué se dice a quien no puede ni pidiéndolo. */
  denegado: string;
  errores: { autorizador?: string; pin?: string };
  deshabilitado?: boolean;
  onConfirmar: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
        <ShieldCheck size={13} aria-hidden="true" /> {numero} · Autorización
      </legend>
      {a.permiso === "DENEGADO" ? (
        <p className="text-[12.5px] text-state-crit">{denegado}</p>
      ) : a.cargando ? (
        <p className="text-[12.5px] text-ink-3" role="status">
          Buscando quién puede autorizar…
        </p>
      ) : a.autorizadores.length === 0 ? (
        <p className="text-[12.5px] text-state-crit">No hay un supervisor ni un administrador activo que pueda autorizarlo.</p>
      ) : (
        <>
          {a.permiso === "PERMITIDO" ? (
            <p className="text-[12.5px] text-ink-2">
              {a.propio ? "Firmas tú: confirma con tu PIN." : "Autorizas tú: confirma con tu PIN."}
            </p>
          ) : (
            <div role="radiogroup" aria-label="Quién autoriza" className="flex flex-wrap gap-1.5">
              {a.autorizadores.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={a.autorizador?.id === x.id}
                  onClick={() => a.elegir(x.id)}
                  className={cn(
                    "flex min-h-12 cursor-pointer flex-col justify-center rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                    a.autorizador?.id === x.id ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  <span className="text-[13px] font-semibold">{x.nombre}</span>
                  <span className="text-[11px] text-ink-3">{x.rol === "ADMIN" ? "Administración" : "Supervisión"}</span>
                </button>
              ))}
            </div>
          )}
          {errores.autorizador && !a.autorizador && <p className="text-[12px] text-state-crit">{errores.autorizador}</p>}
          <Input
            label={a.autorizador ? `PIN de ${a.autorizador.nombre}` : "PIN de quien autoriza"}
            surface="tablet"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={PIN_LONGITUD}
            value={a.pin}
            disabled={!a.autorizador || deshabilitado}
            onChange={(e) => a.setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onConfirmar();
              }
            }}
            error={errores.pin || undefined}
          />
        </>
      )}
    </fieldset>
  );
}

/** Un rechazo del servidor, dicho en su campo: lo del PIN o de quién autoriza, junto al PIN. */
export function erroresDeRechazo(mensaje: string): { pin?: string; general?: string } {
  return /PIN|bloquead|autorizar/i.test(mensaje) ? { pin: mensaje } : { general: mensaje };
}
