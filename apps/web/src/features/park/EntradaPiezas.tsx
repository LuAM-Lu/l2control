"use client";

import type { Ref } from "react";
import { CircleCheckBig, Footprints, HandHeart, Phone, TriangleAlert, X } from "lucide-react";
import type { PricePackageDto, RepresentanteEncontradoDto } from "@l2/contracts";
import { toMajor, type Money } from "@l2/domain-money";
import { Badge, Initial, Input, MoneyDisplay, cn, formatMoneyVE } from "@l2/ui";
import type { ProductoALaVenta } from "../inventario/catalogo.ts";
import { PackagePicker } from "./PackagePicker";
import type { Entrada } from "./useEntradaDeNinos.ts";

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

/** Un niño de la entrada: su pulsera (o «Sin pulsera»), su paquete, sus medias y su nombre. */
export function FilaDeEntrada({
  e,
  numero,
  paquetes,
  medias,
  encontrado,
  invitadoDe = null,
  onActualizar,
  onQuitar,
}: {
  e: Entrada;
  numero: number;
  paquetes: readonly PricePackageDto[];
  medias: ProductoALaVenta | null;
  encontrado: RepresentanteEncontradoDto | null;
  /** El cumpleañero, si es un invitado de su cumpleaños (B10-2): sin paquete, medias ni nombre. */
  invitadoDe?: string | null;
  onActualizar: (patch: Partial<Entrada>) => void;
  onQuitar: () => void;
}) {
  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Initial name={String(numero)} tone="brand" />

        {e.sinPulsera ? (
          <Badge tone="brand" icon={<HandHeart size={14} aria-hidden="true" />} className="text-[14px] px-3 py-1.5">
            Sin pulsera
          </Badge>
        ) : (
          <Badge tone="idle" className="text-[15px] px-3 py-1.5">
            <span className="tnum font-mono">{e.wristbandCode}</span>
          </Badge>
        )}

        {/* En el teléfono el paquete va en su renglón, en 2×2: en la fila, cuatro no caben. Un
            invitado de cumpleaños no elige paquete: lo cubre el del evento (B10-2). */}
        {invitadoDe ? (
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">Invitado · Cumpleaños de {invitadoDe}</span>
        ) : (
          <div className="min-w-[200px] flex-1 max-md:order-last max-md:basis-full">
            <PackagePicker packages={paquetes} selectedId={e.packageId} onSelect={(id) => onActualizar({ packageId: id })} compact />
          </div>
        )}

        <button
          type="button"
          onClick={onQuitar}
          aria-label={e.sinPulsera ? `Quitar al niño sin pulsera ${e.nombre}` : `Quitar la pulsera ${e.wristbandCode}`}
          className="grid size-12 shrink-0 cursor-pointer place-content-center rounded-[var(--radius-control)] text-ink-3 transition-colors hover:bg-state-crit-bg hover:text-state-crit max-md:ml-auto"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {/* B4-9: si no trae medias, se le cobra el par. «Trae» de fábrica: es lo que pide el local. */}
      {medias && !invitadoDe && (
        <div role="radiogroup" aria-label={`Medias de ${e.sinPulsera ? e.nombre || "este niño" : e.wristbandCode}`} className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <Footprints size={15} aria-hidden="true" className="text-ink-3" />
            Medias
          </span>
          {([true, false] as const).map((trae) => (
            <button
              key={String(trae)}
              type="button"
              role="radio"
              aria-checked={e.traeMedias === trae}
              onClick={() => onActualizar({ traeMedias: trae })}
              className={cn(
                "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-3 text-[13.5px] font-semibold",
                e.traeMedias === trae ? "border-brand bg-brand/15 text-ink" : "border-line bg-base/40 text-ink-2 hover:border-line-strong",
              )}
            >
              {trae ? "Las trae" : `No trae · ${formatMoneyVE(toMajor(medias.precio), "USD")}`}
            </button>
          ))}
        </div>
      )}
      {/* DEC-28: el nombre es opcional. Si la familia ya vino, sus niños se proponen. Los invitados
          de un cumpleaños no son de la familia que reservó: se nombran después, desde la sala. */}
      {!invitadoDe && (
        <input
          id={`nombre-${e.uid}`}
          aria-label={e.sinPulsera ? "Nombre del niño sin pulsera (obligatorio)" : `Nombre del niño de la pulsera ${e.wristbandCode} (opcional)`}
          aria-required={e.sinPulsera}
          value={e.nombre}
          onChange={(ev) => onActualizar({ nombre: ev.target.value })}
          placeholder={
            e.sinPulsera
              ? "Nombre del niño (obligatorio: sin pulsera se le reconoce por él)"
              : encontrado && encontrado.kids.length > 0
                ? `Nombre (opcional): ${encontrado.kids.map((k) => k.nickname ?? k.name).join(", ")}`
                : "Nombre del niño (opcional)"
          }
          list={encontrado && encontrado.kids.length > 0 ? "ninos-de-la-familia" : undefined}
          autoComplete="off"
          maxLength={60}
          className="mt-3 min-h-12 w-full rounded-[var(--radius-control)] border border-line bg-base px-3 text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-brand"
        />
      )}
    </li>
  );
}

