/**
 * Las ventas del turno en el servidor — B3-4, C12, DEC-24, §5.4.
 *
 * Una venta nace con cada cobro (`caja/cuentas.ts`, en su transacción) como la foto de lo cobrado.
 * Aquí se leen las del turno del equipo y se imprimen: cada impresión se anota y se audita, y la
 * segunda y las siguientes son copias (reimprimir es vector de fraude, §5.4). El recibo no fiscal se
 * reimprime sin autorización; la copia de la factura fiscal (🔐) llega con F3.
 */
import {
  ImprimirVentaCommandSchema,
  VentaCerradaSchema,
  VentasDelTurnoSchema,
  problemasDe,
  type Rechazo,
  type Resultado,
  type VentaCerradaDto,
  type VentasDelTurnoDto,
} from "@l2/contracts";
import type { Base, Sale, SalePrint, SaleVoid, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { exigirPermiso, nombreDe } from "../identidad/actor.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { turnoSinCorteDe } from "./turnos.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeRecibo } from "../impresion/plantillas.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";

export interface CasosVentas {
  /** Las ventas del turno abierto del equipo de la sesión, de la más reciente a la más antigua. */
  delTurno(ctx: Contexto): Promise<Resultado<VentasDelTurnoDto>>;
  /**
   * Imprime el recibo (`ImprimirVentaCommandSchema`): lo pone en la cola de la impresora de recibos y
   * anota la impresión (la primera es el original; las siguientes, copias). Sin impresora, no (B5-2).
   */
  imprimir(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<VentaCerradaDto>>;
}

/** Una devolución como se guarda: la referencia, solo cifrada (§7.6; la base lo impone). */
export type DevolucionGuardada = Readonly<{
  paymentIndex: number;
  via: "MISMO_MEDIO" | "EFECTIVO";
  amountMinor: string;
  currency: string;
  referenceCipher: string | null;
}>;

type VentaConTodo = Sale & { prints: SalePrint[]; voids: SaleVoid[] };

/** Cómo se lee una venta con sus impresiones y su anulación. */
export const CON_TODO = { prints: { orderBy: { printedAt: "asc" } }, voids: true } as const;

/** «···4821»: la referencia de una devolución a la vista (§7.6). */
const enmascarar = (ref: string) => `···${ref.slice(-4)}`;

/** La venta en la forma del contrato, revalidada (fail-closed): lo guardado más lo añadido. */
export function ventaDe(s: VentaConTodo, cifrador: Cifrador | null): VentaCerradaDto {
  const a = s.voids[0];
  return VentaCerradaSchema.parse({
    ...(s.content as object),
    id: s.id,
    prints: s.prints.map((p) => ({ at: p.printedAt.toISOString(), by: p.printedByName, copia: p.copy })),
    voided: a
      ? {
          at: a.voidedAt.toISOString(),
          requestedBy: a.requestedByName,
          authorizedBy: { name: a.authorizedByName, role: a.authorizedByRole },
          reason: a.reason,
          note: a.note,
          refunds: (a.refunds as DevolucionGuardada[]).map((r) => ({
            paymentIndex: r.paymentIndex,
            via: r.via,
            amount: { minor: r.amountMinor, currency: r.currency },
            reference: r.referenceCipher ? (cifrador ? enmascarar(cifrador.descifrar(r.referenceCipher)) : "Cifrada") : null,
          })),
        }
      : null,
  });
}

/** La venta de un cobro (por su clave), dentro de una transacción ya abierta. */
export async function ventaDelCobro(tx: Transaccion, cobroKey: string, cifrador: Cifrador | null): Promise<VentaCerradaDto | null> {
  // La RLS ya limita al tenant de la transacción: la clave es única dentro de él.
  const s = await tx.sale.findFirst({ where: { operationKey: cobroKey }, include: CON_TODO });
  return s ? ventaDe(s, cifrador) : null;
}

export function casosVentas(base: Base, cifrador: Cifrador | null): CasosVentas {
  return {
    async delTurno(ctx) {
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<VentasDelTurnoDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const turno = ctx.quien?.deviceId ? await turnoSinCorteDe(tx, ctx.quien.deviceId) : null;
        if (!turno) return VentasDelTurnoSchema.parse({ ventas: [] });
        const filas = await tx.sale.findMany({ where: { shiftId: turno.id }, include: CON_TODO, orderBy: [{ closedAt: "desc" }, { id: "desc" }] });
        return VentasDelTurnoSchema.parse({ ventas: filas.map((f) => ventaDe(f, cifrador)) });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async imprimir(ctx, entrada, ahora = Date.now()) {
      const v = ImprimirVentaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se imprimió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<VentaCerradaDto | Rechazo> => {
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const venta = await tx.sale.findUnique({ where: { id: v.data.saleId }, include: CON_TODO });
        if (!venta || venta.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa venta no existe en esta sucursal." };
        const copia = venta.prints.length > 0;
        const dto = ventaDe(venta, cifrador);
        const trabajo = await encolarEn(
          tx,
          ctx,
          { tipo: "RECIBO", titulo: `Recibo #${String(venta.orderNumber).padStart(4, "0")}`, copia, saleId: venta.id, documento: documentoDeRecibo(dto, await ajustesDe(tx, ctx.branchId), copia), para: "recibos" },
          ahora,
        );
        if ("ok" in trabajo) return trabajo;
        const quien = await nombreDe(tx, ctx);
        const impresion = await tx.salePrint.create({
          data: {
            tenantId: ctx.tenantId,
            saleId: venta.id,
            printedAt: new Date(ahora),
            printedBy: ctx.quien?.userId ?? null,
            printedByName: quien.nombre,
            deviceId: ctx.quien?.deviceId ?? null,
            copy: copia,
          },
        });
        await auditar(tx, ctx, {
          action: copia ? "venta.reimprimir" : "venta.imprimir",
          entityType: "sale",
          entityId: venta.id,
          after: { orderNumber: venta.orderNumber, copia, impresiones: venta.prints.length + 1 },
        });
        return ventaDe({ ...venta, prints: [...venta.prints, impresion] }, cifrador);
      });
      if ("ok" in r) {
        if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "venta.imprimir", reason: r.mensaje });
        return r;
      }
      return { ok: true, valor: r };
    },
  };
}
