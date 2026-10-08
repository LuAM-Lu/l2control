/**
 * El informe de las deudas de clientes — B11-4 (M-33).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`). En un periodo de días del local:
 *  · el resumen: lo que quedó en deuda (marcado en el periodo), lo recuperado y lo perdido en el periodo (por el día en
 *    que se cobró o se dio por perdido) y lo que seguía pendiente al terminar;
 *  · por mesero, atribuido al que sentó al cliente (el que abrió la cuenta y pidió sus datos; en el mostrador, la cajera
 *    que la dejó pendiente), con cómo terminaron;
 *  · por quien autorizó: las que dejó en deuda con su PIN y las que dio por perdidas;
 *  · cada deuda que se marcó o terminó en el periodo, con su historia: quién lo sentó, cada pedido (quién lo tomó, qué y
 *    si se marcó servido), «se fue sin pagar» (quién y quién autorizó), su paso por la caja y cómo terminó.
 * Todo sale de los asientos (la cuenta, sus pedidos, la deuda y su desenlace). El cliente, con su cédula y su teléfono
 * completos (M-33): el informe es para cobrarle.
 */
import {
  ConsultaDeDeudasSchema,
  InformeDeDeudasSchema,
  problemasDe,
  type FamilyAccountDto,
  type InformeDeDeudasDto,
  type MoneyDto,
  type PasoDeDeudaDto,
  type Rechazo,
  type Resultado,
  type ResumenDeDeudasDto,
} from "@l2/contracts";
import { chargeableLines } from "@l2/domain-cash";
import { addDays, calendarDay, startOfDay } from "@l2/domain-rates";
import type { Base, Transaccion } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { vigenteDe } from "../caja/cuentas.ts";

const USD = (minor: bigint) => ({ minor: String(minor), currency: "USD" as const });
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

/** Dónde se consumió: «Mesa 2», «De pie» o «Mostrador». */
const lugarDe = (c: Pick<FamilyAccountDto, "kind" | "tableLabel" | "dePie">) => (c.kind === "MESA" ? `Mesa ${c.tableLabel ?? "?"}` : c.dePie ? "De pie" : "Mostrador");

/** Los días de calendario del local entre dos instantes: 0 si es el mismo día. */
const diasEntre = (desde: Date, hasta: Date, zona: string) =>
  Math.max(0, Math.round((Date.parse(calendarDay(hasta.toISOString(), zona)) - Date.parse(calendarDay(desde.toISOString(), zona))) / 86_400_000));

/** Lo que suman unas líneas de la cuenta (en dólares). */
const sumaDe = (lineas: readonly { amount: { minor: string } }[]) => USD(lineas.reduce((n, l) => n + BigInt(l.amount.minor), 0n));

/** «2 × Tequeños, 1 × Refresco»: lo consumido, agrupado por concepto. */
function loConsumido(lineas: readonly { concept: string }[]): string {
  const n = new Map<string, number>();
  for (const l of lineas) n.set(l.concept, (n.get(l.concept) ?? 0) + 1);
  return [...n].map(([c, k]) => `${k} × ${c}`).join(", ");
}

/** El resumen de las deudas de una sucursal en [inicio, fin): lo usa este informe y el de ventas. */
export async function resumenDeDeudas(tx: Transaccion, branchId: string, inicio: Date, fin: Date): Promise<ResumenDeDeudasDto> {
  const filas = await tx.customerDebt.findMany({ where: { branchId, markedAt: { lt: fin } }, select: { amountMinor: true, markedAt: true, outcome: { select: { kind: true, at: true } } } });
  const cuanto = (xs: readonly { amountMinor: bigint }[]) => ({ cantidad: xs.length, monto: USD(xs.reduce((n, x) => n + x.amountMinor, 0n)) });
  const enPeriodo = (d: Date) => d >= inicio && d < fin;
  return {
    quedaron: cuanto(filas.filter((f) => enPeriodo(f.markedAt))),
    recuperado: cuanto(filas.filter((f) => f.outcome?.kind === "COBRADA" && enPeriodo(f.outcome.at))),
    perdido: cuanto(filas.filter((f) => f.outcome?.kind === "PERDIDA" && enPeriodo(f.outcome.at))),
    pendienteAlTerminar: cuanto(filas.filter((f) => !f.outcome || f.outcome.at >= fin)),
  };
}

