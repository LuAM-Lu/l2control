"use client";

import { useId, useState } from "react";
import {
  DatosDePagoSchema,
  type DatosDePagoDto,
  type PosTerminalDto,
  type RedUsdt,
  type TipoDeDatosDePago,
} from "@l2/contracts";
import { Button, Dialog, Input, cn } from "@l2/ui";
import { BANCOS_VE, nombreBanco } from "./bancos.ts";

/**
 * Los datos de un pago que no es efectivo — F4-04.
 *
 * Se piden AL AÑADIR el pago, no al cerrar el cobro: si la referencia falta,
 * el pago no entra (fail-closed). Hecho para ir rápido con cola delante:
 *  · el foco cae en la referencia y Enter confirma;
 *  · banco, terminal y red recuerdan el último que se usó;
 *  · con un solo terminal no se pregunta cuál;
 *  · lo del pagador (teléfono, cédula) es opcional y va al final.
 *
 * ⚠ §7.6: estos datos no se escriben en ningún log y en la lista de pagos se
 * enseñan enmascarados.
 */

export type Recordados = Readonly<{ bankCode?: string; terminalId?: string; network?: RedUsdt }>;

/** Qué se abre: los datos de un medio, o solo el monto de un pago sin datos (efectivo). */
export type TipoDialogo = TipoDeDatosDePago | "SIN_DATOS";

/** Corregir un pago que ya está en el cobro: monto y datos, prellenados. */
export type Edicion = Readonly<{ monto: string; moneda: string; datos?: DatosDePagoDto }>;

const TITULO: Readonly<Record<TipoDialogo, string>> = {
  PAGO_MOVIL: "Datos del Pago Móvil",
  ZELLE: "Datos del Zelle",
  USDT: "Datos del pago en USDT",
  PUNTO: "Datos del punto de venta",
  SIN_DATOS: "Monto del pago",
};

/** Un monto tecleado por una persona: «1.000,50», «1000.5», «20». Devuelve «1000.50» o null. */
export function normalizarMonto(texto: string): string | null {
  const limpio = texto.trim().replace(/\s/g, "");
  // Coma decimal venezolana, con o sin punto de miles.
  const conPunto = /,\d{1,2}$/.test(limpio) ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(conPunto)) return null;
  const [entero = "0", dec = ""] = conPunto.split(".");
  const normal = `${String(BigInt(entero))}.${dec.padEnd(2, "0")}`;
  return /^0\.00$/.test(normal) ? null : normal;
}

const REDES: readonly { id: RedUsdt; nombre: string }[] = [
  { id: "TRC20", nombre: "TRC20" },
  { id: "BEP20", nombre: "BEP20" },
  { id: "ERC20", nombre: "ERC20" },
  { id: "BINANCE_PAY", nombre: "Binance Pay" },
];

/** Clave para detectar una referencia repetida dentro del mismo cobro. */
export function claveDeReferencia(d: DatosDePagoDto): string {
  switch (d.kind) {
    case "PAGO_MOVIL":
      return `PM:${d.bankCode}:${d.reference}`;
    case "PUNTO":
      return `PDV:${d.terminalId}:${d.reference}`;
    case "USDT":
      return `USDT:${d.txId.toLowerCase()}`;
    case "ZELLE":
      return d.confirmation ? `ZELLE:${d.confirmation}` : `ZELLE:${d.holder}:${globalThis.crypto.randomUUID()}`;
  }
}

const cola = (texto: string, n = 4) => `···${texto.slice(-n)}`;

/** Resumen enmascarado para la lista de pagos (§7.6). */
export function resumenDatos(d: DatosDePagoDto, terminales: readonly PosTerminalDto[]): string {
  switch (d.kind) {
    case "PAGO_MOVIL":
      return `${nombreBanco(d.bankCode)} · Ref. ${cola(d.reference)}`;
    case "ZELLE":
      return `Titular ${d.holder.slice(0, 3)}···${d.confirmation ? ` · Conf. ${cola(d.confirmation)}` : ""}`;
    case "USDT":
      return `${d.network === "BINANCE_PAY" ? "Binance Pay" : d.network} · TxID ${cola(d.txId, 6)}`;
    case "PUNTO":
      return `${terminales.find((t) => t.id === d.terminalId)?.name ?? "Punto"} · Ref. ${cola(d.reference)}`;
  }
}

