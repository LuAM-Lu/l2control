"use client";

import { useEffect, useRef, useState } from "react";
import { House, TriangleAlert, Unlink } from "lucide-react";
import type { FamilyAccountDto } from "@l2/contracts";
import { Button, MoneyDisplay, Sheet, avisar, cn, formatMoneyVE } from "@l2/ui";
import { chargeableLines, unlinkProblem, type UnlinkProblem } from "@l2/domain-cash";
import { money, sum, toMajor } from "@l2/domain-money";
import { cuentasDeMesaAbiertas } from "./mesas.ts";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";
import { desvincularPulsera } from "./mesas.acciones.ts";

/** Por qué no se desvincula, dicho en la pantalla (el servidor lo vuelve a comprobar). */
const MOTIVO: Record<UnlinkProblem, string> = {
  NO_VINCULADO: "Ya no está vinculado a esta mesa.",
  COBRO_EN_CURSO: "La mesa ya cobró una parte de su división: termina de cobrarla, o anula ese cobro, antes de desvincular.",
  YA_COBRADO: "Su tiempo ya se cobró en esta mesa: lo cobrado no se mueve.",
};

/**
 * Desvincular a un niño de la cuenta de su mesa — B6-15 (M-37).
 *
 * Lo que se debe de él (su paquete y su tiempo de más) vuelve a la cuenta de su familia, o pasa a otra cuenta de mesa
 * (otra mesa, u otra persona de una mesa compartida), y su salida del parque va ahí. Lo hace quien vincula, sin PIN.
 * Lo cobrado no se mueve. La usan la mesa y la ficha del niño en la sala.
 */
export function DesvincularNino({
  abierto,
  onCerrar,
  sesionId,
  nombre,
  desde,
  cuentas,
  adoptar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  sesionId: string;
  /** Cómo se llama el niño, para la pantalla. */
  nombre: string;
  /** La cuenta de la mesa en la que está. */
  desde: FamilyAccountDto;
  cuentas: readonly FamilyAccountDto[];
  /** Pone en la pantalla las dos cuentas como quedaron. */
  adoptar: (cuenta: FamilyAccountDto) => void;
}) {
  const familia = cuentas.find((c) => c.kind === "FAMILIA" && c.sessionIds.includes(sesionId)) ?? null;
  const familiaAbierta = familia !== null && (familia.status === "ABIERTA" || familia.status === "POR_COBRAR");
  const otras = cuentasDeMesaAbiertas(cuentas).filter((c) => c.id !== desde.id);
  const [destino, setDestino] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** La clave de este intento: un reintento tras un corte no lo mueve dos veces. */
  const clave = useRef<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setDestino(familiaAbierta ? "FAMILIA" : null);
      clave.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, sesionId]); // Se elige al abrir; no cambia lo que eligió la persona si llega otra cuenta.

  const problema = unlinkProblem(desde, sesionId);
  const suyo = chargeableLines(desde).filter((l) => l.sessionId === sesionId);
  const loSuyo = sum(suyo.map((l) => money(BigInt(l.amount.minor), "USD")), "USD");
  const elegida = destino === "FAMILIA" ? familia : (otras.find((c) => c.id === destino) ?? null);
  const etiqueta = destino === "FAMILIA" ? "a su familia" : elegida ? `a ${nombreDeCuenta(elegida)}` : "";

  async function confirmar() {
    if (!destino || problema) return;
    clave.current ??= globalThis.crypto.randomUUID();
    setEnviando(true);
    const r = await desvincularPulsera({
      idempotencyKey: clave.current,
      desdeCuentaId: desde.id,
      sessionId: sesionId,
      destino: destino === "FAMILIA" ? { kind: "FAMILIA" } : { kind: "MESA", cuentaId: destino },
    }).catch(() => null);
    setEnviando(false);
    if (!r) {
      avisar.error("Sin conexión con el servidor: no se desvinculó. Vuelve a intentarlo.");
      return;
    }
    clave.current = null;
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    adoptar(r.valor.desde);
    adoptar(r.valor.destino);
    avisar.ok(`${nombre} · ${r.valor.destino.kind === "MESA" ? `pasa a ${nombreDeCuenta(r.valor.destino)}` : "vuelve a su familia"}`, {
      detalle: suyo.length > 0 ? `Lo que debe (${formatMoneyVE(toMajor(loSuyo), "USD")}) y su salida del parque van ahí.` : "Su salida del parque va ahí.",
    });
    onCerrar();
  }

  const opcion = (id: string, titulo: string, detalle: string, deshabilitada = false) => (
    <li key={id}>
      <label
        className={cn(
          "flex min-h-12 items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2",
          "transition-colors duration-[var(--dur-rapida)]",
          deshabilitada ? "cursor-not-allowed border-line opacity-60" : "cursor-pointer",
          !deshabilitada && destino === id ? "border-brand/60 bg-brand/10" : !deshabilitada ? "border-line bg-base/40 hover:border-line-strong" : "",
        )}
      >
        <input
          type="radio"
          name="destino-desvincular"
          checked={destino === id}
          disabled={deshabilitada}
          onChange={() => setDestino(id)}
          className="size-5 accent-[var(--color-brand)]"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">{titulo}</span>
          <span className="block text-[12.5px] text-ink-2">{detalle}</span>
        </span>
      </label>
    </li>
  );

  return (
    <Sheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Desvincular · ${nombre}`}
      descripcion={`Sale de ${nombreDeCuenta(desde)}: lo que debe de su tiempo y su salida del parque van a donde elijas.`}
      pie={
        <Button variant="primary" className="w-full" disabled={!destino || problema !== null || enviando} onClick={() => void confirmar()}>
          <Unlink size={17} aria-hidden="true" />
          {enviando ? "Desvinculando…" : destino ? (destino === "FAMILIA" ? "Desvincular · a su familia" : `Pasar ${etiqueta}`) : "Elige a dónde va"}
        </Button>
      }
    >
      {problema ? (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-state-warn/40 bg-state-warn-bg px-3 py-2.5 text-[13px] text-state-warn">
          <TriangleAlert size={15} aria-hidden="true" />
          {MOTIVO[problema]}
        </p>
      ) : (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-[13px] text-ink-2">{suyo.length > 0 ? "Lo que debe de su tiempo en esta cuenta, que se mueve" : "Su tiempo ya se pagó aparte: no hay nada que mover"}</span>
          {suyo.length > 0 && <MoneyDisplay value={toMajor(loSuyo)} currency="USD" size="sm" />}
        </div>
      )}

      <fieldset className="mb-5">
        <legend className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">
          <House size={13} aria-hidden="true" />
          Su familia
        </legend>
        <ul className="flex flex-col gap-1.5">
          {opcion(
            "FAMILIA",
            familia ? nombreDeCuenta(familia) : "Su familia",
            familiaAbierta ? "Vuelve a la cuenta con que entró al parque" : "Su cuenta ya se cerró: pásalo a otra mesa",
            !familiaAbierta,
          )}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase">Otra mesa</legend>
        {otras.length === 0 ? (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-2">
            No hay otra mesa con cuenta abierta.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {otras.map((c) =>
              opcion(
                c.id,
                nombreDeCuenta(c),
                `${c.comensales ? `${c.comensales} ${c.comensales === 1 ? "persona" : "personas"}` : "Sin contar personas"}${c.sessionIds.length > 0 ? ` · ${c.sessionIds.length} ${c.sessionIds.length === 1 ? "niño" : "niños"}` : ""}`,
              ),
            )}
          </ul>
        )}
      </fieldset>
    </Sheet>
  );
}
