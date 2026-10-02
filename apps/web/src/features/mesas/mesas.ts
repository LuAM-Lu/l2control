/**
 * Lo que ve el mesero, calculado del plano, del estado del salón y de los pedidos — F6-02, B6-2.
 *
 * Funciones puras: el plano dice qué mesas existen; los eventos del bus, cuáles están ocupadas (hasta
 * B6-3); los pedidos del servidor, qué se pidió en la cuenta abierta de cada una y si su comanda salió
 * en papel. Una mesa sin evento de apertura está libre. El instante entra como argumento (ADR-010).
 */
import type { DiningTableDto, FamilyAccountDto, ParkSessionDto, PedidoDto } from "@l2/contracts";
import { multiply, sum, type Money } from "@l2/domain-money";
import type { ProductoALaVenta } from "../inventario/catalogo.ts";
import type { EstadoLocal, Mesa } from "../operacion/proyeccion.ts";

export type EstadoVisible = "LIBRE" | Mesa["estado"];

export type MesaVista = Readonly<{
  mesa: DiningTableDto;
  estado: EstadoVisible;
  ocupacion: Mesa | null;
  /** Minutos en el estado actual; `null` si está libre. */
  minutos: number | null;
  /** La cuenta abierta de la mesa en el servidor, si tiene (una sola, I-05). */
  cuenta: FamilyAccountDto | null;
  /** Los pedidos de esa cuenta, del más nuevo al más viejo. */
  pedidos: readonly PedidoDto[];
  /** Comandas de la mesa que no salieron en papel: hay que reimprimirlas. */
  sinSalir: number;
}>;

/** La cuenta abierta de una mesa: la que no se ha cobrado ni se dio por incobrable. */
export function cuentaAbiertaDe(cuentas: readonly FamilyAccountDto[], tableId: string): FamilyAccountDto | null {
  return cuentas.find((c) => c.kind === "MESA" && c.tableId === tableId && (c.status === "ABIERTA" || c.status === "POR_COBRAR")) ?? null;
}

export function vistaDelPlano(
  plano: readonly DiningTableDto[],
  estado: EstadoLocal,
  cuentas: readonly FamilyAccountDto[],
  pedidos: readonly PedidoDto[],
  ahora: number,
): MesaVista[] {
  return plano.map((mesa) => {
    const ocupacion = estado.mesas[mesa.id] ?? null;
    const cuenta = cuentaAbiertaDe(cuentas, mesa.id);
    const suyos = cuenta ? pedidos.filter((p) => p.cuentaId === cuenta.id) : [];
    return {
      mesa,
      estado: ocupacion?.estado ?? "LIBRE",
      ocupacion,
      minutos: ocupacion ? minutosDesde(ocupacion.desde, ahora) : null,
      cuenta,
      pedidos: suyos,
      sinSalir: suyos.filter((p) => p.comanda.estado === "NO_SALIO").length,
    };
  });
}

/** Cuántos minutos lleva ocupada una mesa antes de considerarla larga (§8.5). */
export const MESA_LARGA_MIN = 75;

export type Urgencia = Readonly<{
  vista: MesaVista;
  /** Qué pide esta mesa, en una línea. */
  que: string;
  tono: "crit" | "warn" | "idle";
  /** Menor es antes. */
  orden: number;
}>;

/**
 * Lo que pide acción AHORA, en el orden en que conviene atenderlo — V3, B6-2.
 *
 * Primero la comanda que no salió en papel (la cocina no sabe que existe), después quien quiere pagar,
 * luego lo que bloquea una mesa (por limpiar) y por último las mesas que llevan mucho tiempo. Lo demás
 * no sale: una lista que lo enumera todo se deja de mirar.
 */
export function loQuePideAtencion(mesas: readonly MesaVista[]): Urgencia[] {
  const filas: Urgencia[] = [];
  for (const v of mesas) {
    if (v.sinSalir > 0) {
      filas.push({ vista: v, que: v.sinSalir === 1 ? "Una comanda no salió: vuelve a imprimirla" : `${v.sinSalir} comandas no salieron: vuelve a imprimirlas`, tono: "crit", orden: 0 });
    }
    if (v.estado === "PIDE_CUENTA") {
      filas.push({ vista: v, que: `Pide la cuenta · ${v.minutos ?? 0} min esperando`, tono: "warn", orden: 1 });
    }
    if (v.estado === "POR_LIMPIAR") {
      filas.push({ vista: v, que: "Por limpiar", tono: "idle", orden: 2 });
    }
    if (v.estado === "OCUPADA" && (v.minutos ?? 0) >= MESA_LARGA_MIN) {
      filas.push({ vista: v, que: `Lleva ${v.minutos} min sentada`, tono: "idle", orden: 3 });
    }
  }
  return filas.sort((a, b) => a.orden - b.orden || (b.vista.minutos ?? 0) - (a.vista.minutos ?? 0));
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

/** Una línea del borrador: un plato de la carta (`itemId` es su producto), cuántos y su nota. */
export type LineaBorrador = Readonly<{ itemId: string; cantidad: number; nota: string }>;

/** Total del borrador con el precio de hoy. Los platos que ya no están en la carta no suman: no se pueden enviar. */
export function totalBorrador(lineas: readonly LineaBorrador[], carta: readonly ProductoALaVenta[]): Money {
  return sum(
    lineas.flatMap((l) => {
      const item = carta.find((i) => i.id === l.itemId);
      return item ? [multiply(item.precio, BigInt(l.cantidad))] : [];
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
