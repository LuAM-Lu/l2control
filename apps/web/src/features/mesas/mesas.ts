/**
 * Lo que ve el mesero, calculado del plano, de las cuentas del salón y de los pedidos — F6-02, B6-2, B6-7.
 *
 * Funciones puras: el plano dice qué mesas existen; las cuentas del servidor, cuáles están ocupadas, por
 * quién y desde cuándo (B6-7: una mesa compartida tiene varias cuentas, y una cuenta de pie no tiene mesa);
 * los pedidos, qué se pidió en cada cuenta y si su comanda salió en papel. Del bus del salón queda solo
 * «por limpiar», que no es de nadie. El instante entra como argumento (ADR-010).
 */
import type { DiningTableDto, FamilyAccountDto, ParkSessionDto, PedidoDto } from "@l2/contracts";
import { atencionDeCuentas, type PedidoParaAtencion, type UmbralesDeAtencion } from "@l2/domain-orders";
import { multiply, sum, type Money } from "@l2/domain-money";
import type { ProductoALaVenta } from "../inventario/catalogo.ts";
import type { EstadoLocal } from "../operacion/proyeccion.ts";
import { esDelSalonAbierta, nombreDeCuenta } from "../cuentas/cuentas.ts";

export type EstadoVisible = "LIBRE" | "OCUPADA" | "PIDE_CUENTA" | "POR_LIMPIAR";

export type MesaVista = Readonly<{
  mesa: DiningTableDto;
  estado: EstadoVisible;
  /** Sus cuentas abiertas en el servidor, de la más antigua a la más nueva: varias en una mesa compartida. */
  cuentas: readonly FamilyAccountDto[];
  /** Cuántas personas están sentadas: la suma de sus cuentas. */
  comensales: number;
  /** Desde cuándo está en el estado actual (ocupada: su primera cuenta; pide la cuenta: la que lleva más). */
  desde: string | null;
  /** Minutos en el estado actual; `null` si está libre. */
  minutos: number | null;
  /** Los pedidos de sus cuentas, del más nuevo al más viejo. */
  pedidos: readonly PedidoDto[];
  /** Comandas de la mesa que no salieron en papel: hay que reimprimirlas. */
  sinSalir: number;
}>;

const porAntiguedad = (a: FamilyAccountDto, b: FamilyAccountDto) => Date.parse(a.openedAt) - Date.parse(b.openedAt) || (a.orderNumber ?? 0) - (b.orderNumber ?? 0);

/** Las cuentas abiertas de una mesa, de la más antigua a la más nueva. */
export function cuentasDeLaMesa(cuentas: readonly FamilyAccountDto[], tableId: string): FamilyAccountDto[] {
  return cuentas.filter((c) => c.kind === "MESA" && c.tableId === tableId && esDelSalonAbierta(c)).sort(porAntiguedad);
}

/** Las cuentas de pie abiertas (B6-7), de la más antigua a la más nueva. */
export function cuentasDePie(cuentas: readonly FamilyAccountDto[]): FamilyAccountDto[] {
  return cuentas.filter((c) => c.dePie === true && esDelSalonAbierta(c)).sort(porAntiguedad);
}

/** Lo que dice el plano de un grupo de cuentas (una mesa, o las de pie): su estado, desde cuándo y sus pedidos. */
function estadoDe(cuentas: readonly FamilyAccountDto[], pedidos: readonly PedidoDto[], porLimpiar: string | null, ahora: number) {
  const piden = cuentas.filter((c) => c.status === "POR_COBRAR");
  const estado: EstadoVisible = cuentas.length === 0 ? (porLimpiar !== null ? "POR_LIMPIAR" : "LIBRE") : piden.length > 0 ? "PIDE_CUENTA" : "OCUPADA";
  const desde =
    estado === "PIDE_CUENTA"
      ? piden.map((c) => c.pendingSince ?? c.openedAt).sort()[0]!
      : estado === "OCUPADA"
        ? cuentas[0]!.openedAt
        : porLimpiar;
  const ids = new Set(cuentas.map((c) => c.id));
  const suyos = pedidos.filter((p) => ids.has(p.cuentaId));
  return {
    estado,
    comensales: cuentas.reduce((n, c) => n + (c.comensales ?? 0), 0),
    desde,
    minutos: desde ? minutosDesde(desde, ahora) : null,
    pedidos: suyos,
    sinSalir: suyos.filter((p) => p.comanda.estado === "NO_SALIO").length,
  };
}

