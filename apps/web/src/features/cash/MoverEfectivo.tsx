"use client";

import { useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, Printer, TriangleAlert } from "lucide-react";
import type { MotivoDeEfectivoDto, MovimientoDeEfectivoDto, TipoDeEfectivoDto } from "@l2/contracts";
import { MOTIVOS_DEL_TIPO, NOMBRE_DEL_MOTIVO, NOMBRE_DEL_TIPO, enDolaresConSuTasa, pideAutorizacion } from "@l2/domain-cash";
import { money, toMajor, type Money } from "@l2/domain-money";
import { Button, Dialog, Input, Marquesina, MoneyDisplay, avisar, cn } from "@l2/ui";
import { CampoAutorizacion, erroresDeRechazo, useAutorizacion } from "./Autorizacion.tsx";
import { moverEfectivo, reimprimirMovimiento } from "./efectivo.acciones";
import { importeTecleado } from "./importe.ts";
import { useTasaVigente } from "./TasasProvider.tsx";
import { PersonaYPin, usePersonasDelLocal } from "../personal/ConsumoDelPersonal.tsx";
import { useSucursal } from "../sucursal/SucursalProvider.tsx";
import { formatClock } from "../park/time-format.ts";

/**
 * Mover efectivo — B3-21 (M-38, W-8).
 *
 * Lo que entra o sale de la gaveta sin ser venta, en el orden en que se piensa: qué es (entra, sale o se retira, y su
 * motivo), cuánto y en qué moneda, para qué (la nota), a quién (el adelanto, con su PIN) o quién lo recibe (el retiro),
 * y, por encima del tope de Ajustes o en un retiro, quién autoriza. El servidor lo vuelve a comprobar todo: la tasa, el
 * tope, la gaveta y los PIN. Cada uno imprime su comprobante.
 */

const TIPOS: readonly { tipo: TipoDeEfectivoDto; icono: typeof ArrowDownToLine; ayuda: string }[] = [
  { tipo: "ENTRADA", icono: ArrowDownToLine, ayuda: "Sencillo para la caja" },
  { tipo: "SALIDA", icono: ArrowUpFromLine, ayuda: "Compras, proveedor o adelanto" },
  { tipo: "RETIRO", icono: Landmark, ayuda: "A resguardo (la caja fuerte)" },
];

/** Qué se escribe en la nota, según el motivo. */
const PISTA_DE_LA_NOTA: Readonly<Record<MotivoDeEfectivoDto, string>> = {
  SENCILLO: "Billetes de $ 1 del banco",
  COMPRAS: "Hielo para la barra",
  PROVEEDOR: "Pan de la panadería",
  ADELANTO: "Adelanto de quincena",
  RESGUARDO: "A la caja fuerte",
};

/** El icono de cada tipo: lo usan el diálogo y «La gaveta» de Turno. */
export const ICONO_DEL_TIPO: Readonly<Record<TipoDeEfectivoDto, typeof ArrowDownToLine>> = { ENTRADA: ArrowDownToLine, SALIDA: ArrowUpFromLine, RETIRO: Landmark };

/** El motivo en su chip, corto para que quepan en un renglón; el nombre entero va en el papel y en los reportes. */
const CHIP_DEL_MOTIVO: Readonly<Record<MotivoDeEfectivoDto, string>> = { SENCILLO: "Sencillo", COMPRAS: "Compras", PROVEEDOR: "Proveedor", ADELANTO: "Adelanto", RESGUARDO: "Resguardo" };

const PIN_LONGITUD = 4;

