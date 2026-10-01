/**
 * Lo que leen de los descuentos la caja, el cobro, los cortes y el directorio (B3-6): las reglas, la
 * categoría de cada producto y las marcas VIP de las familias. Vive aparte para que el cobro
 * (`cuentas.ts`) y los descuentos (`descuentos.ts`) lo compartan sin depender uno del otro.
 */
import { ReglaDescuentoSchema, type FamilyAccountDto, type ReglaDescuentoDto } from "@l2/contracts";
import type { CategoryOf } from "@l2/domain-cash";
import type { Transaccion } from "@l2/database";

/** Por qué se aplica un manual, en palabras: lo que va al motivo de la autorización y de la auditoría. */
export const TEXTO_MOTIVO_DESCUENTO: Readonly<Record<string, string>> = {
  CLIENTE_FRECUENTE: "Cliente frecuente",
  COMPENSACION: "Compensación al cliente",
  PROMOCION: "Promoción",
  OTRO: "Otro",
};

type FilaRegla = Awaited<ReturnType<Transaccion["discountRule"]["findMany"]>>[number];

const fecha = (d: Date) => d.toISOString().slice(0, 10);

export function reglaDeFila(f: FilaRegla, familias: number): ReglaDescuentoDto {
  return ReglaDescuentoSchema.parse({
    id: f.id,
    nombre: f.name,
    tipo: f.kind,
    valor: f.valueKind === "PORCENTAJE" ? { tipo: "PORCENTAJE", basisPoints: f.basisPoints } : { tipo: "MONTO", monto: { minor: String(f.amountMinor), currency: "USD" } },
    alcance: f.scopeKind === "CATEGORIAS" ? { tipo: "CATEGORIAS", categorias: f.categories } : { tipo: f.scopeKind },
    medio: f.methodCode,
    desde: fecha(f.validFrom),
    hasta: f.validTo ? fecha(f.validTo) : null,
    creada: { at: f.createdAt.toISOString(), por: f.createdByName },
    retirada: f.retiredAt && f.retiredByName ? { at: f.retiredAt.toISOString(), por: f.retiredByName } : null,
    familias,
  });
}

/** Lo que va a la auditoría de una regla: su forma entera (es configuración, no datos de nadie). */
export function resumenDeRegla(r: ReglaDescuentoDto) {
  return { nombre: r.nombre, tipo: r.tipo, valor: r.valor, alcance: r.alcance, medio: r.medio, desde: r.desde, hasta: r.hasta };
}

/** Las reglas del local, las vigentes primero y por nombre, con cuántas familias lleva cada VIP. */
export async function reglasDe(tx: Transaccion): Promise<ReglaDescuentoDto[]> {
  const filas = await tx.discountRule.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const marcas = await tx.$queryRaw<{ discount_rule_id: string | null; familias: bigint }[]>`
    SELECT ultima.discount_rule_id, count(*) AS familias FROM (
      SELECT DISTINCT ON (guardian_id) guardian_id, discount_rule_id
      FROM guardian_vip ORDER BY guardian_id, marked_at DESC, id DESC
    ) ultima
    WHERE ultima.discount_rule_id IS NOT NULL
    GROUP BY ultima.discount_rule_id`;
  const porRegla = new Map(marcas.map((m) => [m.discount_rule_id, Number(m.familias)]));
  return filas
    .map((f) => reglaDeFila(f, porRegla.get(f.id) ?? 0))
    .sort((a, b) => Number(a.retirada !== null) - Number(b.retirada !== null) || a.nombre.localeCompare(b.nombre, "es"));
}

/** La marca VIP vigente de una familia (la última), o `null` si no tiene o se le quitó. */
export async function marcaVip(tx: Transaccion, guardianId: string): Promise<{ reglaId: string; nombre: string } | null> {
  const ultima = await tx.guardianVip.findFirst({
    where: { guardianId },
    orderBy: [{ markedAt: "desc" }, { id: "desc" }],
    select: { rule: { select: { id: true, name: true } } },
  });
  return ultima?.rule ? { reglaId: ultima.rule.id, nombre: ultima.rule.name } : null;
}

/** Las marcas VIP vigentes de todas las familias: para el directorio. */
export async function marcasVip(tx: Transaccion): Promise<Map<string, { reglaId: string; nombre: string }>> {
  const filas = await tx.$queryRaw<{ guardian_id: string; rule_id: string; name: string }[]>`
    SELECT ultima.guardian_id, r.id AS rule_id, r.name FROM (
      SELECT DISTINCT ON (guardian_id) guardian_id, discount_rule_id
      FROM guardian_vip ORDER BY guardian_id, marked_at DESC, id DESC
    ) ultima
    JOIN discount_rule r ON r.id = ultima.discount_rule_id`;
  return new Map(filas.map((f) => [f.guardian_id, { reglaId: f.rule_id, nombre: f.name }]));
}

/** La marca VIP de la familia de una cuenta (por sus estancias); una mesa o el mostrador no tienen. */
export async function vipDeCuenta(tx: Transaccion, cuenta: FamilyAccountDto): Promise<{ reglaId: string; nombre: string } | null> {
  if (cuenta.kind !== "FAMILIA") return null;
  const estancia = await tx.parkSession.findFirst({ where: { accountId: cuenta.id }, select: { guardianId: true } });
  return estancia ? marcaVip(tx, estancia.guardianId) : null;
}

/** La categoría de cada producto del catálogo: el alcance «por categorías» la necesita. */
export async function categoriasDe(tx: Transaccion): Promise<CategoryOf> {
  const productos = await tx.product.findMany({ select: { id: true, category: true } });
  const porId = new Map(productos.map((p) => [p.id, p.category]));
  return (productId) => porId.get(productId) ?? null;
}
