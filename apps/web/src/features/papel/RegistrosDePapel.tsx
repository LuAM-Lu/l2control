"use client";

import { ArrowDownToLine, ArrowUpFromLine, HandCoins } from "lucide-react";
import type { CargaDePapelDto, MoneyDto, RegistroDePapelDto } from "@l2/contracts";
import { money, toMajor, type CurrencyCode } from "@l2/domain-money";
import { Badge, MoneyDisplay, cn } from "@l2/ui";
import { useReloj } from "../sucursal/SucursalProvider.tsx";

/**
 * Lo cargado desde papel, registro a registro — B3-7, V-12.
 *
 * Lo mismo lo ve la cajera mientras carga (para comprobar que no se le pasó ninguna hoja) y supervisión al
 * revisar (para compararlo con el papel): la hora real que se anotó, cuándo se cargó, a quién toca y lo que
 * dice cada uno. Va en el orden en que ocurrió, no en el que se cargó.
 */

const aDinero = (m: MoneyDto) => money(BigInt(m.minor), m.currency as CurrencyCode);
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

const TIPO = {
  ENTRADA: { texto: "Entrada", icono: ArrowDownToLine },
  SALIDA: { texto: "Salida", icono: ArrowUpFromLine },
  COBRO: { texto: "Cobro", icono: HandCoins },
} as const;

export function EstadoDeCarga({ estado }: { estado: CargaDePapelDto["estado"] }) {
  switch (estado) {
    case "ABIERTA":
      return <Badge tone="brand">Cargando</Badge>;
    case "CERRADA":
      return <Badge tone="warn">Esperando revisión</Badge>;
    case "REVISADA":
      return <Badge tone="ok">Revisada</Badge>;
    case "DESCARTADA":
      return <Badge tone="idle">Descartada</Badge>;
  }
}

/** Lo que dice un registro: sus niños, su tiempo de más o lo que se pagó. */
function detalleDe(r: RegistroDePapelDto): string {
  switch (r.tipo) {
    case "ENTRADA":
      return `${r.ninos.map((n) => (n.nombre ? `${n.pulsera} · ${n.nombre}` : n.pulsera)).join(", ")} · ${r.modo === "PREPAGO" ? "paga al entrar" : "cuenta abierta"}`;
    case "SALIDA":
      return `${r.ninos.map((n) => (n.nombre ? `${n.pulsera} · ${n.nombre}` : n.pulsera)).join(", ")}${BigInt(r.excedente.minor) > 0n ? " · con tiempo de más" : ""}`;
    case "COBRO":
      return r.pagos.map((p) => p.medio).join(", ");
  }
}

/** El importe que se compara con el formulario: lo que costó la entrada, el tiempo de más de la salida o lo cobrado. */
function importeDe(r: RegistroDePapelDto): MoneyDto | null {
  switch (r.tipo) {
    case "ENTRADA":
      return r.total;
    case "SALIDA":
      return BigInt(r.excedente.minor) > 0n ? r.excedente : null;
    case "COBRO":
      return r.total;
  }
}

export function RegistrosDePapel({ registros, className }: { registros: readonly RegistroDePapelDto[]; className?: string }) {
  const reloj = useReloj();
  if (registros.length === 0) {
    return <p className={cn("text-[13px] text-ink-3", className)}>Todavía no se ha cargado nada de esta hoja.</p>;
  }
  return (
    <ul className={cn("flex flex-col divide-y divide-line/60", className)}>
      {registros.map((r) => {
        const { texto, icono: Icono } = TIPO[r.tipo];
        const importe = importeDe(r);
        return (
          <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-0.5 py-2.5">
            <span className="mt-0.5 flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-surface-2 text-ink-2">
              <Icono size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                <span className="font-semibold text-ink">{texto}</span>
                <span className="tnum font-semibold text-ink">{reloj.diaYHora(Date.parse(r.ocurrioEn))}</span>
                <span className="text-ink-3">
                  {orden(r.orden)} · {r.familia}
                </span>
              </p>
              <p className="truncate text-[12.5px] text-ink-2">{detalleDe(r)}</p>
              <p className="tnum text-[11.5px] text-ink-3">
                Cargado a las {reloj.hora(Date.parse(r.cargadoEn))} por {r.cargadoPor}
              </p>
            </div>
            {importe ? <MoneyDisplay value={toMajor(aDinero(importe))} currency={importe.currency} size="sm" /> : <span />}
          </li>
        );
      })}
    </ul>
  );
}
