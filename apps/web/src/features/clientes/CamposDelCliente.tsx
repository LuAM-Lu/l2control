"use client";

import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Input, type Surface } from "@l2/ui";
import {
  LETRAS_DE_DOCUMENTO,
  cursorTrasDigitos,
  digitosALaVista,
  digitosDelTelefono,
  documentoDe,
  partesDelDocumento,
  problemaDelDocumento,
  problemaDelTelefono,
  telefonoALaVista,
  telefonoDe,
  type LetraDeDocumento,
} from "./escritura.ts";

/**
 * Los campos de la cédula y el teléfono — T-19 (M-34, S-19). Los usan la entrada al parque, los datos del cliente
 * (sentar, de pie, la venta del mostrador, la deuda) y «Factura a».
 *
 * Ayudan a llenarlos: la letra va aparte (V, E, J, G, P) y los dígitos con el teclado numérico; lo pegado («V-12.345.678»,
 * «+58 414 1234567») se entiende; se muestran con puntos y se guardan en la forma de la casa («V-12345678»,
 * «0414-1234567»). Lo que falta se dice junto al campo al salir de él, no al enviar; con el dato completo, Intro pasa al
 * campo siguiente. Llevan `data-privado` (PLAN §7.6).
 */

type Comunes = {
  label?: string;
  /** Lo que ya se guardó: «V-12345678» o «0414-1234567» (también lo que vaya escrito a medias). */
  valor: string;
  onCambio: (v: string) => void;
  surface?: Surface;
  /** Un problema de fuera (el servidor, o el formulario al intentar enviar): manda sobre el propio. */
  error?: string | undefined;
  hint?: string | undefined;
  autoFocus?: boolean | undefined;
  leading?: ReactNode | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;
  onBlur?: () => void;
  required?: boolean;
  disabled?: boolean | undefined;
};

/** Reescribe el campo y deja el cursor tras los mismos dígitos. */
function useCursor() {
  const elemento = useRef<HTMLInputElement | null>(null);
  const pendiente = useRef<{ digitos: number } | null>(null);
  useLayoutEffect(() => {
    const el = elemento.current;
    const p = pendiente.current;
    if (!el || !p || document.activeElement !== el) return;
    pendiente.current = null;
    const pos = cursorTrasDigitos(el.value, p.digitos);
    el.setSelectionRange(pos, pos);
  });
  /** `ajuste`: los dígitos que la forma de la casa puso o quitó delante (el 0 de la operadora, el 58 del país). */
  const recordar = (ev: ChangeEvent<HTMLInputElement>, ajuste = 0) => {
    const antes = ev.target.value.slice(0, ev.target.selectionStart ?? ev.target.value.length);
    pendiente.current = { digitos: antes.replace(/\D/g, "").length + ajuste };
  };
  return { elemento, recordar };
}

/**
 * Intro avanza al campo siguiente del mismo formulario (o del mismo bloque) si el dato ya vale; en el último, o con el
 * dato a medias, Intro hace lo de siempre.
 */
function alIntro(ev: KeyboardEvent<HTMLInputElement>, vale: boolean) {
  if (ev.key !== "Enter" || !vale) return;
  const el = ev.currentTarget;
  const zona = el.form ?? el.closest("fieldset, [role=dialog], dialog, section, aside") ?? document.body;
  const campos = [...zona.querySelectorAll<HTMLInputElement>("input:not([type=hidden]):not([disabled]), textarea:not([disabled])")].filter(
    (c) => c.getClientRects().length > 0,
  );
  const siguiente = campos[campos.indexOf(el) + 1];
  if (!siguiente) return;
  ev.preventDefault();
  siguiente.focus();
}

function unirRefs<T>(...refs: (Ref<T> | undefined)[]): (el: T | null) => void {
  return (el) => {
    for (const r of refs) {
      if (typeof r === "function") r(el);
      else if (r) (r as { current: T | null }).current = el;
    }
  };
}

export function CampoCedula({ label = "Cédula", valor, onCambio, surface = "tablet", error, hint, autoFocus, inputRef, onBlur, required, disabled }: Comunes) {
  const partes = partesDelDocumento(valor);
  // La letra elegida se queda aunque los dígitos se borren.
  const [letraSola, setLetraSola] = useState<LetraDeDocumento>("V");
  const letra = valor.trim() ? partes.letra : letraSola;
  const [tocado, setTocado] = useState(false);
  const { elemento, recordar } = useCursor();
  const propio = tocado ? problemaDelDocumento(valor) : null;

  return (
    <Input
      label={label}
      surface={surface}
      value={digitosALaVista(letra, partes.digitos)}
      onChange={(ev) => {
        recordar(ev);
        const p = partesDelDocumento(ev.target.value, letra);
        setLetraSola(p.letra);
        onCambio(documentoDe(p.letra, p.digitos));
      }}
      onBlur={() => {
        setTocado(true);
        onBlur?.();
      }}
      ref={unirRefs(elemento, inputRef)}
      onKeyDown={(ev) => alIntro(ev, valor.trim() !== "" && problemaDelDocumento(valor) === null)}
      enterKeyHint="next"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      placeholder={letra === "J" || letra === "G" || letra === "P" ? "40.123.456-7" : "12.345.678"}
      aria-required={required ? "true" : undefined}
      autoFocus={autoFocus}
      data-privado=""
      error={error ?? propio ?? undefined}
      hint={hint}
      leading={
        <select
          aria-label="Tipo de documento"
          value={letra}
          disabled={disabled}
          onChange={(ev) => {
            const l = ev.target.value as LetraDeDocumento;
            setLetraSola(l);
            onCambio(documentoDe(l, partes.digitos));
          }}
          className="-my-2 cursor-pointer bg-transparent py-2 font-semibold text-ink outline-none"
        >
          {LETRAS_DE_DOCUMENTO.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      }
    />
  );
}

export function CampoTelefono({ label = "Teléfono", valor, onCambio, surface = "tablet", error, hint, autoFocus, leading, inputRef, onBlur, required, disabled }: Comunes) {
  const digitos = digitosDelTelefono(valor);
  const [tocado, setTocado] = useState(false);
  const { elemento, recordar } = useCursor();
  const propio = tocado ? problemaDelTelefono(valor) : null;

  return (
    <Input
      label={label}
      surface={surface}
      type="tel"
      inputMode="tel"
      value={telefonoALaVista(digitos)}
      onChange={(ev) => {
        const crudos = ev.target.value.replace(/\D/g, "");
        const nuevos = digitosDelTelefono(ev.target.value);
        recordar(ev, nuevos.startsWith("0") && !crudos.startsWith("0") ? (crudos.startsWith("58") ? -1 : 1) : 0);
        onCambio(telefonoDe(nuevos));
      }}
      onBlur={() => {
        setTocado(true);
        onBlur?.();
      }}
      ref={unirRefs(elemento, inputRef)}
      onKeyDown={(ev) => alIntro(ev, valor.trim() !== "" && problemaDelTelefono(valor) === null)}
      enterKeyHint="next"
      autoComplete="off"
      disabled={disabled}
      placeholder="0414-123.45.67"
      aria-required={required ? "true" : undefined}
      autoFocus={autoFocus}
      data-privado=""
      error={error ?? propio ?? undefined}
      hint={hint}
      leading={leading}
    />
  );
}
