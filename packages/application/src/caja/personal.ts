/**
 * El consumo del personal — B3-17 (M-37).
 *
 * Lo que consume una persona del equipo se cobra con «Consumo del personal» (`cuentas.cobrar` con `personal`): firma
 * con su PIN, sale del inventario a precio normal y no entra dinero. Aquí vive lo que viene después:
 *  · quiénes pueden consumir: las personas del local en esta sucursal, sin la cuenta de soporte;
 *  · el vale, impreso para su firma (al cobrar y al reimprimirlo, como copia);
 *  · los vales de un periodo (la quincena): supervisión y administración, los de todos (`reportes.verSucursal`); cada
 *    persona, los suyos con su PIN, desde la caja.
 * Lo consumido y el total salen de la venta; su anulación (B3-18) y sus devoluciones (B3-14), también: un vale anulado
 * no cuenta, y lo devuelto se resta. Sin tope ni «descontado»: el descuento del sueldo se hace fuera del sistema.
 */
import {
  ConsultaDeValesSchema,
  ReimprimirValeCommandSchema,
  ValesDelPersonalSchema,
  ValeSchema,
  problemasDe,
  type PersonaDelLocalDto,
  type Rechazo,
  type Resultado,
  type ValeDto,
  type ValesDelPersonalDto,
} from "@l2/contracts";
import type { Base, Sale, SalePrint, SaleReturn, SaleVoid, StaffConsumption, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe, permisoEn } from "../identidad/actor.ts";
import { firmaDeLaPersona } from "../identidad/autorizacion.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeVale } from "../impresion/plantillas.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { CON_TODO, ventaDe } from "./ventas.ts";

const USD = (minor: bigint) => ({ minor: String(minor), currency: "USD" as const });
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

export interface CasosPersonal {
  /** Quiénes pueden consumir: las personas activas del local en esta sucursal, sin la cuenta de soporte. */
  personas(ctx: Contexto): Promise<Resultado<PersonaDelLocalDto[]>>;
  /**
   * Los vales de un periodo (`ConsultaDeValesSchema`): todos, con `reportes.verSucursal`; los de una persona, con su
   * PIN (`persona`), sin ver los de nadie más.
   */
  vales(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ValesDelPersonalDto>>;
  /** Reimprime un vale: sale como copia, en la impresora de recibos. */
  reimprimir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ValeDto>>;
}

const CON_LA_VENTA = { sale: { include: CON_TODO } } as const;
type ValeConVenta = StaffConsumption & { sale: Sale & { prints: SalePrint[]; voids: SaleVoid[]; returns: SaleReturn[] } };

/** Un vale en la forma del contrato: lo consumido de su venta, y lo que cuenta (sin lo devuelto; nada si se anuló). */
function valeDe(c: ValeConVenta, cifrador: Cifrador | null): ValeDto {
  const v = ventaDe(c.sale, cifrador);
  const devuelto = v.devoluciones.reduce((n, d) => n + BigInt(d.total.minor), 0n);
  const anulado = v.voided !== null;
  return ValeSchema.parse({
    id: c.id,
    saleId: c.saleId,
    orderNumber: v.orderNumber,
    dia: c.businessDate.toISOString().slice(0, 10),
    en: c.at.toISOString(),
    persona: { id: c.staffUserId, nombre: c.staffName },
    cajera: c.createdByName,
    lineas: v.lineas.map((l) => ({ concepto: l.concept, monto: l.amount, cortesia: l.cortesia !== null })),
    total: USD(c.totalMinor),
    anulado,
    devuelto: USD(devuelto),
    neto: USD(anulado ? 0n : c.totalMinor - devuelto),
  });
}

/**
 * Imprime el vale de una venta cobrada con «Consumo del personal», en la transacción de quien lo pide. Sin impresora de
 * recibos, el rechazo, sin escribir nada: el cobro se cierra igual y el vale se reimprime después.
 */
export async function imprimirValeEn(tx: Transaccion, ctx: Contexto, saleId: string, cifrador: Cifrador | null, copia: boolean, ahora: number) {
  const s = await tx.sale.findUnique({ where: { id: saleId }, include: CON_TODO });
  if (!s) return { ok: false as const, motivo: "NO_DISPONIBLE" as const, mensaje: "Esa venta no existe en esta sucursal." };
  const v = ventaDe(s, cifrador);
  return encolarEn(
    tx,
    ctx,
    { tipo: "RECIBO", titulo: `Vale ${orden(v.orderNumber)} · ${v.personal?.nombre ?? ""}`, copia, saleId: s.id, documento: documentoDeVale(v, await ajustesDe(tx, ctx.branchId), copia), para: "recibos" },
    ahora,
  );
}

export function casosPersonal(base: Base, cifrador: Cifrador | null): CasosPersonal {
  return {
    async personas(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<PersonaDelLocalDto[] | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const filas = await tx.staffUser.findMany({
          where: { active: true, supportLogin: null, pinHash: { not: null }, branches: { some: { branchId: ctx.branchId } } },
          select: { id: true, fullName: true, role: true },
          orderBy: { fullName: "asc" },
        });
        return filas.map((f) => ({ id: f.id, nombre: f.fullName, rol: f.role }));
      });
      return Array.isArray(r) ? { ok: true, valor: r } : r;
    },

