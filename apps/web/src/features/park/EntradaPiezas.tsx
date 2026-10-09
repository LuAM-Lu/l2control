"use client";

import type { Ref } from "react";
import { Check, CircleCheckBig, HandHeart, Phone, TriangleAlert, X } from "lucide-react";
import type { PricePackageDto, RepresentanteEncontradoDto } from "@l2/contracts";
import { toMajor, type Money } from "@l2/domain-money";
import { Badge, Initial, Input, Marquesina, MoneyDisplay, cn, formatMoneyVE } from "@l2/ui";
import type { ProductoALaVenta } from "../inventario/catalogo.ts";
import { PackagePicker } from "./PackagePicker";
import { toMoney } from "./mappers.ts";
import { IconoMedias } from "./IconoMedias.tsx";
import { CampoCedula, CampoTelefono } from "../clientes/CamposDelCliente.tsx";
import type { Entrada, EntradaDeNinos } from "./useEntradaDeNinos.ts";

/**
 * Las piezas de la entrada al parque que usan Entrada y la entrada desde la caja (B3-9, M-31): la fila de cada niño, el
 * representante y el total. Reciben datos y emiten eventos; la lógica está en `useEntradaDeNinos`.
 */

/** Los niños conocidos de la familia, para proponer su nombre en cada fila (DEC-28). */
export function NinosDeLaFamilia({ encontrado }: { encontrado: RepresentanteEncontradoDto | null }) {
  if (!encontrado || encontrado.kids.length === 0) return null;
  return (
    <datalist id="ninos-de-la-familia">
      {encontrado.kids.map((k) => (
        <option key={k.id} value={k.name} />
      ))}
    </datalist>
  );
}

/**
 * Un niño de la entrada: su pulsera (o «Sin pulsera»), su nombre, su paquete y sus medias.
 *
 * B4-12 (M-34): donde la fila es ancha (la capa de la entrada en escritorio) va en **un renglón**: pulsera, nombre,
 * paquete en una lista y medias. Donde es angosta (el teléfono), como antes: el paquete en botones grandes y las medias y
 * el nombre debajo. Se mide la fila, no la pantalla. Las medias (B4-16, M-35): un interruptor, apagado de entrada.
 */