export interface CasosInformeDeDeudas {
  /** Las deudas de clientes de un periodo (`ConsultaDeDeudasSchema`): resumen, por mesero, por quien autorizó y cada una. */
  deudas(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDeDeudasDto>>;
}

export function casosInformeDeDeudas(base: Base): CasosInformeDeDeudas {
  return {
    async deudas(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDeDeudasSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "El informe no se pudo pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<InformeDeDeudasDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const inicio = new Date(startOfDay(q.desde, ajustes.zonaHoraria));
        const fin = new Date(startOfDay(addDays(q.hasta, 1), ajustes.zonaHoraria));
        const enPeriodo = { gte: inicio, lt: fin };

        // Las deudas que se marcaron o terminaron en el periodo.
        const filas = await tx.customerDebt.findMany({
          where: { branchId: ctx.branchId, OR: [{ markedAt: enPeriodo }, { outcome: { at: enPeriodo } }] },
          include: { outcome: true, collections: { orderBy: { createdAt: "asc" } }, account: { select: { orderNumber: true, openedAt: true, openedByName: true } } },
          orderBy: [{ markedAt: "asc" }, { id: "asc" }],
        });

        // Quién devolvió una deuda a pendientes (su asiento nombra a la persona por su id).
        const devoluciones = await tx.auditEntry.findMany({
          where: { action: "deuda.devolver", entityId: { in: filas.map((f) => f.id) } },
          select: { entityId: true, occurredAt: true, actorId: true },
        });
        const actores = new Map(
          (await tx.staffUser.findMany({ where: { id: { in: devoluciones.map((d) => d.actorId).filter((x): x is string => x !== null) } }, select: { id: true, fullName: true } })).map((u) => [u.id, u.fullName]),
        );
        // Las cuentas con que se cobraron (su número de orden).
        const cobros = new Map(
          (await tx.account.findMany({ where: { id: { in: filas.flatMap((f) => f.collections.map((c) => c.accountId)) } }, select: { id: true, orderNumber: true } })).map((a) => [a.id, a.orderNumber]),
        );
        // Con qué y en qué turno se cobraron las que se cobraron: la venta de su cobro.
        const ventas = await tx.sale.findMany({
          where: { OR: filas.flatMap((f) => (f.outcome?.kind === "COBRADA" && f.outcome.accountId && f.outcome.operationKey ? [{ accountId: f.outcome.accountId, operationKey: f.outcome.operationKey }] : [])) },
          select: { accountId: true, operationKey: true, totalMinor: true, currency: true, content: true, shift: { select: { openedByName: true, pointLabel: true } } },
        });
        const ventaDe = (accountId: string | null, operationKey: string | null) => ventas.find((v) => v.accountId === accountId && v.operationKey === operationKey);

        const deudas: InformeDeDeudasDto["deudas"] = [];
        for (const f of filas) {
          const vigente = await vigenteDe(tx, f.accountId);
          const cuenta = vigente?.cuenta;
          const lugar = cuenta ? lugarDe(cuenta) : "?";
          const historia: PasoDeDeudaDto[] = [];
          const pedidos = await tx.kitchenOrder.findMany({ where: { accountId: f.accountId }, include: { served: true }, orderBy: { createdAt: "asc" } });
          if (cuenta && (cuenta.kind === "MESA" || cuenta.dePie)) {
            historia.push({
              en: f.account.openedAt.toISOString(),
              que: "SENTADO",
              quien: f.account.openedByName,
              detalle: `${lugar}${cuenta.comensales ? ` · ${cuenta.comensales} ${cuenta.comensales === 1 ? "persona" : "personas"}` : ""}`,
            });
          } else {
            historia.push({
              en: f.account.openedAt.toISOString(),
              que: "VENTA",
              quien: f.account.openedByName,
              detalle: `Venta del mostrador${cuenta ? `: ${loConsumido(chargeableLines(cuenta))}` : ""}`,
              ...(cuenta ? { monto: sumaDe(chargeableLines(cuenta)) } : {}),
            });
          }
          for (const ped of pedidos) {
            const items = (ped.items as unknown as readonly { nombre: string; cantidad: number }[]).map((i) => `${i.cantidad} × ${i.nombre}`).join(", ");
            const delPedido = cuenta ? chargeableLines(cuenta).filter((l) => l.orderId === ped.id) : [];
            historia.push({
              en: ped.createdAt.toISOString(),
              que: "PEDIDO",
              quien: ped.createdByName,
              detalle: `Comanda ${orden(ped.number)}: ${items}`,
              ...(delPedido.length > 0 ? { monto: sumaDe(delPedido) } : {}),
            });
            if (ped.served) historia.push({ en: ped.served.servedAt.toISOString(), que: "SERVIDO", quien: ped.served.servedName, detalle: `Comanda ${orden(ped.number)}` });
          }
          historia.push({
            en: f.markedAt.toISOString(),
            que: "SE_FUE",
            quien: f.markedByName,
            detalle: [
              f.authorizedByName && f.authorizedByName !== f.markedByName ? `autorizó ${f.authorizedByName}` : f.authorizedByName ? "con su PIN" : null,
              f.detail,
            ]
              .filter(Boolean)
              .join(" · "),
          });
          for (const c of f.collections) {
            historia.push({ en: c.createdAt.toISOString(), que: "EN_COBRO", quien: c.createdByName, detalle: `Cuenta ${orden(cobros.get(c.accountId) ?? 0)} en la caja` });
          }
          for (const d of devoluciones.filter((x) => x.entityId === f.id)) {
            historia.push({ en: d.occurredAt.toISOString(), que: "DEVUELTA", quien: (d.actorId && actores.get(d.actorId)) || "—", detalle: "Vino pero no pagó: su cobro salió de la caja" });
          }
          if (f.outcome) {
            const venta = f.outcome.kind === "COBRADA" ? ventaDe(f.outcome.accountId, f.outcome.operationKey) : undefined;
            const pagos = venta ? ((venta.content as { payments?: readonly { label: string; paid: MoneyDto }[] }).payments ?? []) : [];
            historia.push(
              f.outcome.kind === "COBRADA"
                ? {
                    en: f.outcome.at.toISOString(),
                    que: "COBRADA",
                    quien: f.outcome.byName,
                    detalle: [`Cobrada en la cuenta ${orden(cobros.get(f.outcome.accountId ?? "") ?? 0)}`, venta ? `turno de ${venta.shift.openedByName} en ${venta.shift.pointLabel}` : null].filter(Boolean).join(" · "),
                    ...(venta ? { monto: { minor: String(venta.totalMinor), currency: venta.currency as MoneyDto["currency"] }, medios: pagos.map((p) => ({ nombre: p.label, monto: p.paid })) } : {}),
                  }
                : {
                    en: f.outcome.at.toISOString(),
                    que: "PERDIDA",
                    quien: f.outcome.byName,
                    detalle: [f.outcome.authorizedByName && f.outcome.authorizedByName !== f.outcome.byName ? `autorizó ${f.outcome.authorizedByName}` : null, f.outcome.reason]
                      .filter(Boolean)
                      .join(" · "),
                  },
            );
          }
          historia.sort((a, b) => Date.parse(a.en) - Date.parse(b.en));
          deudas.push({
            id: f.id,
            orden: f.account.orderNumber,
            lugar,
            cliente: { nombre: f.fullName, cedula: f.document, telefono: f.phone, ...(f.guardianId ? { clienteId: f.guardianId } : {}) },
            monto: USD(f.amountMinor),
            estado: (f.outcome?.kind ?? "PENDIENTE") as "PENDIENTE" | "COBRADA" | "PERDIDA",
            ...(f.outcome ? {} : { diasPendiente: diasEntre(f.markedAt, new Date(ahora), ajustes.zonaHoraria) }),
            sentadoPor: f.seatedByName,
            historia,
          });
        }

        // Por mesero y por quien autorizó: lo que se marcó en el periodo (y las perdidas del periodo, por quien las dio).
        const marcadas = filas.filter((f) => f.markedAt >= inicio && f.markedAt < fin);
        const porMesero = new Map<string, { deudas: number; monto: bigint; cobradas: number; perdidas: number; pendientes: number }>();
        for (const f of marcadas) {
          const m = porMesero.get(f.seatedByName) ?? { deudas: 0, monto: 0n, cobradas: 0, perdidas: 0, pendientes: 0 };
          m.deudas++;
          m.monto += f.amountMinor;
          if (f.outcome?.kind === "COBRADA") m.cobradas++;
          else if (f.outcome?.kind === "PERDIDA") m.perdidas++;
          else m.pendientes++;
          porMesero.set(f.seatedByName, m);
        }
        const porAutorizador = new Map<string, { marcadas: number; monto: bigint; perdidas: number }>();
        const de = (n: string) => porAutorizador.get(n) ?? { marcadas: 0, monto: 0n, perdidas: 0 };
        for (const f of marcadas) {
          const n = f.authorizedByName ?? f.markedByName;
          const a = de(n);
          a.marcadas++;
          a.monto += f.amountMinor;
          porAutorizador.set(n, a);
        }
        for (const f of filas) {
          if (f.outcome?.kind !== "PERDIDA" || f.outcome.at < inicio || f.outcome.at >= fin) continue;
          const n = f.outcome.authorizedByName ?? f.outcome.byName;
          const a = de(n);
          a.perdidas++;
          porAutorizador.set(n, a);
        }

        return InformeDeDeudasSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          resumen: await resumenDeDeudas(tx, ctx.branchId, inicio, fin),
          porMesero: [...porMesero]
            .sort((a, b) => (b[1].monto > a[1].monto ? 1 : b[1].monto < a[1].monto ? -1 : a[0].localeCompare(b[0], "es")))
            .map(([nombre, m]) => ({ nombre, deudas: m.deudas, monto: USD(m.monto), cobradas: m.cobradas, perdidas: m.perdidas, pendientes: m.pendientes })),
          porAutorizador: [...porAutorizador]
            .sort((a, b) => b[1].marcadas + b[1].perdidas - (a[1].marcadas + a[1].perdidas) || a[0].localeCompare(b[0], "es"))
            .map(([nombre, a]) => ({ nombre, marcadas: a.marcadas, monto: USD(a.monto), perdidas: a.perdidas })),
          deudas,
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
