/**
 * Leer las deudas de clientes (B3-11, M-33): como las ve la caja, y el aviso de lo que alguien dejó sin pagar al
 * encontrarlo. Aparte del resto del módulo para que el de clientes lo use sin importarlo entero.
 */
import { DeudaSchema, type AvisoDeDeudaDto, type DeudaDto, type FamilyAccountDto } from "@l2/contracts";
import type { Transaccion } from "@l2/database";
import { vigenteDe } from "../caja/cuentas.ts";

/** Dónde se consumió, como lo dice la caja: «Mesa 2», «De pie» o «Mostrador». */
function lugarDe(c: Pick<FamilyAccountDto, "kind" | "tableLabel" | "dePie">): string {
  return c.kind === "MESA" ? `Mesa ${c.tableLabel ?? "?"}` : c.dePie ? "De pie" : "Mostrador";
}

/** ¿Está en la caja esa cuenta de cobro? Una descartada (sin líneas) o cobrada ya no. */
export const abiertaEnCaja = (c: FamilyAccountDto) => c.status === "POR_COBRAR" && c.lines.length > 0;

/** Las deudas que cumplen `where`, como las lee la caja, la más nueva primero. */
export async function deudasDonde(tx: Transaccion, where: Record<string, unknown>): Promise<DeudaDto[]> {
  const filas = await tx.customerDebt.findMany({
    where,
    include: { outcome: true, collections: { orderBy: { createdAt: "desc" } }, account: { select: { orderNumber: true } } },
    orderBy: [{ markedAt: "desc" }, { id: "desc" }],
  });
  const r: DeudaDto[] = [];
  for (const f of filas) {
    const original = await vigenteDe(tx, f.accountId);
    let enCobro: string | null = null;
    if (!f.outcome) {
      for (const c of f.collections) {
        const v = await vigenteDe(tx, c.accountId);
        if (v && abiertaEnCaja(v.cuenta)) {
          enCobro = c.accountId;
          break;
        }
      }
    }
    r.push(
      DeudaSchema.parse({
        id: f.id,
        cuentaId: f.accountId,
        orden: f.account.orderNumber,
        lugar: original ? lugarDe(original.cuenta) : "?",
        cliente: { nombre: f.fullName, cedula: f.document, telefono: f.phone, ...(f.guardianId ? { clienteId: f.guardianId } : {}) },
        monto: { minor: String(f.amountMinor), currency: f.currency },
        sentadoPor: f.seatedByName,
        marcadaEl: f.markedAt.toISOString(),
        marcadaPor: f.markedByName,
        autorizadaPor: f.authorizedByName,
        detalle: f.detail,
        estado: f.outcome ? f.outcome.kind : "PENDIENTE",
        desenlace: f.outcome
          ? {
              el: f.outcome.at.toISOString(),
              por: f.outcome.byName,
              autorizadoPor: f.outcome.authorizedByName,
              motivo: f.outcome.reason,
              cuentaCobro: f.outcome.accountId,
            }
          : null,
        enCobro,
      }),
    );
  }
  return r;
}

/**
 * Lo que un cliente dejó sin pagar y sigue pendiente, para avisarlo al encontrarlo (en la mesa o en la caja): por el
 * cliente del directorio, su cédula o su teléfono.
 */
export async function avisosDeDeuda(
  tx: Transaccion,
  quien: Readonly<{ guardianId?: string | null; documentKey?: string | null; phoneKey?: string | null }>,
): Promise<AvisoDeDeudaDto[]> {
  const o: Record<string, string>[] = [];
  if (quien.guardianId) o.push({ guardianId: quien.guardianId });
  if (quien.documentKey) o.push({ documentKey: quien.documentKey });
  if (quien.phoneKey) o.push({ phoneKey: quien.phoneKey });
  if (o.length === 0) return [];
  const deudas = await deudasDonde(tx, { OR: o, outcome: null });
  return deudas.map((d) => ({ id: d.id, orden: d.orden, lugar: d.lugar, monto: d.monto, marcadaEl: d.marcadaEl }));
}