export function FilaDeEntrada({
  e,
  numero,
  paquetes,
  medias,
  mediasAgotadas = false,
  encontrado,
  invitadoDe = null,
  onActualizar,
  onQuitar,
}: {
  e: Entrada;
  numero: number;
  paquetes: readonly PricePackageDto[];
  medias: ProductoALaVenta | null;
  /** No queda otro par que dar (B4-16): un interruptor apagado ya no se enciende, y el niño entra sin cobrárselas. */
  mediasAgotadas?: boolean;
  encontrado: RepresentanteEncontradoDto | null;
  /** El cumpleañero, si es un invitado de su cumpleaños (B10-2): sin paquete, medias ni nombre. */
  invitadoDe?: string | null;
  onActualizar: (patch: Partial<Entrada>) => void;
  onQuitar: () => void;
}) {
  const quien = e.sinPulsera ? e.nombre || "este niño" : e.wristbandCode;
  const sinPar = mediasAgotadas && !e.compraMedias;
  return (
    <li className="@container/fila rounded-[var(--radius-card)] border border-line bg-surface p-4 @3xl/fila:px-3 @3xl/fila:py-2.5">
      <div className="flex flex-wrap items-center gap-3 @3xl/fila:flex-nowrap @3xl/fila:gap-2.5">
        <Initial name={String(numero)} tone="brand" className="order-1" />

        {e.sinPulsera ? (
          <Badge tone="brand" icon={<HandHeart size={14} aria-hidden="true" />} className="order-2 shrink-0 px-3 py-1.5 text-[14px]">
            Sin pulsera
          </Badge>
        ) : (
          <Badge tone="idle" className="order-2 shrink-0 px-3 py-1.5 text-[15px]">
            <span className="tnum font-mono">{e.wristbandCode}</span>
          </Badge>
        )}

        <button
          type="button"
          onClick={onQuitar}
          aria-label={e.sinPulsera ? `Quitar al niño sin pulsera ${e.nombre}` : `Quitar la pulsera ${e.wristbandCode}`}
          className="order-3 ml-auto grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit @3xl/fila:order-7 @3xl/fila:ml-0"
        >
          <X size={16} aria-hidden="true" />
        </button>

        {/* Un invitado de cumpleaños no elige paquete: lo cubre el del evento (B10-2). */}
        {invitadoDe ? (
          <span className="order-4 min-w-0 flex-1 basis-full text-[13px] text-ink-2 @3xl/fila:basis-auto">Invitado · Cumpleaños de {invitadoDe}</span>
        ) : (
          <>
            {/* Angosta: los paquetes en botones; ancha: en una lista, para que quepa en el renglón. */}
            <div className="order-4 basis-full @3xl/fila:hidden">
              <PackagePicker packages={paquetes} selectedId={e.packageId} onSelect={(id) => onActualizar({ packageId: id })} compact />
            </div>
            <select
              aria-label={`Paquete de ${quien}`}
              value={e.packageId}
              onChange={(ev) => onActualizar({ packageId: ev.target.value })}
              className="order-5 hidden min-h-12 w-48 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-line bg-base px-2.5 text-[14px] font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand @3xl/fila:block"
            >
              {paquetes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatMoneyVE(toMajor(toMoney(p.price)), "USD")}
                </option>
              ))}
            </select>
          </>
        )}

        {/* B4-16 (M-35): «Compra medias», un interruptor apagado de entrada; encendido, el par va a su cuenta. Sin medias
            que dar, lo dice y queda apagado: el niño entra sin cobrárselas. */}
        {medias && !invitadoDe && (
          <button
            type="button"
            role="switch"
            aria-checked={e.compraMedias}
            aria-label={`${quien}: compra medias, ${formatMoneyVE(toMajor(medias.precio), "USD")}`}
            disabled={sinPar}
            onClick={() => onActualizar({ compraMedias: !e.compraMedias })}
            className={cn(
              "order-6 flex min-h-12 shrink-0 basis-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 text-[13.5px] font-semibold whitespace-nowrap @3xl/fila:w-60 @3xl/fila:basis-auto",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed",
              e.compraMedias ? "border-brand bg-brand/15 text-ink" : "border-line bg-base/40 text-ink-2 hover:border-line-strong",
              sinPar && "text-ink-3 hover:border-line",
            )}
          >
            <IconoMedias size={15} className={e.compraMedias ? "text-brand" : "text-ink-3"} />
            {sinPar ? "Sin medias en existencia" : `Compra medias · ${formatMoneyVE(toMajor(medias.precio), "USD")}`}
            {!sinPar && (
              <span aria-hidden="true" className={cn("relative ml-auto h-4 w-7 shrink-0 rounded-full transition-colors", e.compraMedias ? "bg-brand" : "bg-line-strong")}>
                <span className={cn("absolute top-0.5 size-3 rounded-full bg-surface transition-[left]", e.compraMedias ? "left-3.5" : "left-0.5")} />
              </span>
            )}
          </button>
        )}

        {/* DEC-28: el nombre es opcional. Si la familia ya vino, sus niños se proponen. Los invitados de un cumpleaños no
            son de la familia que reservó: se nombran después, desde la sala. */}
        {!invitadoDe && (
          <input
            id={`nombre-${e.uid}`}
            aria-label={e.sinPulsera ? "Nombre del niño sin pulsera (obligatorio)" : `Nombre del niño de la pulsera ${e.wristbandCode} (opcional)`}
            aria-required={e.sinPulsera}
            value={e.nombre}
            onChange={(ev) => onActualizar({ nombre: ev.target.value })}
            placeholder={
              e.sinPulsera
                ? "Nombre (obligatorio: se le reconoce por él)"
                : encontrado && encontrado.kids.length > 0
                  ? `Nombre: ${encontrado.kids.map((k) => k.nickname ?? k.name).join(", ")}`
                  : "Nombre (opcional)"
            }
            list={encontrado && encontrado.kids.length > 0 ? "ninos-de-la-familia" : undefined}
            autoComplete="off"
            maxLength={60}
            className="order-7 min-h-12 w-full basis-full rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand @3xl/fila:order-3 @3xl/fila:w-auto @3xl/fila:min-w-0 @3xl/fila:flex-1 @3xl/fila:basis-0"
          />
        )}
      </div>
    </li>
  );
}

/**
 * El representante: su teléfono (lo privado lleva `data-privado`: la captura de un reporte de problema no lo lleva,
 * T-11) y, si ya vino, su nombre; si no, se pide.
 */
