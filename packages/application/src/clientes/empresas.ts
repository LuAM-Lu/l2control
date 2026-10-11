/**
 * La empresa de una factura — T-23 (M-38, W-12).
 *
 * Una factura a nombre de una empresa (RIF J- o G-) lleva su razón social y su dirección fiscal: se recuerdan al
 * cobrar (solo si cambiaron) y se proponen la próxima vez que se escriba ese RIF. Una cédula es de una persona: su
 * ficha está en el directorio, no aquí. Solo agregar: la vigente es la última de su RIF.
 */
import { randomUUID } from "node:crypto";
import { EmpresaDeFacturaQuerySchema, EmpresaDeFacturaSchema, problemasDe, type EmpresaDeFacturaDto, type Resultado } from "@l2/contracts";
import { documentKey } from "@l2/domain-park";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { exigirPermiso } from "../identidad/actor.ts";

const DE_EMPRESA = /^[JG]\d{8,9}$/;

/** Anota la empresa de una factura si es nueva o cambió (dentro de la transacción del cobro). */
export async function recordarEmpresa(
  tx: Transaccion,
  ctx: Contexto,
  c: Readonly<{ document: string; name: string; fiscalAddress?: string | undefined }>,
  ahora: number,
  quien: string,
): Promise<void> {
  const key = documentKey(c.document);
  if (!key || !DE_EMPRESA.test(key)) return;
  const nombre = c.name.trim();
  const direccion = c.fiscalAddress?.trim() ? c.fiscalAddress.trim() : null;
  const ultima = await tx.invoiceCompany.findFirst({ where: { documentKey: key }, orderBy: { setAt: "desc" } });
  if (ultima && ultima.name === nombre && (ultima.fiscalAddress ?? null) === direccion) return;
  await tx.invoiceCompany.create({
    data: { id: randomUUID(), tenantId: ctx.tenantId, documentKey: key, document: c.document.trim(), name: nombre, fiscalAddress: direccion, setAt: new Date(ahora), setBy: ctx.quien?.userId ?? null, setByName: quien },
  });
}

export interface CasosEmpresas {
  /** Lo último que se facturó a ese RIF de empresa (`EmpresaDeFacturaQuerySchema`), o `null`. */
  empresa(ctx: Contexto, entrada: unknown): Promise<Resultado<EmpresaDeFacturaDto | null>>;
}

export function casosEmpresas(base: Base): CasosEmpresas {
  return {
    async empresa(ctx, entrada) {
      const v = EmpresaDeFacturaQuerySchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Ese RIF no es válido.", problemas: problemasDe(v.error) };
      const key = documentKey(v.data.documento);
      if (!key || !DE_EMPRESA.test(key)) return { ok: true, valor: null };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<EmpresaDeFacturaDto | null>> => {
        // Quien cobra pone a nombre de quién sale la factura.
        const rechazo = await exigirPermiso(tx, ctx, "documento.emitir");
        if (rechazo) return rechazo;
        const e = await tx.invoiceCompany.findFirst({ where: { documentKey: key }, orderBy: { setAt: "desc" } });
        return { ok: true, valor: e ? EmpresaDeFacturaSchema.parse({ nombre: e.name, direccion: e.fiscalAddress }) : null };
      });
    },
  };
}
