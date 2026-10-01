"use client";

import { useMemo, useState } from "react";
import { BadgePercent, Crown, Hand, ShieldCheck, Smartphone } from "lucide-react";
import type { DescuentosDeCuentaDto, MotivoDescuento, Rechazo, RequiereDescuento, ValorDescuentoDto } from "@l2/contracts";
import { money, toMajor } from "@l2/domain-money";
import { basisPointsFromPercent, percentFromBasisPoints } from "@l2/domain-tax";
import { can } from "@l2/domain-identity";
import { Button, Dialog, Input, formatMoneyVE, cn } from "@l2/ui";
import { useActorEnSesion } from "../identity/sesion.ts";
import { autorizadoresDeCaja } from "../cuentas/cuentas.acciones";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { importeTecleado } from "./importe.ts";
import { MOTIVOS_DESCUENTO, textoAlcance, textoValor } from "./descuentos.ts";

/** Lo que se pide al servidor: una regla (con su motivo si es manual) o el de administración. */
export type PedidoDeDescuento =
  | Readonly<{ origen: "MEDIO" | "VIP" | "MANUAL"; reglaId: string; motivo?: MotivoDescuento; detalle?: string }>
  | Readonly<{ origen: "ADMIN"; valor: ValorDescuentoDto; detalle: string }>;

const ICONO = { MEDIO: Smartphone, VIP: Crown, MANUAL: Hand } as const;
const ADMIN = "admin";

/**
 * Poner un descuento a la cuenta — V-9, D-DESC, B3-6.
 *
 * Lo que aplica lo dice el servidor (`descuentosDeCuenta`), el mayor primero: la caja lo propone y
 * quien autoriza puede elegir otro. Uno por cuenta: el nuevo sustituye al que hubiera. El de medio y
 * el manual piden la 🔐 de supervisión (el manual, de administración si pasa del tope); el VIP no la
 * pide, porque lo ampara la marca de la familia; y administración puede aplicar el que quiera con su
 * PIN y un motivo escrito.
 */
