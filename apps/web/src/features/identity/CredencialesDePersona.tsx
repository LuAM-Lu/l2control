"use client";

import { useState } from "react";
import { Check, Copy, Fingerprint, KeyRound, Link2, MonitorCheck, ShieldCheck, Smartphone, TriangleAlert, X } from "lucide-react";
import type { AppNuevaDto, CredencialesDePersonaDto, EnlaceDeAltaDto, TipoDeEnlace, UserSummaryDto } from "@l2/contracts";
import { Badge, Button, Confirmacion, Dialog, Input, avisar } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";
import { useConElevacion } from "./ElevacionProvider";
import { confirmarApp, crearEnlaceDeAlta, iniciarApp, retirarApp, retirarConfianza } from "./identidad.acciones";
import { useOperador } from "./operador";
import { Qr } from "./Qr";

/**
 * Las credenciales de administración de una persona (ADR-020 y ADR-029): si tiene contraseña, sus
 * equipos de confianza (en ellos le basta la contraseña), si tiene la app de autenticación, qué llaves
 * de acceso y cuántos códigos de recuperación le quedan. Nunca un secreto.
 *
 * La app la configura cada persona para sí, desde su sesión (escanea un QR y escribe el primer
 * código). Quitar la app o retirar la confianza en un equipo lo puede hacer ella o quien gestiona
 * personas: es lo que se hace si pierde el teléfono o deja de usar ese equipo.
 *
 * Quien gestiona personas le da un **enlace de alta** de 24 h y de un solo uso, con su QR: la
 * persona lo abre en su equipo o en su teléfono y pone ella su contraseña (y su llave, si quiere).
 * Quien genera el enlace no ve la contraseña ni toca la llave, así que no puede hacerse pasar por
 * ella. El enlace se enseña UNA vez: el servidor solo guarda su huella.
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
  const yo = useOperador();
  const [ocupado, setOcupado] = useState(false);
  const [reponer, setReponer] = useState(false);
  const [enlace, setEnlace] = useState<EnlaceDeAltaDto | null>(null);
  const [appNueva, setAppNueva] = useState<AppNuevaDto | null>(null);
  const [quitarApp, setQuitarApp] = useState(false);

  const { tieneContrasena, llaves, app, equiposDeConfianza, codigosRestantes, enlacePendiente } = credenciales;
  const esYo = yo?.id === usuario.id;
  const puedeTocar = esYo || puedeGestionar;
  // Con la contraseña y algún factor ya confirma identidad (ADR-029).
  const completas = tieneContrasena && (llaves.length > 0 || app || equiposDeConfianza.length > 0 || codigosRestantes > 0);
  // Fuera de sus equipos de confianza necesita la app o una llave: los códigos se acaban.
  const soloEnSuEquipo = completas && !app && llaves.length === 0;
  const nombre = usuario.fullName.split(" ")[0];

  async function generar(kind: TipoDeEnlace) {
    setOcupado(true);
    const r = await conElevacion(() => crearEnlaceDeAlta({ userId: usuario.id, kind })).catch(() => null);
    setOcupado(false);
    setReponer(false);
    if (!r) return avisar.error("El servidor no respondió. No se generó ningún enlace; inténtalo de nuevo.");
    if (!r.ok) return avisar.error(r.problemas?.[0]?.message ?? r.mensaje);
    setEnlace(r.valor);
  }

  async function empezarApp() {
    setOcupado(true);
    const r = await conElevacion(() => iniciarApp()).catch(() => null);
    setOcupado(false);
    if (!r) return avisar.error("El servidor no respondió. Inténtalo de nuevo.");
    if (!r.ok) return avisar.error(r.mensaje);
    setAppNueva(r.valor);
  }

  async function quitar() {
    setOcupado(true);
    const r = await conElevacion(() => retirarApp({ userId: usuario.id })).catch(() => null);
    setOcupado(false);
    setQuitarApp(false);
    if (!r) return avisar.error("El servidor no respondió. La app sigue configurada; inténtalo de nuevo.");
    if (!r.ok) return avisar.error(r.mensaje);
    avisar.ok("App de autenticación quitada.");
  }

  async function dejarDeConfiar(id: string, equipo: string) {
    setOcupado(true);
    const r = await conElevacion(() => retirarConfianza({ id })).catch(() => null);
    setOcupado(false);
    if (!r) return avisar.error("El servidor no respondió. Ese equipo sigue de confianza; inténtalo de nuevo.");
    if (!r.ok) return avisar.error(r.mensaje);
    avisar.ok(`«${equipo}» ya no es de confianza.`);
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-ink">Credenciales de administración</h3>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Su contraseña y un segundo factor: con ellos confirma que es {nombre} para configuración, precios y personas.
          </p>
        </div>
        {completas ? (
          <Badge tone="ok" icon={<ShieldCheck size={12} aria-hidden="true" />}>
            Puede confirmar identidad
          </Badge>
        ) : (
          <Badge tone="warn" icon={<TriangleAlert size={12} aria-hidden="true" />}>
            {tieneContrasena ? "Sin segundo factor" : "Sin credenciales"}
          </Badge>
        )}
      </div>

      {tieneContrasena && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {equiposDeConfianza.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[13px] text-ink-2">
              <MonitorCheck size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              {/* En el teléfono, la fecha baja de renglón: si no, el nombre del equipo se queda en una letra. */}
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-1">
                <span className="min-w-0 truncate font-medium text-ink">{c.equipo}</span>
                <span className="tnum shrink-0 text-[12px] text-ink-3">
                  <span className="hidden sm:inline">· </span>de confianza desde el {reloj.diaConAnio(Date.parse(c.desde))}
                </span>
              </span>
              {puedeTocar && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void dejarDeConfiar(c.id, c.equipo)}
                  aria-label={`Retirar la confianza en ${c.equipo}`}
                  className="flex min-h-8 shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-control)] px-2 text-[12px] font-medium text-ink-2 hover:bg-base hover:text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
                >
                  <X size={13} aria-hidden="true" />
                  Retirar
                </button>
              )}
            </li>
          ))}
          <li className="flex items-center gap-2 text-[13px] text-ink-2">
            <Smartphone size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
            <span className={app ? "font-medium text-ink" : undefined}>{app ? "App de autenticación configurada" : "Sin app de autenticación"}</span>
          </li>
        </ul>
      )}

      {llaves.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {llaves.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-[13px] text-ink-2">
              <Fingerprint size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-1">
                <span className="min-w-0 truncate font-medium text-ink">{l.etiqueta}</span>
                <span className="tnum shrink-0 text-[12px] text-ink-3">
                  <span className="hidden sm:inline">· </span>desde el {reloj.diaConAnio(Date.parse(l.creada))}
                  {l.ultimoUso ? ` · usada el ${reloj.dia(Date.parse(l.ultimoUso))}` : " · sin usar"}
                </span>
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

      {soloEnSuEquipo && (
        <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-control)] bg-state-warn-bg p-2.5 text-[12.5px] text-state-warn">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {/* Tras un alta por enlace no hay equipo de confianza (el enlace no aprueba ninguno): solo los códigos. */}
          {equiposDeConfianza.length > 0
            ? esYo
              ? "Fuera de tu equipo de confianza solo te quedan los códigos de recuperación. Configura la app de autenticación: es un QR y un código."
              : "Fuera de su equipo de confianza solo le quedan los códigos de recuperación. Que configure la app de autenticación desde su sesión."
            : esYo
              ? "Sin app ni llave, solo puedes confirmar con los códigos de recuperación, y se acaban. Configura la app de autenticación: es un QR y un código."
              : "Sin app ni llave, solo puede confirmar con los códigos de recuperación, y se acaban. Que configure la app de autenticación desde su sesión."}
        </p>
      )}

      {enlacePendiente && (
        <p className="tnum mt-3 flex items-start gap-2 text-[12.5px] text-ink-2">
          <Link2 size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
          Tiene un enlace {enlacePendiente.kind === "ALTA" ? "de alta" : "para otra llave"} sin usar, que vale hasta el{" "}
          {reloj.dia(Date.parse(enlacePendiente.caduca))} a las {reloj.hora(Date.parse(enlacePendiente.caduca))}. Generar otro lo anula.
        </p>
      )}

      {((esYo && tieneContrasena) || (app && puedeTocar)) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {esYo && tieneContrasena && (
            <Button surface="admin" variant={app ? "ghost" : "primary"} disabled={ocupado} onClick={() => void empezarApp()}>
              <Smartphone size={14} aria-hidden="true" />
              {app ? "Cambiar mi app" : "Configurar mi app"}
            </Button>
          )}
          {app && puedeTocar && (
            <Button surface="admin" variant="ghost" disabled={ocupado} onClick={() => setQuitarApp(true)}>
              <X size={14} aria-hidden="true" />
              Quitar la app
            </Button>
          )}
        </div>
      )}

      {puedeGestionar && (
        <div className="mt-2 flex flex-wrap gap-2">
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
            <Button surface="admin" variant="ghost" disabled={ocupado} onClick={() => void generar("LLAVE")}>
              <Fingerprint size={14} aria-hidden="true" />
              Añadir una llave
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
        Cuando {nombre} use el enlace, su contraseña, sus llaves de acceso, su app, sus equipos de confianza y sus códigos de
        recuperación de ahora dejan de valer y pone unos nuevos. Hasta entonces sigue con los que tiene. Es para quien lo perdió todo.
      </Confirmacion>

      <Confirmacion
        abierto={quitarApp}
        onCerrar={() => setQuitarApp(false)}
        titulo={esYo ? "Quitar tu app de autenticación" : `Quitar la app de ${usuario.fullName}`}
        confirmar="Sí, quitarla"
        onConfirmar={() => void quitar()}
        peligro
        ocupado={ocupado}
      >
        Sus códigos dejan de valer al momento. Hazlo si se perdió o se cambió el teléfono; después se puede configurar otra vez.
      </Confirmacion>

      {enlace && <DialogoDelEnlace enlace={enlace} onCerrar={() => setEnlace(null)} />}
      {appNueva && <DialogoDeApp app={appNueva} onCerrar={() => setAppNueva(null)} />}
    </div>
  );
}