export function MoverEfectivoDialog({ abierto, onCerrar, onHecho }: { abierto: boolean; onCerrar: () => void; onHecho: (m: MovimientoDeEfectivoDto) => void }) {
  const { ajustes } = useSucursal();
  const { congelada } = useTasaVigente("USD/VES");
  const [tipo, setTipo] = useState<TipoDeEfectivoDto>("SALIDA");
  const [motivo, setMotivo] = useState<MotivoDeEfectivoDto>("COMPRAS");
  const [moneda, setMoneda] = useState<"USD" | "VES">("USD");
  const [texto, setTexto] = useState("");
  const [nota, setNota] = useState("");
  const [recibe, setRecibe] = useState("");
  const [persona, setPersona] = useState<string | null>(null);
  const [pinPersona, setPinPersona] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<{ monto?: string; nota?: string; recibe?: string; persona?: string; autorizador?: string; pin?: string; general?: string }>({});
  const clave = useRef<string | null>(null);
  const abiertoAntes = useRef(false);

  // Cada vez que se abre, desde cero (y con una clave nueva: un reintento del mismo envío no lo repite).
  if (abierto !== abiertoAntes.current) {
    abiertoAntes.current = abierto;
    if (abierto) {
      setTipo("SALIDA");
      setMotivo("COMPRAS");
      setMoneda("USD");
      setTexto("");
      setNota("");
      setRecibe("");
      setPersona(null);
      setPinPersona("");
      setErrores({});
      clave.current = null;
    }
  }

  const adelanto = motivo === "ADELANTO";
  const { personas, error: errorDePersonas } = usePersonasDelLocal(abierto && adelanto);
  const monto = importeTecleado(texto, moneda);
  const enDolares: Money | null = monto && monto.amount > 0n ? enDolaresConSuTasa(monto, moneda === "VES" ? congelada : null) : null;
  const tope = money(BigInt(ajustes.topeMoverEfectivo.minor), "USD");
  const pide = tipo === "RETIRO" || (enDolares !== null && pideAutorizacion(tipo, enDolares, tope));
  const a = useAutorizacion("efectivo.sobreTope", abierto && pide);
  const sinTasa = moneda === "VES" && !congelada;

  function elegirTipo(t: TipoDeEfectivoDto) {
    setTipo(t);
    setMotivo(MOTIVOS_DEL_TIPO[t][0]!);
    setErrores({});
  }

  async function mover() {
    if (enviando) return;
    const e: typeof errores = {};
    if (!monto || monto.amount <= 0n) e.monto = monto ? "Escribe cuánto" : "Escribe un importe, como 12,50";
    else if (sinTasa) e.monto = "Sin tasa del BCV vigente no se mueven bolívares";
    if (nota.trim().length < 2) e.nota = "Escribe para qué es";
    if (tipo === "RETIRO" && recibe.trim().length < 2) e.recibe = "Escribe quién lo recibe";
    if (adelanto && !persona) e.persona = "Elige a quién";
    else if (adelanto && pinPersona.length !== PIN_LONGITUD) e.persona = "Su PIN de 4 dígitos";
    if (pide) Object.assign(e, a.falta() ?? {});
    setErrores(e);
    if (Object.keys(e).length > 0 || !monto) return;

    clave.current ??= crypto.randomUUID();
    setEnviando(true);
    const r = await moverEfectivo(
      {
        idempotencyKey: clave.current,
        tipo,
        motivo,
        monto: { minor: String(monto.amount), currency: moneda },
        nota: nota.trim(),
        ...(adelanto && persona ? { persona: { staffUserId: persona, pin: pinPersona } } : {}),
        ...(tipo === "RETIRO" ? { recibe: recibe.trim() } : {}),
      },
      pide ? a.autorizacion(nota.trim()) : undefined,
    ).catch(() => ({ ok: false as const, motivo: "NO_DISPONIBLE" as const, mensaje: "Sin conexión con el servidor: no se movió nada." }));
    setEnviando(false);
    setPinPersona("");
    if (!r.ok) {
      clave.current = null;
      a.borrarPin();
      const campo = "problemas" in r ? r.problemas?.[0]?.path?.[0] : undefined;
      if (campo === "monto") setErrores({ monto: r.mensaje });
      else if (adelanto && /persona|PIN de|equipo/i.test(r.mensaje) && !/autoriza/i.test(r.mensaje)) setErrores({ persona: r.mensaje });
      else setErrores(pide ? erroresDeRechazo(r.mensaje) : { general: r.mensaje });
      return;
    }
    const m = r.valor.movimiento;
    avisar.ok(`Anotado: ${NOMBRE_DEL_TIPO[m.tipo].toLowerCase()} #${String(m.numero).padStart(4, "0")}`, { detalle: NOMBRE_DEL_MOTIVO[m.motivo] });
    if (r.valor.comprobanteNoImpreso) avisar.error(`El comprobante no salió: ${r.valor.comprobanteNoImpreso}`);
    onHecho(m);
  }

  return (
    <Dialog
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Mover efectivo"
      descripcion="Lo que entra o sale de la gaveta sin ser venta. Queda en el turno y en el corte, y sale su comprobante."
      pie={
        <div className="flex flex-wrap justify-end gap-2">
          <Button surface="pos" variant="neutral" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button surface="pos" variant="primary" onClick={() => void mover()} disabled={enviando || (pide && a.permiso === "DENEGADO")}>
            <Printer className="size-(--icono-pos)" aria-hidden="true" />
            {enviando ? "Anotando…" : `Anotar ${NOMBRE_DEL_TIPO[tipo].toLowerCase()}`}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void mover();
        }}
      >
        <div role="radiogroup" aria-label="Qué se mueve" className="grid grid-cols-3 gap-1.5">
          {TIPOS.map(({ tipo: t, icono: Icono, ayuda }) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tipo === t}
              title={ayuda}
              onClick={() => elegirTipo(t)}
              className={cn(
                "flex min-h-14 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-control)] border px-2 text-cuerpo font-semibold transition-colors",
                tipo === t ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <Icono className="size-(--icono-texto)" aria-hidden="true" />
              {NOMBRE_DEL_TIPO[t]}
            </button>
          ))}
        </div>

        {MOTIVOS_DEL_TIPO[tipo].length > 1 && (
          <div role="radiogroup" aria-label="Motivo" className="flex flex-wrap gap-1.5">
            {MOTIVOS_DEL_TIPO[tipo].map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={motivo === m}
                title={NOMBRE_DEL_MOTIVO[m]}
                onClick={() => {
                  setMotivo(m);
                  setErrores({});
                }}
                className={cn(
                  "min-h-12 cursor-pointer rounded-full border px-3.5 text-detalle font-semibold transition-colors",
                  motivo === m ? "border-brand bg-brand/20 text-ink" : "border-line text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {CHIP_DEL_MOTIVO[m]}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
          <div role="radiogroup" aria-label="Moneda" className="flex h-14 overflow-hidden rounded-[var(--radius-control)] border border-line">
            {(["USD", "VES"] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={moneda === c}
                onClick={() => setMoneda(c)}
                className={cn("min-w-14 cursor-pointer px-3 text-cuerpo font-semibold transition-colors", moneda === c ? "bg-brand/20 text-ink" : "text-ink-2 hover:text-ink")}
              >
                {c === "USD" ? "$" : "Bs"}
              </button>
            ))}
          </div>
          <Input
            label={moneda === "USD" ? "Cuánto, en dólares" : "Cuánto, en bolívares"}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="tnum"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            error={errores.monto}
          />
        </div>
        {moneda === "VES" && (
          <p className={cn("-mt-2 flex items-center gap-1.5 text-detalle", sinTasa ? "text-state-crit" : "text-ink-3")}>
            {sinTasa ? (
              <>
                <TriangleAlert className="size-(--icono-texto)" aria-hidden="true" /> Sin tasa del BCV vigente no se mueven bolívares.
              </>
            ) : enDolares ? (
              <>
                Son <MoneyDisplay value={toMajor(enDolares)} currency="USD" size="sm" /> a la tasa de hoy.
              </>
            ) : (
              "Se mide en dólares a la tasa de hoy."
            )}
          </p>
        )}

        <div className={cn("grid gap-3", tipo === "RETIRO" && "sm:grid-cols-2")}>
          <Input label="Para qué es" surface="tablet" placeholder={PISTA_DE_LA_NOTA[motivo]} maxLength={160} value={nota} onChange={(e) => setNota(e.target.value)} error={errores.nota} />
          {tipo === "RETIRO" && (
            <Input label="Quién lo recibe" title="Firma el comprobante" surface="tablet" autoCapitalize="words" maxLength={120} value={recibe} onChange={(e) => setRecibe(e.target.value)} error={errores.recibe} />
          )}
        </div>

        {adelanto && (
          <>
            <PersonaYPin
              personas={personas}
              elegida={persona}
              onElegir={(id) => {
                setPersona(id);
                setPinPersona("");
              }}
              pin={pinPersona}
              onPin={setPinPersona}
              error={errores.persona ?? null}
              deshabilitado={enviando}
              onConfirmar={() => void mover()}
              pregunta="¿A quién? Firma con su PIN"
            />
            {errorDePersonas && <p className="text-detalle text-state-crit">{errorDePersonas}</p>}
          </>
        )}

        {pide && (
          <CampoAutorizacion
            a={a}
            denegado="Tu puesto no puede mover tanto efectivo ni retirarlo."
            errores={{ ...(errores.autorizador ? { autorizador: errores.autorizador } : {}), ...(errores.pin ? { pin: errores.pin } : {}) }}
            deshabilitado={enviando}
            onConfirmar={() => void mover()}
          />
        )}
        {pide && tipo !== "RETIRO" && (
          <p className="-mt-2 text-nota text-ink-3">
            Pasa del tope de <MoneyDisplay value={toMajor(tope)} currency="USD" size="sm" />: lo autoriza supervisión.
          </p>
        )}

        {errores.general && (
          <p role="alert" className="flex items-start gap-1.5 rounded-[var(--radius-control)] border border-state-crit/40 bg-state-crit-bg px-3 py-2.5 text-detalle text-state-crit">
            <TriangleAlert className="mt-0.5 size-(--icono-texto) shrink-0" aria-hidden="true" />
            {errores.general}
          </p>
        )}
      </form>
    </Dialog>
  );
}

/**
 * Lo movido en el turno, un renglón por movimiento: el icono de su tipo, su motivo y lo que movió (con signo). Lo
 * secundario (la nota, la hora, quién y quién autorizó) al pasar el ratón; a un toque, reimprimir su comprobante.
 */
export function MovimientosDeLaGaveta({ movimientos }: { movimientos: readonly MovimientoDeEfectivoDto[] }) {
  const { ajustes } = useSucursal();
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  if (movimientos.length === 0) return null;
  const reimprimir = async (m: MovimientoDeEfectivoDto) => {
    setImprimiendo(m.id);
    const r = await reimprimirMovimiento(m.id).catch(() => ({ ok: false as const, mensaje: "Sin conexión con el servidor: no se reimprimió." }));
    setImprimiendo(null);
    if (r.ok) avisar.ok(`Comprobante #${String(m.numero).padStart(4, "0")} a la impresora`, { detalle: "Sale como copia." });
    else avisar.error(r.mensaje);
  };
  return (
    <ul className="flex flex-col gap-0.5">
      {movimientos.map((m) => {
        const Icono = ICONO_DEL_TIPO[m.tipo];
        const sale = m.tipo !== "ENTRADA";
        const detalle = [
          m.nota,
          formatClock(Date.parse(m.en), ajustes.formatoHora, ajustes.zonaHoraria),
          m.persona ? `a ${m.persona.nombre}` : null,
          m.recibe ? `recibió ${m.recibe}` : null,
          m.por,
          m.autorizo ? `autorizó ${m.autorizo}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={m.id}>
            <button
              type="button"
              title={`${detalle}. Toca para reimprimir el comprobante.`}
              disabled={imprimiendo === m.id}
              onClick={() => void reimprimir(m)}
              className="flex min-h-8 w-full cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] px-1 text-left hover:bg-base/60"
            >
              <Icono className={cn("size-(--icono-texto) shrink-0", sale ? "text-ink-3" : "text-state-ok")} aria-hidden="true" />
              <Marquesina className="min-w-0 flex-1 text-detalle text-ink-2">{m.persona ? `Adelanto · ${m.persona.nombre}` : NOMBRE_DEL_MOTIVO[m.motivo]}</Marquesina>
              <span className="tnum shrink-0 text-detalle text-ink">
                {sale ? "−" : "+"}
                <MoneyDisplay value={toMajor(money(BigInt(m.monto.minor), m.monto.currency))} currency={m.monto.currency} size="sm" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