export function DescuentoDialog({
  abierto,
  ofrecidos,
  onAplicar,
  onCerrar,
}: {
  abierto: boolean;
  /** Lo que el servidor ofrece a esta cuenta; `null` mientras llega. */
  ofrecidos: DescuentosDeCuentaDto | null;
  onAplicar: (p: PedidoDeDescuento, autorizacion: unknown) => Promise<Rechazo | null>;
  onCerrar: () => void;
}) {
  const actor = useActorEnSesion();
  // El de administración lo puede pedir cualquiera que aplique descuentos; lo autoriza administración.
  const esAdmin = actor !== null && can(actor, "cuenta.descuento") !== "DENEGADO";
  const candidatos = ofrecidos?.candidatos ?? [];
  const [elegido, setElegido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoDescuento | null>(null);
  const [nota, setNota] = useState("");
  const [enPorcentaje, setEnPorcentaje] = useState(true);
  const [cantidad, setCantidad] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState(false);

  // Cada vez que se abre, propone el mayor (D-DESC). Derivado en el render, sin efecto.
  if (abierto !== para) {
    setPara(abierto);
    setElegido(candidatos[0]?.regla.id ?? null);
    setMotivo(null);
    setNota("");
    setCantidad("");
    setErrores({});
  }
  const id = elegido ?? candidatos[0]?.regla.id ?? (esAdmin ? ADMIN : null);
  const candidato = candidatos.find((c) => c.regla.id === id) ?? null;
  const requiere: RequiereDescuento = id === ADMIN ? "ADMINISTRACION" : (candidato?.requiere ?? "AUTORIZACION");

  const soloAdmins = useMemo(() => () => autorizadoresDeCaja("cuenta.descuento").then((l) => l.filter((a) => a.rol === "ADMIN")), []);
  const deSupervision = useAutorizacion("cuenta.descuento", abierto && requiere === "AUTORIZACION");
  const deAdministracion = useAutorizacion("cuenta.descuento", abierto && requiere === "ADMINISTRACION", { cargar: soloAdmins });
  const a = requiere === "ADMINISTRACION" ? deAdministracion : deSupervision;

  const valorAdmin = (): ValorDescuentoDto | null => {
    if (enPorcentaje) {
      const bps = basisPointsFromPercent(cantidad);
      return bps ? { tipo: "PORCENTAJE", basisPoints: bps } : null;
    }
    const m = importeTecleado(cantidad, "USD");
    return m && m.amount > 0n ? { tipo: "MONTO", monto: { minor: String(m.amount), currency: "USD" } } : null;
  };

  async function confirmar() {
    if (enviando || !id) return;
    const nuevos: Record<string, string> = requiere === "NADA" ? {} : { ...(a.falta() ?? {}) };
    const manual = candidato?.regla.tipo === "MANUAL";
    if (manual && !motivo) nuevos.motivo = "Elige el motivo";
    if (motivo === "OTRO" && nota.trim().length < 3) nuevos.nota = "Explica el motivo";
    const valor = id === ADMIN ? valorAdmin() : null;
    if (id === ADMIN && !valor) nuevos.valor = enPorcentaje ? "Un porcentaje entre 0,01 y 100" : "Un monto mayor que cero";
    if (id === ADMIN && nota.trim().length < 5) nuevos.nota = "Escribe el motivo";
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    const pedido: PedidoDeDescuento =
      id === ADMIN
        ? { origen: "ADMIN", valor: valor!, detalle: nota.trim() }
        : {
            origen: candidato!.regla.tipo,
            reglaId: candidato!.regla.id,
            ...(manual && motivo ? { motivo } : {}),
            ...(nota.trim() ? { detalle: nota.trim() } : {}),
          };
    const razon =
      id === ADMIN
        ? `Descuento de administración · ${nota.trim()}`
        : `Descuento ${candidato!.regla.nombre}${motivo ? ` · ${MOTIVOS_DESCUENTO.find((m) => m.id === motivo)!.texto}` : ""}`;
    setEnviando(true);
    const rechazo = await onAplicar(pedido, requiere === "NADA" ? undefined : a.autorizacion(razon)).catch(
      () => ({ ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: no se aplicó nada." }) as Rechazo,
    );
    setEnviando(false);
    if (!rechazo) return;
    const e = erroresDeRechazo(rechazo.mensaje);
    if (e.pin) a.borrarPin();
    setErrores(e as Record<string, string>);
  }

  const importe = (minor: string) => formatMoneyVE(toMajor(money(BigInt(minor), "USD")), "USD");
  const tope = ofrecidos ? `${percentFromBasisPoints(ofrecidos.topeSupervision)} %` : "";

  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Descuento"
      descripcion="Uno por cuenta y antes del IVA. Se propone el mayor; quien autoriza puede elegir otro."
      pie={
        <div className="grid grid-cols-2 gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void confirmar()} disabled={enviando || !id || (requiere !== "NADA" && a.permiso === "DENEGADO")}>
            {enviando ? "Aplicando…" : "Aplicar descuento"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {ofrecidos === null ? (
          <p className="text-[13px] text-ink-3" role="status">
            Buscando los descuentos de esta cuenta…
          </p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">1 · Cuál</legend>
            {candidatos.length === 0 && !esAdmin && (
              <p className="flex items-center gap-2 text-[13px] text-ink-3">
                <BadgePercent size={15} aria-hidden="true" />
                Ningún descuento aplica a esta cuenta hoy.
              </p>
            )}
            <div role="radiogroup" aria-label="Descuento" className="flex flex-col gap-1.5">
              {candidatos.map((c, i) => {
                const Icono = ICONO[c.regla.tipo];
                return (
                  <button
                    key={c.regla.id}
                    type="button"
                    role="radio"
                    aria-checked={id === c.regla.id}
                    onClick={() => {
                      setElegido(c.regla.id);
                      setErrores({});
                    }}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 text-left transition-colors",
                      id === c.regla.id ? "border-brand bg-brand/12" : "border-line hover:border-line-strong",
                    )}
                  >
                    <Icono size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                        <span className="truncate">{c.regla.nombre}</span>
                        {i === 0 && <span className="shrink-0 text-[11px] font-semibold text-brand">El mayor</span>}
                      </span>
                      <span className="block truncate text-[11.5px] text-ink-3">
                        {textoValor(c.regla.valor)} sobre {textoAlcance(c.regla.alcance)}
                        {c.regla.tipo === "MEDIO" ? " · toda la cuenta por ese medio" : ""}
                        {c.requiere === "NADA" ? " · sin PIN" : c.requiere === "ADMINISTRACION" ? ` · pasa del ${tope}: administración` : ""}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[14px] font-bold text-ink">− {importe(c.importe.minor)}</span>
                  </button>
                );
              })}
              {esAdmin && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={id === ADMIN}
                  onClick={() => {
                    setElegido(ADMIN);
                    setErrores({});
                  }}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-dashed px-3 text-left transition-colors",
                    id === ADMIN ? "border-brand bg-brand/12" : "border-line-strong hover:border-brand/60",
                  )}
                >
                  <ShieldCheck size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-ink">Otro, de administración</span>
                    <span className="block text-[11.5px] text-ink-3">El que se quiera, con el PIN de administración y un motivo escrito</span>
                  </span>
                </button>
              )}
            </div>
          </fieldset>
        )}

        {id === ADMIN && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">2 · Cuánto y por qué</legend>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-1.5">
              <div role="radiogroup" aria-label="Porcentaje o monto" className="flex">
                {[true, false].map((pct) => (
                  <button
                    key={String(pct)}
                    type="button"
                    role="radio"
                    aria-checked={enPorcentaje === pct}
                    onClick={() => setEnPorcentaje(pct)}
                    className={cn(
                      "min-h-12 w-12 cursor-pointer border text-[15px] font-bold first:rounded-l-[var(--radius-control)] last:rounded-r-[var(--radius-control)]",
                      enPorcentaje === pct ? "border-brand bg-brand/12 text-ink" : "border-line text-ink-3 hover:text-ink",
                    )}
                  >
                    {pct ? "%" : "$"}
                  </button>
                ))}
              </div>
              <Input
                label={enPorcentaje ? "Porcentaje de toda la cuenta" : "Monto en dólares"}
                surface="tablet"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                error={errores.valor || undefined}
              />
            </div>
          </fieldset>
        )}

        {candidato?.regla.tipo === "MANUAL" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">2 · Motivo</legend>
            <div role="radiogroup" aria-label="Motivo del descuento" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {MOTIVOS_DESCUENTO.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={motivo === m.id}
                  onClick={() => {
                    setMotivo(m.id);
                    setErrores((e) => ({ ...e, motivo: "" }));
                  }}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-[var(--radius-control)] border px-2 text-center text-[13px] leading-tight transition-colors",
                    motivo === m.id ? "border-brand bg-brand/12 font-semibold text-ink" : "border-line text-ink-2 hover:text-ink",
                  )}
                >
                  {m.texto}
                </button>
              ))}
            </div>
            {errores.motivo && <p className="text-[12px] text-state-crit">{errores.motivo}</p>}
          </fieldset>
        )}

        {(id === ADMIN || motivo === "OTRO") && (
          <Input
            label={id === ADMIN ? "Motivo (obligatorio)" : "Explicación (obligatoria)"}
            surface="tablet"
            value={nota}
            maxLength={200}
            onChange={(e) => setNota(e.target.value)}
            error={errores.nota || undefined}
          />
        )}

        {id && requiere !== "NADA" && (
          <CampoAutorizacion
            a={a}
            numero={id === ADMIN || candidato?.regla.tipo === "MANUAL" ? 3 : 2}
            denegado="Tu puesto no puede aplicar descuentos."
            errores={errores}
            deshabilitado={enviando}
            onConfirmar={() => void confirmar()}
          />
        )}
        {requiere === "ADMINISTRACION" && id !== ADMIN && (
          <p className="text-[12px] text-ink-2">Pasa del tope de supervisión ({tope} de la cuenta): lo autoriza la administración.</p>
        )}

        {errores.general && (
          <p role="alert" className="rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2 text-[12px] text-state-crit">
            {errores.general}
          </p>
        )}
      </div>
    </Dialog>
  );
}
