"use client";

import { useState } from "react";
import { Fingerprint, KeyRound, MonitorCheck, Smartphone } from "lucide-react";
import type { Desafio, OpcionesDeFirma } from "@l2/application";
import type { Resultado } from "@l2/contracts";
import { Input, cn, type Surface } from "@l2/ui";
import { firmarConLlave } from "./llave.cliente";

/**
 * Con qué confirma identidad la administración (ADR-020 y ADR-029): su contraseña y, además, una de
 * estas: su equipo de confianza (en él basta la contraseña), el código de su app de autenticación,
 * su llave de acceso o uno de sus códigos de recuperación. Lo usan el diálogo de elevación y el alta
 * de un equipo desde sí mismo; los dos envían lo mismo y el servidor lo comprueba entero.
 */

export type Modo = "EQUIPO" | "APP" | "LLAVE" | "CODIGO";

/** `K7F2Q-X9B3M`: diez símbolos; se aceptan sin guion, con espacios y en minúsculas. */
const codigoCompleto = (texto: string) => texto.replace(/[\s-]/g, "").length === 10;
/** Seis cifras de la app; se aceptan con un espacio en medio. */
const codigoDeAppCompleto = (texto: string) => /^\d{6}$/.test(texto.replace(/\s/g, ""));

/**
 * `disponibles`: los modos que tiene esta persona aquí, en el orden en que se ofrecen (el primero es
 * el que sale al abrir). Sin saberlo (un equipo sin aprobar no sabe de quién es), se ofrecen la app,
 * la llave y el código.
 */
export function useSegundoFactor(disponibles: readonly Modo[] = ["APP", "LLAVE", "CODIGO"]) {
  const [contrasena, setContrasena] = useState("");
  const [elegido, setModo] = useState<Modo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigoApp, setCodigoApp] = useState("");
  // Hasta que la persona elige, manda el primero de los que tiene (cambia si llegan las opciones).
  const modo: Modo = elegido && disponibles.includes(elegido) ? elegido : (disponibles[0] ?? "CODIGO");

  const listo =
    contrasena.length > 0 &&
    (modo === "EQUIPO" || modo === "LLAVE" || (modo === "APP" && codigoDeAppCompleto(codigoApp)) || (modo === "CODIGO" && codigoCompleto(codigo)));

  return {
    contrasena,
    setContrasena,
    modo,
    setModo,
    disponibles,
    codigo,
    setCodigo,
    codigoApp,
    setCodigoApp,
    listo,
    /**
     * Lo que se manda al servidor como segundo factor (`null` en el equipo de confianza). Con la
     * llave, el navegador la pide aquí (Windows Hello, el teléfono); si no se puede, vuelve el porqué.
     */
    async presentar(
      pedirDesafio: () => Promise<Resultado<Desafio<OpcionesDeFirma>>>,
    ): Promise<{ ok: true; factor: unknown } | { ok: false; mensaje: string }> {
      if (modo === "EQUIPO") return { ok: true, factor: null };
      if (modo === "APP") return { ok: true, factor: { tipo: "APP", codigo: codigoApp.replace(/\s/g, "") } };
      if (modo === "CODIGO") return { ok: true, factor: { tipo: "CODIGO", codigo } };
      const firma = await firmarConLlave(pedirDesafio);
      if (!firma.ok) return firma;
      return { ok: true, factor: { tipo: "LLAVE", desafioId: firma.desafioId, respuesta: firma.respuesta } };
    },
    /**
     * Tras un rechazo se vacía lo tecleado: una contraseña mala oculta tras los puntos haría
     * fallar el siguiente intento, y cada fallo acerca el bloqueo.
     */
    vaciar() {
      setContrasena("");
      setCodigo("");
      setCodigoApp("");
    },
  };
}

const CAMBIAR_A: Record<Modo, { texto: string; icono: typeof KeyRound }> = {
  EQUIPO: { texto: "Usar solo mi contraseña (equipo de confianza)", icono: MonitorCheck },
  APP: { texto: "Usar el código de mi app de autenticación", icono: Smartphone },
  LLAVE: { texto: "Usar mi llave de acceso", icono: Fingerprint },
  CODIGO: { texto: "Usar un código de recuperación", icono: KeyRound },
};

export function CamposDeIdentidad({
  factor,
  surface,
  error,
}: {
  factor: ReturnType<typeof useSegundoFactor>;
  surface: Surface;
  error: string | null;
}) {
  const { modo } = factor;
  // El error va junto al campo que se tecleó al final: el código, o la contraseña si no hay código.
  const conCampo = modo === "APP" || modo === "CODIGO";
  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        surface={surface}
        value={factor.contrasena}
        onChange={(e) => factor.setContrasena(e.target.value)}
        error={conCampo ? undefined : (error ?? undefined)}
      />
      {modo === "EQUIPO" && (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
          <MonitorCheck size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Este equipo es de tu confianza: basta tu contraseña.
        </p>
      )}
      {modo === "APP" && (
        <Input
          label="Código de tu app de autenticación"
          surface={surface}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="000 000"
          className="tnum font-mono tracking-[0.2em]"
          hint="Las seis cifras que da ahora Google Authenticator, Authy o la que uses."
          value={factor.codigoApp}
          onChange={(e) => factor.setCodigoApp(e.target.value.replace(/[^\d\s]/g, ""))}
          error={error ?? undefined}
        />
      )}
      {modo === "LLAVE" && (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
          <Fingerprint size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Al confirmar, este equipo te pedirá tu llave de acceso: la huella, la cara o el PIN del equipo, o tu teléfono.
        </p>
      )}
      {modo === "CODIGO" && (
        <Input
          label="Código de recuperación"
          surface={surface}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={14}
          placeholder="XXXXX-XXXXX"
          className="tnum font-mono tracking-[0.12em] uppercase"
          hint="Uno de los diez que imprimiste. Cada código vale una sola vez."
          value={factor.codigo}
          onChange={(e) => factor.setCodigo(e.target.value.toUpperCase())}
          error={error ?? undefined}
        />
      )}
      {factor.disponibles
        .filter((m) => m !== modo)
        .map((m) => {
          const { texto, icono: Icono } = CAMBIAR_A[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => factor.setModo(m)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                surface === "admin" ? "min-h-8" : "min-h-12",
              )}
            >
              <Icono size={14} aria-hidden="true" />
              {texto}
            </button>
          );
        })}
    </div>
  );
}
