/**
 * Lo que ve el mesero, calculado del plano y del estado del local — F6-02.
 *
 * Funciones puras: el plano dice qué mesas existen; los eventos, cuáles están
 * ocupadas y qué pidió cada una. Una mesa sin evento de apertura está libre.
 * El instante entra como argumento (ADR-010).
 */
import type { DiningTableDto, MenuDto, MenuItemDto, ParkSessionDto } from "@l2/contracts";
import { money, multiply, sum, type Money } from "@l2/domain-money";
import type { EstadoLocal, Mesa, Pedido } from "../simulacion/proyeccion.ts";

export type EstadoVisible = "LIBRE" | Mesa["estado"];

export type MesaVista = Readonly<{
  mesa: DiningTableDto;
  estado: EstadoVisible;
  ocupacion: Mesa | null;
  /** Minutos en el estado actual; `null` si está libre. */
  minutos: number | null;
  pedidos: readonly Pedido[];
  listos: number;
  enCocina: number;
}>;

const ORDEN_PEDIDO: Readonly<Record<Pedido["estado"], number>> = {
  LISTO: 0,
  EN_PREPARACION: 1,
  ENVIADO: 2,
  ENTREGADO: 3,
  ANULADO: 4,
};

export function vistaDelPlano(
  plano: readonly DiningTableDto[],
  estado: EstadoLocal,
  ahora: number,
): MesaVista[] {
  const pedidos = Object.values(estado.pedidos);
  return plano.map((mesa) => {
    const ocupacion = estado.mesas[mesa.id] ?? null;
    // Los pedidos de una ocupación anterior de la misma mesa no son de esta familia.
    const suyos = ocupacion
      ? pedidos
          .filter((p) => p.tableId === mesa.id && Date.parse(p.enviadoEn) >= Date.parse(ocupacion.abiertaEn))
          .sort((a, b) => ORDEN_PEDIDO[a.estado] - ORDEN_PEDIDO[b.estado] || Date.parse(a.enviadoEn) - Date.parse(b.enviadoEn))
      : [];
    return {
      mesa,
      estado: ocupacion?.estado ?? "LIBRE",
      ocupacion,
      minutos: ocupacion ? minutosDesde(ocupacion.desde, ahora) : null,
      pedidos: suyos,
      listos: suyos.filter((p) => p.estado === "LISTO").length,
      enCocina: suyos.filter((p) => p.estado === "ENVIADO" || p.estado === "EN_PREPARACION").length,
    };
  });
}

/** Minutos desde un instante ISO; 0 si el reloj todavía no arrancó. */
export function minutosDesde(iso: string, ahora: number): number {
  return ahora > 0 ? Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000)) : 0;
}

export type GrupoFamilia = Readonly<{ familia: string; ninos: readonly ParkSessionDto[] }>;

/**
 * Niños en sala que todavía no están vinculados a ninguna mesa, por familia.
 * Un niño ya vinculado no se ofrece para otra mesa: su parque se cobraría
 * dos veces (R3).
 */
export function ninosSinMesa(estado: EstadoLocal): GrupoFamilia[] {
  const vinculados = new Set(Object.values(estado.mesas).flatMap((m) => m.sesiones));
  const grupos = new Map<string, ParkSessionDto[]>();
  for (const s of estado.sesiones) {
    if (vinculados.has(s.id)) continue;
    const familia = estado.familias[s.id] ?? "Sin representante";
    grupos.set(familia, [...(grupos.get(familia) ?? []), s]);
  }
  return [...grupos.entries()]
    .map(([familia, ninos]) => ({ familia, ninos }))
    .sort((a, b) => a.familia.localeCompare(b.familia, "es"));
}

/* ── el borrador del pedido ── */

export type LineaBorrador = Readonly<{ itemId: string; cantidad: number; nota: string }>;

export function precioDe(item: MenuItemDto): Money {
  return money(BigInt(item.price.minor), item.price.currency);
}

/** Total del borrador. Los platos que ya no están en la carta no suman: no se pueden enviar. */
export function totalBorrador(lineas: readonly LineaBorrador[], carta: MenuDto): Money {
  return sum(
    lineas.flatMap((l) => {
      const item = carta.find((i) => i.id === l.itemId);
      return item ? [multiply(precioDe(item), BigInt(l.cantidad))] : [];
    }),
    "USD",
  );
}

/** Añade una unidad; si la línea ya existe con la misma nota, suma ahí. */
export function anadir(lineas: readonly LineaBorrador[], itemId: string): LineaBorrador[] {
  const i = lineas.findIndex((l) => l.itemId === itemId && l.nota === "");
  if (i === -1) return [...lineas, { itemId, cantidad: 1, nota: "" }];
  return lineas.map((l, j) => (j === i ? { ...l, cantidad: Math.min(50, l.cantidad + 1) } : l));
}