export function DatosPagoDialog({
  tipo,
  monto,
  terminales,
  recordados,
  referenciasUsadas,
  onConfirmar,
  onCancelar,
  edicion = null,
  clave,
}: {
  /** `null` = cerrado. */
  tipo: TipoDialogo | null;
  /** El monto ya formateado, para leerlo mientras se copian los datos. */
  monto: string;
  terminales: readonly PosTerminalDto[];
  recordados: Recordados;
  referenciasUsadas: readonly string[];
  /** Los datos del medio (`null` si no pide ninguno) y, al corregir, el monto nuevo. */
  onConfirmar: (datos: DatosDePagoDto | null, monto: string | null) => void;
  onCancelar: () => void;
  /** Si se corrige un pago existente: su monto y sus datos. */
  edicion?: Edicion | null;
  /** Identifica lo que se abre (el pago que se corrige): al cambiar, el formulario se rehace. */
  clave?: string;
}) {
  const formId = useId();
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);
  const aperturaActual = tipo === null ? null : `${tipo}|${clave ?? ""}`;

  // Cada vez que se abre, el formulario empieza limpio: con lo recordado si es
  // un pago nuevo, o con los datos del pago si se corrige. Se deriva durante el
  // render, sin un efecto que pinte primero el formulario viejo.
  if (aperturaActual !== abiertoPara) {
    setAbiertoPara(aperturaActual);
    setErrores({});
    const d = edicion?.datos;
    setCampos({
      bankCode: recordados.bankCode ?? "",
      network: recordados.network ?? "TRC20",
      terminalId: recordados.terminalId ?? (terminales.length === 1 ? terminales[0]!.id : ""),
      ...(edicion ? { monto: edicion.monto } : {}),
      ...(d?.kind === "PAGO_MOVIL"
        ? { reference: d.reference, bankCode: d.bankCode, payerPhone: d.payerPhone ?? "", payerDocument: d.payerDocument ?? "" }
        : d?.kind === "ZELLE"
          ? { holder: d.holder, confirmation: d.confirmation ?? "" }
          : d?.kind === "USDT"
            ? { txId: d.txId, network: d.network, holder: d.holder ?? "" }
            : d?.kind === "PUNTO"
              ? { terminalId: d.terminalId, reference: d.reference, lot: d.lot ?? "" }
              : {}),
    });
  }

  const poner = (k: string, v: string) => {
    setCampos((c) => ({ ...c, [k]: v }));
    setErrores((e) => {
      if (!e[k]) return e;
      const { [k]: _, ...resto } = e;
      return resto;
    });
  };
  const opcional = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : undefined);

  function confirmar() {
    if (!tipo) return;
    let montoNuevo: string | null = null;
    if (edicion) {
      montoNuevo = normalizarMonto(campos.monto ?? "");
      if (!montoNuevo) {
        setErrores({ monto: "Escribe un monto mayor que cero, por ejemplo 1.000,50" });
        return;
      }
    }
    if (tipo === "SIN_DATOS") {
      onConfirmar(null, montoNuevo);
      return;
    }
    const borrador =
      tipo === "PAGO_MOVIL"
        ? {
            kind: tipo,
            reference: campos.reference ?? "",
            bankCode: campos.bankCode ?? "",
            payerPhone: opcional(campos.payerPhone),
            payerDocument: opcional(campos.payerDocument)?.toUpperCase(),
          }
        : tipo === "ZELLE"
          ? { kind: tipo, holder: campos.holder ?? "", confirmation: opcional(campos.confirmation) }
          : tipo === "USDT"
            ? { kind: tipo, txId: campos.txId ?? "", network: campos.network, holder: opcional(campos.holder) }
            : { kind: tipo, terminalId: campos.terminalId ?? "", reference: campos.reference ?? "", lot: opcional(campos.lot) };

    const r = DatosDePagoSchema.safeParse(borrador);
    if (!r.success) {
      const porCampo: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const k = String(issue.path[0] ?? "reference");
        porCampo[k] ??= issue.message.startsWith("Invalid") ? "Falta este dato" : issue.message;
      }
      setErrores(porCampo);
      return;
    }
    // Fail-closed: una referencia que ya entró en este cobro no entra dos veces.
    if (referenciasUsadas.includes(claveDeReferencia(r.data))) {
      setErrores({ [r.data.kind === "USDT" ? "txId" : "reference"]: "Esta referencia ya está en este cobro" });
      return;
    }
    onConfirmar(r.data, montoNuevo);
  }

  const grupoBotones = (
    nombre: string,
    campo: string,
    opciones: readonly { id: string; nombre: string; detalle?: string }[],
  ) => (
    <fieldset>
      <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">{nombre}</legend>
      <div role="radiogroup" aria-label={nombre} className="grid grid-cols-2 gap-1.5">
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={campos[campo] === o.id}
            onClick={() => poner(campo, o.id)}
            className={cn(
              "flex min-h-14 cursor-pointer flex-col items-start justify-center rounded-[var(--radius-control)] border px-3 text-left",
              "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
              campos[campo] === o.id ? "border-brand bg-brand/12 text-ink" : "border-line bg-base text-ink-2 hover:border-line-strong",
            )}
          >
            <span className="text-[14px] font-semibold">{o.nombre}</span>
            {o.detalle && <span className="text-[11.5px] text-ink-3">{o.detalle}</span>}
          </button>
        ))}
      </div>
      {errores[campo] && <p className="mt-1 text-[12.5px] text-state-crit">{errores[campo]}</p>}
    </fieldset>
  );

  return (
    <Dialog
      abierto={tipo !== null}
      onCerrar={onCancelar}
      titulo={tipo ? (edicion ? `Corregir el pago · ${monto}` : TITULO[tipo]) : ""}
      descripcion={edicion ? "Cambia lo que se tecleó mal; el pago sigue en el cobro." : `${monto} · el pago entra al cobro cuando confirmes los datos`}
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" type="submit" form={formId}>
            {edicion ? "Guardar cambios" : "Añadir pago"}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
        className="flex flex-col gap-3"
      >
        {edicion && (
          <Input
            label={`Monto recibido (${edicion.moneda})`}
            surface="pos"
            inputMode="decimal"
            autoComplete="off"
            autoFocus={tipo === "SIN_DATOS"}
            value={campos.monto ?? ""}
            onChange={(e) => poner("monto", e.target.value)}
            error={errores.monto}
          />
        )}
        {tipo === "PUNTO" &&
          (terminales.length > 1 ? (
            grupoBotones(
              "Terminal",
              "terminalId",
              terminales.map((t) => ({ id: t.id, nombre: t.name, detalle: t.bank })),
            )
          ) : (
            <p className="text-[13px] text-ink-2">
              Terminal: <strong className="text-ink">{terminales[0]?.name ?? "sin configurar"}</strong>
            </p>
          ))}

        {(tipo === "PAGO_MOVIL" || tipo === "PUNTO") && (
          <Input
            label={tipo === "PUNTO" ? "Número de aprobación o referencia" : "Número de referencia"}
            surface="pos"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={campos.reference ?? ""}
            onChange={(e) => poner("reference", e.target.value.replace(/\D/g, ""))}
            error={errores.reference}
            hint={tipo === "PUNTO" ? "El que imprime el terminal" : "La que muestra el teléfono del cliente"}
          />
        )}

        {tipo === "PAGO_MOVIL" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold tracking-[0.07em] text-ink-2 uppercase">Banco de origen</span>
            <select
              value={campos.bankCode ?? ""}
              onChange={(e) => poner("bankCode", e.target.value)}
              className={cn(
                "min-h-14 cursor-pointer rounded-[var(--radius-control)] border bg-base px-3 text-[15px] text-ink",
                errores.bankCode ? "border-state-crit" : "border-line",
              )}
            >
              <option value="">Elige el banco…</option>
              {BANCOS_VE.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
            {errores.bankCode && <span className="text-[12.5px] text-state-crit">{errores.bankCode}</span>}
          </label>
        )}

        {tipo === "USDT" && grupoBotones("Red", "network", REDES)}
        {tipo === "USDT" && (
          <Input
            label="TxID de la transacción"
            surface="pos"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            value={campos.txId ?? ""}
            onChange={(e) => poner("txId", e.target.value.trim())}
            error={errores.txId}
            hint="Pégalo desde la billetera"
          />
        )}

        {tipo === "ZELLE" && (
          <Input
            label="Correo o nombre del titular"
            surface="pos"
            autoComplete="off"
            autoFocus
            value={campos.holder ?? ""}
            onChange={(e) => poner("holder", e.target.value)}
            error={errores.holder}
          />
        )}
        {tipo === "ZELLE" && (
          <Input
            label="Código de confirmación (opcional)"
            surface="tablet"
            autoComplete="off"
            value={campos.confirmation ?? ""}
            onChange={(e) => poner("confirmation", e.target.value)}
            error={errores.confirmation}
          />
        )}

        {tipo === "PUNTO" && (
          <Input
            label="Lote (opcional)"
            surface="tablet"
            inputMode="numeric"
            autoComplete="off"
            value={campos.lot ?? ""}
            onChange={(e) => poner("lot", e.target.value.replace(/\D/g, ""))}
            error={errores.lot}
          />
        )}

        {tipo === "PAGO_MOVIL" && (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
              Quien paga (opcional)
            </legend>
            <Input
              label="Teléfono"
              surface="tablet"
              inputMode="tel"
              autoComplete="off"
              placeholder="0414-1234567"
              value={campos.payerPhone ?? ""}
              onChange={(e) => poner("payerPhone", e.target.value)}
              error={errores.payerPhone}
            />
            <Input
              label="Cédula"
              surface="tablet"
              autoComplete="off"
              placeholder="V-12345678"
              value={campos.payerDocument ?? ""}
              onChange={(e) => poner("payerDocument", e.target.value)}
              error={errores.payerDocument}
            />
          </fieldset>
        )}

        {tipo === "USDT" && (
          <Input
            label="Titular o usuario (opcional)"
            surface="tablet"
            autoComplete="off"
            value={campos.holder ?? ""}
            onChange={(e) => poner("holder", e.target.value)}
            error={errores.holder}
          />
        )}
      </form>
    </Dialog>
  );
}
