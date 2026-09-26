/**
 * Los errores de la base, con nombre. Prisma envuelve el error de PostgreSQL y a veces lo
 * etiqueta mal (un rechazo de disparador llega como «Foreign key constraint violated»);
 * aquí se lee el SQLSTATE original, que es lo único fiable.
 */

export type MotivoDeBase =
  /** Una tabla de solo-agregar rechazó un UPDATE, DELETE o TRUNCATE (regla 5). */
  | "SOLO_AGREGAR"
  /** Ya existe una fila con esa clave única: p. ej., dos publicaciones con la misma versión. */
  | "DUPLICADO"
  /** La fila cita algo que no existe, o que es de otro tenant (FK compuesta). */
  | "REFERENCIA_INVALIDA"
  /** La RLS negó la fila: se intentó escribir fuera del tenant de la transacción. */
  | "FUERA_DEL_TENANT"
  /** Una restricción CHECK la rechazó. */
  | "RESTRICCION";

const POR_CODIGO: Record<string, MotivoDeBase> = {
  L2001: "SOLO_AGREGAR",
  "23505": "DUPLICADO",
  "23503": "REFERENCIA_INVALIDA",
  "42501": "FUERA_DEL_TENANT",
  "23514": "RESTRICCION",
};

export interface ErrorDeBase {
  motivo: MotivoDeBase;
  /** El mensaje de PostgreSQL, para el log. No se enseña tal cual al usuario. */
  detalle: string;
}

/** Traduce un error lanzado por Prisma o por `pg`. Devuelve `null` si no es uno conocido. */
export function errorDeBase(e: unknown): ErrorDeBase | null {
  if (typeof e !== "object" || e === null) return null;
  const causa = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } })
    .meta?.driverAdapterError?.cause;
  const codigo = causa?.originalCode ?? (e as { code?: string }).code;
  const detalle = causa?.originalMessage ?? (e as { message?: string }).message ?? "";
  const motivo = codigo ? POR_CODIGO[codigo] : undefined;
  if (motivo) return { motivo, detalle };
  // Prisma a veces trae el código de PostgreSQL solo dentro del mensaje (p. ej., la RLS).
  if (/row-level security/i.test(detalle)) return { motivo: "FUERA_DEL_TENANT", detalle };
  return null;
}
