/**
 * Los puestos, por uso — T-20 (M-37, U-14).
 *
 * Un puesto (la caja, el parque, las mesas) está ocupado si alguien trabajó en él hace poco, sea del rol que sea: lo
 * que se hizo dice de qué puesto es (cobrar es de la caja; una entrada, del parque; un pedido, de las mesas). Lo que no
 * lo dice (abrir una sesión, imprimir) cuenta para el puesto del equipo (el punto de cobro es la caja) o, si no, para el
 * del rol de quien lo hizo. Sin nadie desde hace un rato, el puesto dice «sin actividad desde…», sin alarma; con la caja
 * abierta, un puesto vigilado que lleva más de los minutos del local sin nadie avisa una vez, y no vuelve a avisar hasta
 * que alguien vuelva.
 *
 * Funciones puras: el instante entra como argumento (ADR-010).
 */
import type { Role } from "./permissions.ts";

export type PuestoDeServicio = "CAJA" | "PARQUE" | "MESAS";

/** Los tres, en el orden del panel. La cocina no: trabaja con la comanda impresa (ADR-022). */
export const PUESTOS_DE_SERVICIO: readonly PuestoDeServicio[] = Object.freeze(["CAJA", "PARQUE", "MESAS"]);

export const NOMBRE_DEL_PUESTO: Readonly<Record<PuestoDeServicio, string>> = Object.freeze({ CAJA: "Caja", PARQUE: "Parque", MESAS: "Mesas" });

/** Lo que se hizo y de qué puesto es: por el comienzo de su acción. */
const POR_ACCION: readonly (readonly [string, PuestoDeServicio])[] = [
  ["cuenta.cobrar", "CAJA"],
  ["cuenta.anular_cobro", "CAJA"],
  ["cuenta.cortesia", "CAJA"],
  ["cuenta.quitar_cortesia", "CAJA"],
  ["cuenta.descuento", "CAJA"],
  ["cuenta.quitar_descuento", "CAJA"],
  ["cuenta.incobrable", "CAJA"],
  ["cuenta.juntar", "CAJA"],
  ["cuenta.partir", "CAJA"],
  ["cuenta.dividir", "CAJA"],
  ["cuenta.unir", "CAJA"],
  ["pago.", "CAJA"],
  ["turno.", "CAJA"],
  ["cobro.", "CAJA"],
  ["deuda.", "CAJA"],
  ["papel.", "CAJA"],
  ["venta.", "CAJA"],
  ["personal.", "CAJA"],
  ["parque.", "PARQUE"],
  ["representante.", "PARQUE"],
  ["nino.", "PARQUE"],
  ["evento.entrada", "PARQUE"],
  ["pedido.", "MESAS"],
  ["mesa.", "MESAS"],
];

const PUESTO_DEL_ROL: Readonly<Partial<Record<Role, PuestoDeServicio>>> = { CAJERO: "CAJA", MONITOR_PARQUE: "PARQUE", MESERO: "MESAS" };

/**
 * ¿De qué puesto es lo que alguien hizo? Por la acción; si no lo dice, el punto de cobro es la caja; si no, el puesto de
 * su rol. Supervisión y administración fuera de un puesto (en su oficina, configurando) no ocupan ninguno.
 */
export function puestoDeLaActividad(a: Readonly<{ accion: string; rol: Role; enPuntoDeCobro: boolean }>): PuestoDeServicio | null {
  for (const [prefijo, puesto] of POR_ACCION) if (a.accion.startsWith(prefijo)) return puesto;
  if (a.enPuntoDeCobro) return "CAJA";
  return PUESTO_DEL_ROL[a.rol] ?? null;
}

export type EstadoDelPuesto = Readonly<{
  /** Alguien trabajó en él hace menos de los minutos del local. */
  ocupado: boolean;
  /**
   * Con la caja abierta, lleva más de los minutos sin nadie (desde su última actividad o desde que se abrió la caja, lo
   * que sea más tarde) y se vigila: avisa una vez por cada ausencia.
   */
  avisar: boolean;
  /** Desde cuándo está sin nadie, para decirlo; `null` si está ocupado. */
  sinNadieDesde: number | null;
}>;

export function estadoDelPuesto(p: Readonly<{ ultima: number | null; cajaAbiertaDesde: number | null; ahora: number; minutos: number; vigilado: boolean }>): EstadoDelPuesto {
  const umbral = p.minutos * 60_000;
  const ocupado = p.ultima !== null && p.ahora - p.ultima < umbral;
  if (ocupado) return { ocupado, avisar: false, sinNadieDesde: null };
  const desde = Math.max(p.ultima ?? Number.NEGATIVE_INFINITY, p.cajaAbiertaDesde ?? Number.NEGATIVE_INFINITY);
  const avisar = p.vigilado && p.cajaAbiertaDesde !== null && Number.isFinite(desde) && p.ahora - desde >= umbral;
  return { ocupado, avisar, sinNadieDesde: p.ultima };
}

/**
 * La clave de una ausencia: el puesto y su última actividad. Mientras no vuelva nadie es la misma, y un aviso ya dado
 * con ella no se repite; cuando alguien vuelve y se va otra vez, es otra.
 */
export const claveDeAusencia = (puesto: PuestoDeServicio, ultima: number | null): string => `${puesto}|${ultima ?? "nunca"}`;