export function CampoRepresentante({
  entrada: e,
  cedulaRef,
}: {
  /** El estado de la entrada (`useEntradaDeNinos`): la cédula, el teléfono, la familia encontrada y el nombre nuevo. */
  entrada: Pick<
    EntradaDeNinos,
    | "cedula"
    | "setCedula"
    | "telefono"
    | "setTelefono"
    | "encontrado"
    | "porSuCedula"
    | "faltaSuCedula"
    | "telefonoDeOtro"
    | "familiaEnSala"
    | "sumar"
    | "setSumar"
    | "esNuevo"
    | "nombreNuevo"
    | "setNombreNuevo"
  >;
  /** Tras la primera pulsera, el foco va a la cédula. */
  cedulaRef?: Ref<HTMLInputElement>;
}) {
  const { encontrado } = e;
  // Encontrada por su cédula, el teléfono ya lo tiene el directorio: no se pide.
  const pedirTelefono = !e.porSuCedula || e.telefono.trim() !== "";
  return (
    <>
      {/* T-19: la cédula, lo primero. Con ella se reconoce a la familia que vuelve. */}
      <CampoCedula
        label="Cédula del representante"
        valor={e.cedula}
        onCambio={e.setCedula}
        inputRef={cedulaRef}
        surface="pos"
        required
        hint={e.cedula ? undefined : "Lo primero: si ya vino, aparece sola"}
      />

      {pedirTelefono && (
        <CampoTelefono
          valor={e.telefono}
          onCambio={e.setTelefono}
          surface="pos"
          leading={<Phone size={16} aria-hidden="true" />}
          required={!encontrado}
          hint={encontrado ? "Ya lo tenemos" : undefined}
        />
      )}

      {e.telefonoDeOtro && (
        <p role="alert" className="flex items-start gap-1.5 rounded-[var(--radius-control)] bg-state-warn-bg px-3 py-2 text-detalle text-state-warn">
          <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
          <span data-privado="">
            Ese teléfono es de {e.telefonoDeOtro.fullName}, con otra cédula. Revisa la cédula, o usa otro teléfono.
          </span>
        </p>
      )}

      {encontrado && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5",
            e.faltaSuCedula ? "border-state-warn/40 bg-state-warn-bg" : "border-state-ok/40 bg-state-ok-bg",
          )}
        >
          {e.faltaSuCedula ? (
            <TriangleAlert size={16} className="shrink-0 text-state-warn" aria-hidden="true" />
          ) : (
            <CircleCheckBig size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink" data-privado="">
              <Marquesina>{encontrado.fullName}</Marquesina>
            </p>
            <p className="text-[12px] text-ink-2">
              {e.faltaSuCedula ? "Ya vino · escribe su cédula y queda anotada" : "Ya registrado · no hay que teclear nada más"}
            </p>
          </div>
        </div>
      )}

      {/* B4-12: su familia tiene niños en la sala: el que llega se suma a esa cuenta, con su propio tiempo. */}
      {e.familiaEnSala && (
        <button
          type="button"
          role="switch"
          aria-checked={e.sumar}
          onClick={() => e.setSumar(!e.sumar)}
          className={cn(
            "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
            e.sumar ? "border-brand bg-brand/10" : "border-line bg-base/40 hover:border-line-strong",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("grid size-5 shrink-0 place-content-center rounded border", e.sumar ? "border-brand bg-brand text-on-brand" : "border-line-strong")}
          >
            {e.sumar && <Check size={13} strokeWidth={3} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink" data-privado="">
              Sumar a la familia {e.familiaEnSala.familia} ({e.familiaEnSala.ninos} en sala)
            </span>
            <span className="block text-[12px] text-ink-2">
              {e.sumar
                ? `Entra en su cuenta, con su tiempo desde ahora, y sale con ella. ${e.familiaEnSala.mode === "PREPAGO" ? "Lo suyo va a la caja." : "Se cobra todo al salir."}`
                : "Entra con una cuenta aparte."}
            </span>
          </span>
        </button>
      )}

      {e.esNuevo && (
        <Input
          label="Nombre del representante"
          value={e.nombreNuevo}
          onChange={(ev) => e.setNombreNuevo(ev.target.value)}
          placeholder="Nombre y apellido"
          autoComplete="off"
          data-privado=""
          hint="No lo tenemos registrado todavía"
        />
      )}
    </>
  );
}

/** Lo que cuestan los paquetes (y las medias) de esta entrada, y si quedan medias que dar. */
export function TotalDeEntrada({
  total,
  ninos,
  medias,
  paresQueFaltan,
  sinMedias,
}: {
  total: Money;
  ninos: number;
  medias: ProductoALaVenta | null;
  paresQueFaltan: number;
  /** No queda ningún par (B4-16): los niños entran sin cobrárselas. */
  sinMedias: boolean;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Paquetes</span>
        <MoneyDisplay value={toMajor(total)} currency={total.currency} size="lg" />
      </div>
      {sinMedias && medias && (
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-state-warn">
          <TriangleAlert size={14} aria-hidden="true" />
          No quedan medias en el inventario: entran sin cobrárselas
        </p>
      )}
      {medias && !sinMedias && (paresQueFaltan > 0 || medias.existencia !== null) && (
        <p className="mt-1 text-[12px] text-ink-3">
          {paresQueFaltan > 0 ? `Incluye ${paresQueFaltan === 1 ? "un par de medias" : `${paresQueFaltan} pares de medias`}` : "Medias de seguridad"}
          {/* B4-12: cuántos pares quedan, al lado. */}
          {medias.existencia !== null && ` · quedan ${medias.existencia} ${medias.existencia === 1 ? "par" : "pares"}`}
        </p>
      )}
      <p className="mt-1 text-[12px] text-ink-3">{ninos === 0 ? "Sin niños en la entrada" : `${ninos} ${ninos === 1 ? "niño" : "niños"}`}</p>
    </div>
  );
}
