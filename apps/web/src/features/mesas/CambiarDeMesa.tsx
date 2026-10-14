"use client";

import { useState } from "react";
import { ArrowRightLeft, Sparkles, Users } from "lucide-react";
import type { CambioDeMesaDto, FamilyAccountDto, Rechazo } from "@l2/contracts";
import { Button, Dialog, avisar, cn } from "@l2/ui";
import { useCuentas } from "../cuentas/CuentasProvider.tsx";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";
import { cuentasDeMesaAbiertas } from "./mesas.ts";
import { cambiarDeMesa } from "./mesas.acciones.ts";
import { usePlano } from "./PlanoProvider.tsx";
import { usePorLimpiar } from "./porLimpiar.ts";

const sinConexion: Rechazo = { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Sin conexión con el servidor: la cuenta sigue en su mesa." };
const AREA = { COCINA: "la cocina", BARRA: "la barra" } as const;

/**
 * Cambiar de mesa — B6-21 (M-39, X-16), en la tablet y en la caja.
 *
 * Se elige la mesa nueva en el salón: libre, por limpiar, o con gente (queda como mesa compartida, B6-7). La cuenta pasa
 * entera, con sus pedidos y sus niños; lo que falta servir saca el papel «CAMBIO DE MESA» en la cocina y en la barra. Sin
 * PIN: no mueve dinero.
 */
export function CambiarDeMesa({
  cuenta,
  onCerrar,
  onHecho,
}: {
  /** La cuenta de mesa que se cambia; `null`, cerrado. */
  cuenta: FamilyAccountDto | null;
  onCerrar: () => void;
  onHecho?: (r: CambioDeMesaDto) => void;
}) {
  const { plano } = usePlano();
  const { cuentas, adoptar } = useCuentas();
  const { porId: porLimpiar } = usePorLimpiar();
  const [elegida, setElegida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [para, setPara] = useState<string | null>(null);

  // Cada cuenta abre el diálogo sin mesa elegida. Derivado en el render, sin efecto.
  if ((cuenta?.id ?? null) !== para) {
    setPara(cuenta?.id ?? null);
    setElegida(null);
  }

  const abiertas = cuentasDeMesaAbiertas(cuentas);
  const mesas = (plano?.tables ?? [])
    .filter((m) => !m.retiredAt && m.id !== cuenta?.tableId)
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));
  const destino = mesas.find((m) => m.id === elegida) ?? null;
  const conGente = destino ? abiertas.filter((c) => c.tableId === destino.id) : [];

  async function cambiar() {
    if (!cuenta || !destino) return;
    setEnviando(true);
    const r = await cambiarDeMesa({ idempotencyKey: crypto.randomUUID(), accountId: cuenta.id, version: cuenta.version, tableId: destino.id }).catch(() => sinConexion);
    setEnviando(false);
    if (!r.ok) {
      avisar.error(r.mensaje);
      return;
    }
    adoptar(r.valor.cuenta);
    const papel = r.valor.papeles.map((a) => AREA[a]).join(" y ");
    const propio = r.valor.cuenta.family !== `Mesa ${r.valor.a}` ? ` · ${r.valor.cuenta.family}` : "";
    avisar.ok(`Mesa ${r.valor.desde} → Mesa ${r.valor.a}${propio}`, {
      detalle: `${papel ? `A ${papel} le sale el papel «CAMBIO DE MESA» con lo que falta servir. ` : ""}La mesa ${r.valor.desde} queda por limpiar.`,
    });
    onHecho?.(r.valor);
    onCerrar();
  }

  return (
    <Dialog
      abierto={cuenta !== null}
      onCerrar={onCerrar}
      titulo={`Cambiar de mesa · ${cuenta ? nombreDeCuenta(cuenta) : ""}`}
      descripcion="La cuenta pasa entera a la mesa nueva, con sus pedidos y sus niños. Lo que falta servir sale en un papel para la cocina."
      pie={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void cambiar()} disabled={!destino || enviando}>
            <ArrowRightLeft size={16} aria-hidden="true" />
            {destino ? `Cambiar a la mesa ${destino.label}` : "Elige la mesa"}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label="Mesa nueva" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
        {mesas.map((m) => {
          const gente = abiertas.filter((c) => c.tableId === m.id).length;
          const sucia = gente === 0 && porLimpiar.has(m.id);
          const activa = m.id === elegida;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setElegida(m.id)}
              title={gente > 0 ? `Con ${gente} ${gente === 1 ? "cuenta" : "cuentas"}: quedará como mesa compartida` : sucia ? "Por limpiar" : "Libre"}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] border px-3 text-left",
                "transition-colors duration-[var(--dur-rapida)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                activa ? "border-brand bg-brand/15" : "border-line bg-base/40 hover:border-line-strong",
              )}
            >
              <span className="tnum text-tarjeta font-bold text-ink">{m.label}</span>
              <span className="flex items-center gap-1 text-detalle text-ink-3">
                {gente > 0 ? (
                  <>
                    <Users size={13} aria-hidden="true" />
                    {gente}
                  </>
                ) : sucia ? (
                  <>
                    <Sparkles size={13} aria-hidden="true" />
                    Limpiar
                  </>
                ) : (
                  "Libre"
                )}
              </span>
            </button>
          );
        })}
      </div>
      {conGente.length > 0 && (
        <p className="mt-3 flex items-center gap-2 text-detalle text-ink-2">
          <Users size={14} aria-hidden="true" className="shrink-0 text-ink-3" />
          La mesa {destino?.label} tiene a {conGente.map(nombreDeCuenta).join(", ")}: quedará como mesa compartida, cada cuenta aparte.
        </p>
      )}
    </Dialog>
  );
}