export function vistaDelPlano(
  plano: readonly DiningTableDto[],
  estado: EstadoLocal,
  cuentas: readonly FamilyAccountDto[],
  pedidos: readonly PedidoDto[],
  ahora: number,
): MesaVista[] {
  return plano.map((mesa) => {
    const suyas = cuentasDeLaMesa(cuentas, mesa.id);
    // «Por limpiar» viaja por el bus: lo marca la caja al cobrar la última cuenta y lo quita el mesero.
    const bus = estado.mesas[mesa.id];
    const porLimpiar = bus?.estado === "POR_LIMPIAR" ? bus.desde : null;
    return { mesa, cuentas: suyas, ...estadoDe(suyas, pedidos, porLimpiar, ahora) };
  });
}

/** Las cuentas de pie como se ven en el salón: sin mesa, con su estado y sus pedidos (B6-7). */
export type PieVista = Readonly<Omit<MesaVista, "mesa">>;

export function vistaDePie(cuentas: readonly FamilyAccountDto[], pedidos: readonly PedidoDto[], ahora: number): PieVista {
  const suyas = cuentasDePie(cuentas);
  return { cuentas: suyas, ...estadoDe(suyas, pedidos, null, ahora) };
}

/** Cuántos minutos lleva ocupada una mesa antes de considerarla larga (§8.5). */
export const MESA_LARGA_MIN = 75;

export type Urgencia = Readonly<{
  /** La mesa (su id) o «PIE» para una cuenta de pie. */
  lugar: string;
  /** Cómo se nombra: «3» o «De pie». */
  rotulo: string;
  /** La cuenta, si lo que pide atención es de una sola. */
  cuentaId: string | null;
  /** Qué pide, en una línea. */
  que: string;
  /** Debajo: la zona y las sillas, o la cuenta. */
  detalle: string;
  tono: "crit" | "warn" | "idle";
  /** Menor es antes. */
  orden: number;
  minutos: number;
}>;

/**
 * Lo que pide acción AHORA, en el orden en que conviene atenderlo — V3, B6-2, B6-7.
 *
 * Primero la comanda que no salió en papel (la cocina no sabe que existe), después quien quiere pagar,
 * luego lo que bloquea una mesa (por limpiar) y por último las mesas que llevan mucho tiempo. Las cuentas
 * de pie entran igual. Lo demás no sale: una lista que lo enumera todo se deja de mirar.
 */
