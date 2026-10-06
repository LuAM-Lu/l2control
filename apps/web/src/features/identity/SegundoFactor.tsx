"use client";

import { useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import type { Desafio, OpcionesDeFirma } from "@l2/application";
import type { Resultado } from "@l2/contracts";
import { Input, cn, type Surface } from "@l2/ui";
import { firmarConLlave } from "./llave.cliente";

/**
 * Con qué confirma identidad la administración (ADR-020): su contraseña y, además, su llave de
 * acceso o uno de sus códigos de recuperación. Lo usan el diálogo de elevación y el alta de un
 * equipo desde sí mismo; los dos envían lo mismo y el servidor lo comprueba entero.
 */

export type Modo = "LLAVE" | "CODIGO";

/** `K7F2Q-X9B3M`: diez símbolos; se aceptan sin guion, con espacios y en minúsculas. */
const codigoCompleto = (texto: string) => texto.replace(/[\s-]/g, "").length === 10;

export function useSegundoFactor() {
  const [contrasena, setContrasena] = useState("");
  const [modo, setModo] = useState<Modo>("LLAVE");
  const [codigo, setCodigo] = useState("");

  return {
    contrasena,
    setContrasena,
    modo,
    setModo,
    codigo,
    setCodigo,
    listo: contrasena.length > 0 && (modo === "LLAVE" || codigoCompleto(codigo)),
    /**
     * Lo que se manda al servidor como segundo factor. Con la llave, el navegador la pide aquí
     * (Windows Hello, el teléfono); si la persona la cancela, vuelve el porqué.
     */
    async presentar(
      pedirDesafio: () => Promise<Resultado<Desafio<OpcionesDeFirma>>>,
    ): Promise<{ ok: true; factor: unknown } | { ok: false; mensaje: string }> {
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
    },
  };
}

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
  return (
    <div className="flex flex-col gap-3">
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        surface={surface}
        value={factor.contrasena}
        onChange={(e) => factor.setContrasena(e.target.value)}
        error={modo === "LLAVE" ? (error ?? undefined) : undefined}
      />
      {modo === "LLAVE" ? (
        <p className="flex items-start gap-2 text-[12.5px] text-ink-2">
          <Fingerprint size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          Al confirmar, este equipo te pedirá tu llave de acceso: la huella, la cara o el PIN del equipo, o tu teléfono.
        </p>
      ) : (
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
      <button
        type="button"
        onClick={() => factor.setModo(modo === "LLAVE" ? "CODIGO" : "LLAVE")}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 self-start text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          surface === "admin" ? "min-h-8" : "min-h-12",
        )}
      >
        <KeyRound size={14} aria-hidden="true" />
        {modo === "LLAVE" ? "No tengo mi llave: usar un código de recuperación" : "Usar mi llave de acceso"}
      </button>
    </div>
  );
}
