"use client";

import { Baby, HandPlatter, Receipt } from "lucide-react";
import type { EstanciaDto, FamilyAccountDto } from "@l2/contracts";
import { ninosDeLaMesa } from "../cuentas/cuentas.ts";
import { platosSinServir, textoDePlatos } from "../mesas/mesas.ts";
import { usePedidos } from "../mesas/PedidosProvider.tsx";
import { useAhoraLocal } from "../operacion/OperacionProvider.tsx";
import { useSala } from "../park/SalaProvider.tsx";

/** Una cuenta del salón (B6-14): la de una mesa o la de pie. Las del parque y del mostrador no tienen mesa que contar. */
export function esDelSalon(cuenta: FamilyAccountDto): boolean {
  return cuenta.kind === "MESA" || cuenta.dePie === true;
}

/** El nombre de un niño en la sala: su apodo, su nombre o, si no lo dieron, su pulsera. */
export function nombreDelNino(s: EstanciaDto): string {
  return s.kid.nickname ?? s.kid.name ?? s.wristbandCode;
}

/** «45 min» o «1 h 05 min». */
function duracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")} min`;
}

const minutosDesde = (iso: string, ahora: number) => Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000));

/**
 * Lo que la caja tiene que saber de una cuenta del salón antes de cobrarla (B6-14, M-35): si pidió la cuenta y hace
 * cuánto, los platos que siguen sin servir y los niños de la familia, con su tiempo si siguen en la sala (B4-14: lo suyo
 * está en esta cuenta o ya se pagó aparte). Su mesa ya la dice el nombre de la cuenta. Sin nada que decir, nada.
 */
export function SalonDeLaCuenta({ cuenta }: { cuenta: FamilyAccountDto }) {
  const { pedidos } = usePedidos();
  const { sala } = useSala();
  const ahora = useAhoraLocal();
  const sinServir = textoDePlatos(platosSinServir(cuenta, pedidos));
  const ninos = cuenta.kind === "MESA" ? ninosDeLaMesa(cuenta) : [];
  const enSala = new Map((sala?.sessions ?? []).map((s) => [s.id, s]));
  const pidio = ahora > 0 ? cuenta.pendingSince : undefined;
  if (pidio === undefined && sinServir === "" && ninos.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-b border-line px-5 py-1.5 text-[12px] text-ink-3">
      {(pidio !== undefined || sinServir !== "") && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {pidio !== undefined && (
            <span className="tnum inline-flex items-center gap-1">
              <Receipt size={12} aria-hidden="true" />
              Pidió la cuenta hace {duracion(minutosDesde(pidio, ahora))}
            </span>
          )}
          {sinServir !== "" && (
            <span className="inline-flex items-center gap-1">
              <HandPlatter size={12} aria-hidden="true" />
              Sin servir: {sinServir}
            </span>
          )}
        </p>
      )}
      {ninos.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold tracking-[0.06em] uppercase">Niños</span>
          {ninos.map((n) => {
            const s = enSala.get(n.sessionId);
            return (
              <span key={n.sessionId} className="inline-flex items-center gap-1">
                <Baby size={12} aria-hidden="true" />
                {s ? nombreDelNino(s) : "ya salió"}
                {s && ahora > 0 && <span className="tnum">· en la sala {duracion(minutosDesde(s.startedAt, ahora))}</span>} ·{" "}
                {n.enLaCuenta ? "en la cuenta" : <span className="font-semibold text-state-ok">pagado</span>}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}