/**
 * El representante: su teléfono (lo privado lleva `data-privado`: la captura de un reporte de problema no lo lleva,
 * T-11) y, si ya vino, su nombre; si no, se pide.
 */
export function CampoRepresentante({
  telefono,
  onTelefono,
  telefonoRef,
  encontrado,
  esNuevo,
  nombreNuevo,
  onNombreNuevo,
}: {
  telefono: string;
  onTelefono: (v: string) => void;
  telefonoRef?: Ref<HTMLInputElement>;
  encontrado: RepresentanteEncontradoDto | null;
  esNuevo: boolean;
  nombreNuevo: string;
  onNombreNuevo: (v: string) => void;
}) {
  return (
    <>
      <Input
        label="Teléfono"
        value={telefono}
        onChange={(ev) => onTelefono(ev.target.value)}
        placeholder="0412-1234567"
        inputMode="tel"
        autoComplete="off"
        {...(telefonoRef ? { ref: telefonoRef } : {})}
        data-privado=""
        leading={<Phone size={16} aria-hidden="true" />}
        hint="A quién llamamos si pasa algo. Si ya vino, aparece solo"
      />

      {encontrado && (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-state-ok/40 bg-state-ok-bg px-3 py-2.5">
          <CircleCheckBig size={16} className="shrink-0 text-state-ok" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink" data-privado="">
              {encontrado.fullName}
            </p>
            <p className="text-[12px] text-ink-2">Ya registrado · no hay que teclear nada</p>
          </div>
        </div>
      )}

      {esNuevo && (
        <Input
          label="Nombre del representante"
          value={nombreNuevo}
          onChange={(ev) => onNombreNuevo(ev.target.value)}
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
  sinMediasQueDar,
}: {
  total: Money;
  ninos: number;
  medias: ProductoALaVenta | null;
  paresQueFaltan: number;
  sinMediasQueDar: boolean;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Paquetes</span>
        <MoneyDisplay value={toMajor(total)} currency={total.currency} size="lg" />
      </div>
      {sinMediasQueDar && medias && (
        <p role="alert" className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-state-crit">
          <TriangleAlert size={14} aria-hidden="true" />
          {medias.existencia === 0 ? "No quedan medias en el inventario" : `Quedan ${medias.existencia} pares de medias y hacen falta ${paresQueFaltan}`}
        </p>
      )}
      {paresQueFaltan > 0 && medias && !sinMediasQueDar && (
        <p className="mt-1 text-[12px] text-ink-3">Incluye {paresQueFaltan === 1 ? "un par de medias" : `${paresQueFaltan} pares de medias`}</p>
      )}
      <p className="mt-1 text-[12px] text-ink-3">{ninos === 0 ? "Sin niños en la entrada" : `${ninos} ${ninos === 1 ? "niño" : "niños"}`}</p>
    </div>
  );
}