    async vales(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDeValesSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "Los vales no se pudieron pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ValesDelPersonalDto | Rechazo> => {
        if (!ctx.quien?.userId) return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Entra con tu PIN para ver los vales." };
        // Los de una persona, con su PIN; los de todos, quien ve los reportes de la sucursal.
        let soloDe: string | null = null;
        if (q.persona) {
          const firmo = await firmaDeLaPersona(tx, ctx, "documento.emitir", q.persona, "Ver sus vales", ahora);
          if (!firmo.ok) return firmo;
          soloDe = firmo.id;
        } else if ((await permisoEn(tx, ctx, "reportes.verSucursal")) !== "PERMITIDO") {
          return { ok: false, motivo: "NO_PERMITIDO", mensaje: "Los vales de todos los ven supervisión y administración; los tuyos, con tu PIN." };
        }
        const filas = await tx.staffConsumption.findMany({
          where: {
            branchId: ctx.branchId,
            businessDate: { gte: new Date(`${q.desde}T00:00:00.000Z`), lte: new Date(`${q.hasta}T00:00:00.000Z`) },
            ...(soloDe ? { staffUserId: soloDe } : {}),
          },
          include: CON_LA_VENTA,
          orderBy: [{ at: "asc" }, { id: "asc" }],
        });
        const vales = filas.map((f) => valeDe(f, cifrador));
        const porPersona = new Map<string, { nombre: string; vales: number; neto: bigint }>();
        for (const x of vales) {
          const p = porPersona.get(x.persona.id) ?? { nombre: x.persona.nombre, vales: 0, neto: 0n };
          if (!x.anulado) p.vales += 1;
          p.neto += BigInt(x.neto.minor);
          porPersona.set(x.persona.id, p);
        }
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        return ValesDelPersonalSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          alcance: soloDe ? "PERSONA" : "TODOS",
          porPersona: [...porPersona]
            .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, "es"))
            .map(([id, p]) => ({ persona: { id, nombre: p.nombre }, vales: p.vales, neto: USD(p.neto) })),
          vales,
          total: USD(vales.reduce((n, x) => n + BigInt(x.neto.minor), 0n)),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async reimprimir(ctx, entrada, ahora = Date.now()) {
      const v = ReimprimirValeCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se reimprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ValeDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const c = await tx.staffConsumption.findUnique({ where: { id: v.data.valeId }, include: CON_LA_VENTA });
        if (!c || c.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Ese vale no existe en esta sucursal." };
        const impreso = await imprimirValeEn(tx, ctx, c.saleId, cifrador, true, ahora);
        if ("ok" in impreso) return impreso;
        await auditar(tx, ctx, { action: "personal.reimprimir_vale", entityType: "staff_consumption", entityId: c.id, after: { orden: c.sale.orderNumber, persona: c.staffName } });
        return valeDe(c, cifrador);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "personal.reimprimir_vale", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}
