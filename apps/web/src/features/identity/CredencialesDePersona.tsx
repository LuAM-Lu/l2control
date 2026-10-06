"use client";

import { useState } from "react";
import { Check, Copy, Fingerprint, KeyRound, Link2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CredencialesDePersonaDto, EnlaceDeAltaDto, TipoDeEnlace, UserSummaryDto } from "@l2/contracts";
import { Badge, Button, Confirmacion, Dialog, avisar } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useConElevacion } from "./ElevacionProvider";
import { crearEnlaceDeAlta } from "./identidad.acciones";
import { Qr } from "./Qr";

/**
 * Las credenciales de administración de una persona (ADR-020, punto 4): si tiene contraseña, qué
 * llaves de acceso y cuántos códigos de recuperación le quedan. Nunca un secreto.
 *
 * Quien gestiona personas le da un **enlace de alta** de 24 h y de un solo uso, con su QR: la
 * persona lo abre en su equipo o en su teléfono y pone ella su contraseña y su llave. Quien genera
 * el enlace no ve la contraseña ni toca la llave, así que no puede hacerse pasar por ella. El
 * enlace se enseña UNA vez: el servidor solo guarda su huella.
 */
export function CredencialesDePersona({
  usuario,
  credenciales,
  puedeGestionar,
}: {
  usuario: UserSummaryDto;
  credenciales: CredencialesDePersonaDto;
  puedeGestionar: boolean;
}) {
  const reloj = useReloj();
  const conElevacion = useConElevacion();
  const [ocupado, setOcupado] = useState(false);
  const [reponer, setReponer] = useState(false);
  const [enlace, setEnlace] = useState<EnlaceDeAltaDto | null>(null);

  const { tieneContrasena, llaves, codigosRestantes, enlacePendiente } = credenciales;
  const completas = tieneContrasena && llaves.length > 0;

  async function generar(kind: TipoDeEnlace) {
    setOcupado(true);
    const r = await conElevacion(() => crearEnlaceDeAlta({ userId: usuario.id, kind })).catch(() => null);
    setOcupado(false);
    setReponer(false);
    if (!r) return avisar.error("El servidor no respondió. No se generó ningún enlace; inténtalo de nuevo.");
    if (!r.ok) return avisar.error(r.problemas?.[0]?.message ?? r.mensaje);
    setEnlace(r.valor);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-ink">Credenciales de administración</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Contraseña y llave de acceso: con ellas confirma que es {usuario.fullName.split(" ")[0]} para configuración, precios y personas.
          </p>
        </div>
        {completas ? (
          <Badge tone="ok" icon={<ShieldCheck size={12} aria-hidden="true" />}>
            Puede confirmar identidad
          </Badge>
        ) : (
          <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden="true" />}>
            {tieneContrasena ? "Sin llave de acceso" : "Sin credenciales"}
          </Badge>
        )}
      </div>

      {llaves.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {llaves.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-[13px] text-ink-2">
              <Fingerprint size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0 truncate font-medium text-ink">{l.etiqueta}</span>
              <span className="tnum shrink-0 text-[12px] text-ink-3">
                · desde el {reloj.diaConAnio(Date.parse(l.creada))}
                {l.ultimoUso ? ` · usada el ${reloj.dia(Date.parse(l.ultimoUso))}` : " · sin usar"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {tieneContrasena && (
        <p className="tnum mt-2 flex items-center gap-2 text-[13px] text-ink-2">
          <KeyRound size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
          {codigosRestantes === 0
            ? "No le queda ningún código de recuperación"
            : `Le ${codigosRestantes === 1 ? "queda 1 código" : `quedan ${codigosRestantes} códigos`} de recuperación`}
        </p>
      )}

      {completas && llaves.length === 1 && (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-state-warn-bg p-2.5 text-[12.5px] text-state-warn">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Tiene una sola llave. Conviene registrar otra en un equipo distinto: si la pierde, solo le quedan los códigos.
        </p>
      )}

      {enlacePendiente && (
        <p className="tnum mt-3 flex items-start gap-2 text-[12.5px] text-ink-2">
          <Link2 size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
          Tiene un enlace {enlacePendiente.kind === "ALTA" ? "de alta" : "para otra llave"} sin usar, que vale hasta el{" "}
          {reloj.dia(Date.parse(enlacePendiente.caduca))} a las {reloj.hora(Date.parse(enlacePendiente.caduca))}. Generar otro lo anula.
        </p>
      )}

      {puedeGestionar && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            surface="admin"
            variant={tieneContrasena ? "ghost" : "primary"}
            disabled={ocupado}
            onClick={() => (tieneContrasena ? setReponer(true) : void generar("ALTA"))}
          >
            <Link2 size={14} aria-hidden="true" />
            {tieneContrasena ? "Reponer credenciales" : "Dar credenciales"}
          </Button>
          {tieneContrasena && (
            <Button surface="admin" variant={llaves.length < 2 ? "primary" : "ghost"} disabled={ocupado} onClick={() => void generar("LLAVE")}>
              <Fingerprint size={14} aria-hidden="true" />
              Añadir otra llave
            </Button>
          )}
        </div>
      )}

      <Confirmacion
        abierto={reponer}
        onCerrar={() => setReponer(false)}
        titulo={`Reponer las credenciales de ${usuario.fullName}`}
        confirmar="Sí, generar el enlace"
        onConfirmar={() => void generar("ALTA")}
        peligro
        ocupado={ocupado}
      >
        Cuando {usuario.fullName.split(" ")[0]} use el enlace, su contraseña, sus llaves de acceso y sus códigos de recuperación de ahora
        dejan de valer y pone unos nuevos. Hasta entonces sigue con los que tiene. Es para quien lo perdió todo.
      </Confirmacion>

      {enlace && <DialogoDelEnlace enlace={enlace} onCerrar={() => setEnlace(null)} />}
    </div>
  );
}

function DialogoDelEnlace({ enlace, onCerrar }: { enlace: EnlaceDeAltaDto; onCerrar: () => void }) {
  const reloj = useReloj();
  const [copiado, setCopiado] = useState(false);
  const caduca = Date.parse(enlace.caduca);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace.url);
      setCopiado(true);
    } catch {
      avisar.error("Este navegador no dejó copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo={enlace.kind === "ALTA" ? `Enlace de alta de ${enlace.nombre}` : `Enlace para otra llave de ${enlace.nombre}`}
      descripcion="Que lo abra en su equipo o lo lea con la cámara de su teléfono. Se muestra solo esta vez."
      pie={
        <Button surface="admin" variant="primary" className="w-full" onClick={onCerrar}>
          Ya se lo di
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <Qr valor={enlace.url} titulo={`Código QR del enlace de ${enlace.nombre}`} className="size-52" />
        <p className="tnum text-center text-[12.5px] text-ink-2">
          Vale una sola vez, hasta el {reloj.dia(caduca)} a las {reloj.hora(caduca)}.
        </p>
        <div className="flex w-full items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] border border-line bg-base px-2.5 py-1.5 font-mono text-[11.5px] text-ink-2 select-all">
            {enlace.url}
          </p>
          <Button surface="admin" variant="ghost" onClick={() => void copiar()}>
            {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="flex items-start gap-2 text-[12px] text-ink-3">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          {enlace.kind === "ALTA"
            ? `Quien tenga este enlace puede poner la contraseña de ${enlace.nombre.split(" ")[0]}: dáselo solo a esa persona, en mano o por un canal privado.`
            : "Para usarlo hace falta además su contraseña. Aun así, dáselo solo a esa persona."}
        </p>
      </div>
    </Dialog>
  );
}