export function loQuePideAtencion(
  mesas: readonly MesaVista[],
  pie: PieVista,
  ahora: number,
  /** Los pedidos y los umbrales (B6-8): quien espera su pedido, o no ha pedido, pasado su umbral. */
  atencion?: Readonly<{ pedidos: readonly PedidoParaAtencion[]; umbrales: UmbralesDeAtencion }>,
): Urgencia[] {
  const filas: Urgencia[] = [];
  const grupos = [
    ...mesas.map((v) => ({ lugar: v.mesa.id, rotulo: v.mesa.label, detalle: `${v.mesa.zone} · ${v.comensales} de ${v.mesa.seats} sillas`, v })),
    { lugar: "PIE", rotulo: "De pie", detalle: "Sin mesa", v: pie },
  ];
  for (const { lugar, rotulo, detalle, v } of grupos) {
    if (v.sinSalir > 0) {
      filas.push({ lugar, rotulo, cuentaId: null, que: v.sinSalir === 1 ? "Una comanda no salió: vuelve a imprimirla" : `${v.sinSalir} comandas no salieron: vuelve a imprimirlas`, detalle, tono: "crit", orden: 0, minutos: v.minutos ?? 0 });
    }
    for (const c of v.cuentas.filter((x) => x.status === "POR_COBRAR")) {
      const espera = minutosDesde(c.pendingSince ?? c.openedAt, ahora);
      filas.push({ lugar, rotulo, cuentaId: c.id, que: `Pide la cuenta · ${espera} min esperando`, detalle: nombreDeCuenta(c), tono: "warn", orden: 1, minutos: espera });
    }
    // B6-8 (P-19): la que espera lo que pidió, o no ha pedido, pasado su umbral. Para llamar a quien atiende.
    if (atencion && ahora > 0) {
      const abiertas = v.cuentas.filter((c) => c.status === "ABIERTA");
      for (const a of atencionDeCuentas(abiertas.map((c) => ({ id: c.id, abiertaEn: Date.parse(c.openedAt) })), atencion.pedidos, ahora, atencion.umbrales)) {
        if (a.alerta === null) continue;
        const c = abiertas.find((x) => x.id === a.cuentaId)!;
        filas.push(
          a.alerta === "ESPERANDO"
            ? { lugar, rotulo, cuentaId: c.id, que: `Espera su pedido · ${a.esperandoMin} min`, detalle: nombreDeCuenta(c), tono: "warn", orden: 1, minutos: a.esperandoMin ?? 0 }
            : { lugar, rotulo, cuentaId: c.id, que: `Sin pedir · ${a.sinPedirMin} min sentada`, detalle: nombreDeCuenta(c), tono: "warn", orden: 1, minutos: a.sinPedirMin ?? 0 },
        );
      }
    }
    if (v.estado === "POR_LIMPIAR") {
      filas.push({ lugar, rotulo, cuentaId: null, que: "Por limpiar", detalle, tono: "idle", orden: 2, minutos: v.minutos ?? 0 });
    }
    if (v.estado === "OCUPADA" && lugar !== "PIE" && (v.minutos ?? 0) >= MESA_LARGA_MIN) {
      filas.push({ lugar, rotulo, cuentaId: null, que: `Lleva ${v.minutos} min sentada`, detalle, tono: "idle", orden: 3, minutos: v.minutos ?? 0 });
    }
  }
  return filas.sort((a, b) => a.orden - b.orden || b.minutos - a.minutos);
}

/** Minutos desde un instante ISO; 0 si el reloj todavía no arrancó. */
export function minutosDesde(iso: string, ahora: number): number {
  return ahora > 0 ? Math.max(0, Math.floor((ahora - Date.parse(iso)) / 60_000)) : 0;
}

/**
 * Las cuentas a las que se puede cargar algo en el salón (vincular desde la sala, la salida «A una mesa»):
 * una por cuenta de mesa abierta, nombrada como se ve. Una mesa compartida da una opción por familia.
 */
export function cuentasDeMesaAbiertas(cuentas: readonly FamilyAccountDto[]): FamilyAccountDto[] {
  return cuentas
    .filter((c) => c.kind === "MESA" && esDelSalonAbierta(c))
    .sort((a, b) => (a.tableLabel ?? "").localeCompare(b.tableLabel ?? "", "es", { numeric: true }) || porAntiguedad(a, b));
}

export type GrupoFamilia = Readonly<{ familia: string; ninos: readonly ParkSessionDto[] }>;

/**
 * Niños en sala que todavía no están vinculados a ninguna mesa, por familia.
 * Un niño ya vinculado no se ofrece para otra mesa: su parque se cobraría
 * dos veces (R3). Quién está vinculado lo dice la cuenta de la mesa en el
 * servidor (`sessionIds`, B6-3), no un evento del bus.
 */
export function ninosSinMesa(estado: EstadoLocal, cuentas: readonly FamilyAccountDto[]): GrupoFamilia[] {
  const vinculados = new Set(
    cuentas.filter((c) => c.kind === "MESA" && (c.status === "ABIERTA" || c.status === "POR_COBRAR")).flatMap((c) => c.sessionIds),
  );
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

/** Un pedido como lo necesita la atención en el salón (B6-8): anulado si su cuenta anuló todo lo que pidió. */
export function paraAtender(p: PedidoDto, cuentas: readonly FamilyAccountDto[]): PedidoParaAtencion {
  const propias = cuentas.find((c) => c.id === p.cuentaId)?.lines.filter((l) => l.orderId === p.id) ?? [];
  return {
    cuentaId: p.cuentaId,
    enviadoEn: Date.parse(p.enviadoEn),
    servidoEn: p.servido ? Date.parse(p.servido.en) : null,
    anulado: propias.length > 0 && propias.every((l) => l.anulacion !== undefined),
  };
}