/**
 * Configurar la app de autenticación (ADR-029): el QR (o la clave, para teclearla) se enseña solo
 * esta vez; queda en vigor cuando la persona escribe el primer código que le da la app.
 */
function DialogoDeApp({ app, onCerrar }: { app: AppNuevaDto; onCerrar: () => void }) {
  const conElevacion = useConElevacion();
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const listo = /^\d{6}$/.test(codigo.replace(/\s/g, ""));
  // En grupos de cuatro, como la piden las apps al teclearla a mano.
  const claveLegible = app.secreto.match(/.{1,4}/g)?.join(" ") ?? app.secreto;

  async function confirmar() {
    setEnviando(true);
    setError(null);
    const r = await conElevacion(() => confirmarApp({ codigo })).catch(() => null);
    setEnviando(false);
    if (!r) return setError("El servidor no respondió. Inténtalo de nuevo.");
    if (!r.ok) return setError(r.problemas?.[0]?.message ?? r.mensaje);
    avisar.ok("App de autenticación lista. Ya puedes confirmar con su código desde cualquier equipo.");
    onCerrar();
  }

  return (
    <Dialog
      abierto
      onCerrar={onCerrar}
      titulo="Configura tu app de autenticación"
      descripcion="Con Google Authenticator, Authy, Microsoft Authenticator o el gestor de contraseñas del iPhone."
      pie={
        <div className="flex gap-2">
          <Button surface="admin" variant="ghost" className="flex-1" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="admin" variant="primary" className="flex-1" onClick={() => void confirmar()} disabled={!listo || enviando}>
            <ShieldCheck size={15} aria-hidden="true" />
            {enviando ? "Comprobando…" : "Confirmar"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (listo && !enviando) void confirmar();
        }}
      >
        <p className="self-start text-[13px] text-ink-2">1. En la app, añade una cuenta y escanea este código.</p>
        <Qr valor={app.otpauth} titulo="Código QR para la app de autenticación" className="size-44" />
        <p className="self-start text-[12px] text-ink-3">¿No puedes escanearlo? Escribe en la app esta clave:</p>
        <p className="w-full rounded-[var(--radius-control)] border border-line bg-base px-2.5 py-1.5 text-center font-mono text-[13px] tracking-[0.08em] text-ink select-all">
          {claveLegible}
        </p>
        <div className="w-full">
          <Input
            label="2. Escribe el código que te da ahora"
            surface="admin"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="000 000"
            className="tnum font-mono tracking-[0.2em]"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[^\d\s]/g, ""))}
            error={error ?? undefined}
          />
        </div>
        <p className="flex items-start gap-2 self-start text-[12px] text-ink-3">
          <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          Este código QR se enseña solo ahora. Si cambias de teléfono, vuelve aquí y configúrala otra vez.
        </p>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
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
