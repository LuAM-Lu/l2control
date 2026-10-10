/**
 * El informe de ventas — B11-1, F9-01 (M-29).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`: administración y supervisión). Los turnos del
 * periodo (por su día de negocio, el del local) y, de cada uno, lo mismo que calcula su corte: el libro (`libroDelTurno`,
 * `porMedioDe`) y las ventas (`ventasYExcepciones`). Por eso un turno con su Z da lo mismo que su Z, y si no, el
 * cuadre lo dice. Lo cobrado se lleva a dólares asiento por asiento, con la tasa con que se cobró (ADR-005); el
 * origen de cada venta es la cuenta en que se cobró, salvo el tiempo del parque, que es del parque aunque se cobre en
 * una mesa (`repartoPorOrigen`, M-37).
 */
import {
  ConsultaDeVentasSchema,
  CorteSchema,
  InformeDeVentasSchema,
  problemasDe,
  type InformeDeVentasDto,
  type Rechazo,
  type Resultado,
} from "@l2/contracts";
import { ORIGENES_DE_VENTA, cuadreConZ, enDolaresConSuTasa, repartoPorOrigen, type OrigenDeVenta } from "@l2/domain-cash";
import { add, money, zero, type CurrencyCode, type Money } from "@l2/domain-money";
import { addDays, frozenRateOf, startOfDay } from "@l2/domain-rates";
import { resumenDeDeudas } from "./deudas.ts";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { TEXTO_ANULACION, porMedioDe, ventasYExcepciones } from "../caja/cortes.ts";
import { dinero, libroDelTurno } from "../caja/gaveta.ts";

const FUNCIONAL: CurrencyCode = "USD";
const aDinero = (x: { minor: string; currency: string }) => money(BigInt(x.minor), x.currency as CurrencyCode);
const fecha = (d: Date) => d.toISOString().slice(0, 10);

export interface CasosReportes {
  /** El informe de ventas de un periodo (`ConsultaDeVentasSchema`). */
  ventas(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<InformeDeVentasDto>>;
}

export function casosReportes(base: Base): CasosReportes {
  return {
    async ventas(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDeVentasSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "El informe no se pudo pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<InformeDeVentasDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const enPeriodo = { gte: new Date(`${q.desde}T00:00:00.000Z`), lte: new Date(`${q.hasta}T00:00:00.000Z`) };

        // Las cajeras que abrieron turno en el periodo (para el filtro), y los turnos que entran.
        const delPeriodo = await tx.cashShift.findMany({ where: { branchId: ctx.branchId, businessDate: enPeriodo }, select: { openedBy: true, openedByName: true } });
        const cajeras = [...new Map(delPeriodo.map((t) => [t.openedBy, t.openedByName])).entries()]
          .map(([id, nombre]) => ({ id, nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        const turnos = await tx.cashShift.findMany({
          where: { branchId: ctx.branchId, businessDate: enPeriodo, ...(q.cajera ? { openedBy: q.cajera } : {}) },
          include: { floats: true, cuts: { where: { kind: "Z" } } },
          orderBy: [{ businessDate: "asc" }, { openedAt: "asc" }],
        });

        type Medio = { nombre: string; moneda: CurrencyCode; cobrado: Money; vuelto: Money; neto: Money; enDolares: Money | null };
        const porMedio = new Map<string, Medio>();
        const porOrigen = new Map<OrigenDeVenta, { ventas: number; vendido: Money }>(ORIGENES_DE_VENTA.map((o) => [o, { ventas: 0, vendido: zero(FUNCIONAL) }]));
        const porCajera = new Map<string, { ventas: number; vendido: Money; anuladas: number }>();
        // El tipo de cada línea (M-37): la venta guarda su concepto e importe, y su cuenta, el tipo. Una vez por cuenta.
        const tiposDe = new Map<string, Map<string, string>>();
        const tiposDeLaCuenta = async (accountId: string) => {
          const ya = tiposDe.get(accountId);
          if (ya) return ya;
          const v = await tx.accountVersion.findFirst({ where: { accountId }, orderBy: { version: "desc" }, select: { content: true } });
          const lineas = (v?.content as { lines?: { id: string; kind?: string }[] } | undefined)?.lines ?? [];
          const m = new Map(lineas.flatMap((l) => (l.kind ? [[l.id, l.kind] as const] : [])));
          tiposDe.set(accountId, m);
          return m;
        };
        const anuladas: InformeDeVentasDto["anuladas"] = [];
        const porTurno: InformeDeVentasDto["porTurno"] = [];
        let ventas = 0;
        let vendido = zero(FUNCIONAL);
        let anulado = zero(FUNCIONAL);
        let nAnuladas = 0;
        let nDevoluciones = 0;
        let devuelto = zero(FUNCIONAL);
        let desdePapel = 0;
        let igtf = zero(FUNCIONAL);

        for (const t of turnos) {
          // Lo mismo que el corte del turno: el libro y las ventas.
          const libro = await libroDelTurno(tx, t.id);
          igtf = add(igtf, libro.igtf);
          const delTurno = await ventasYExcepciones(tx, t, t.closedAt ?? new Date(ahora));
          const medios = porMedioDe(libro);

          // Cada asiento que mueve dinero (el cobro y el vuelto), en dólares con su tasa.
          // Lo devuelto a un cliente (B3-14) va con su signo: resta de su medio.
          const asientos = await tx.payment.findMany({ where: { shiftId: t.id, kind: { in: ["COBRO", "VUELTO", "DEVOLUCION"] } }, select: { method: true, currency: true, kind: true, amountMinor: true, rateValue: true } });
          const enDolares = new Map<string, Money | null>();
          for (const a of asientos) {
            const clave = `${a.method}|${a.currency}`;
            const tasa = a.rateValue ? frozenRateOf({ pair: "USD/VES", value: a.rateValue }) : null;
            const usd = enDolaresConSuTasa(money(a.amountMinor, a.currency as CurrencyCode), tasa);
            const previo = enDolares.has(clave) ? enDolares.get(clave)! : zero(FUNCIONAL);
            enDolares.set(clave, usd === null || previo === null ? null : a.kind === "VUELTO" ? add(previo, money(-usd.amount, FUNCIONAL)) : add(previo, usd));
          }
          for (const m of medios) {
            const clave = `${m.methodCode}|${m.currency}`;
            const cobrado = aDinero(m.cobrado);
            const neto = aDinero(m.neto);
            const vuelto = money(cobrado.amount - neto.amount, cobrado.currency);
            const previo = porMedio.get(clave);
            const usd = enDolares.has(clave) ? enDolares.get(clave)! : zero(FUNCIONAL);
            porMedio.set(clave, {
              nombre: m.label,
              moneda: m.currency,
              cobrado: previo ? add(previo.cobrado, cobrado) : cobrado,
              vuelto: previo ? add(previo.vuelto, vuelto) : vuelto,
              neto: previo ? add(previo.neto, neto) : neto,
              enDolares: previo === undefined ? usd : previo.enDolares === null || usd === null ? null : add(previo.enDolares, usd),
            });
          }

          // Las ventas del turno: su origen, su cajera y las anuladas aparte.
          const filas = await tx.sale.findMany({ where: { shiftId: t.id }, include: { voids: true }, orderBy: { closedAt: "asc" } });
          for (const s of filas) {
            const c = s.content as {
              cuenta?: { kind?: "FAMILIA" | "MESA" | "MOSTRADOR" | "EVENTO"; dePie?: true };
              lineas?: { lineId: string; amount: { minor: string } }[];
            };
            const total = money(s.totalMinor, FUNCIONAL);
            const cajera = porCajera.get(s.cashierName) ?? { ventas: 0, vendido: zero(FUNCIONAL), anuladas: 0 };
            const anulada = s.voids[0];
            if (anulada) {
              nAnuladas += 1;
              anulado = add(anulado, total);
              cajera.anuladas += 1;
              anuladas.push({
                orden: s.orderNumber,
                cobradaEn: s.closedAt.toISOString(),
                anuladaEn: anulada.voidedAt.toISOString(),
                cajera: s.cashierName,
                total: dinero(total),
                motivo: `${TEXTO_ANULACION[anulada.reason] ?? anulada.reason}${anulada.note ? ` · ${anulada.note}` : ""}`,
                autorizadoPor: anulada.authorizedByName,
              });
            } else {
              ventas += 1;
              vendido = add(vendido, total);
              cajera.ventas += 1;
              cajera.vendido = add(cajera.vendido, total);
              // Una venta con parque y restaurante cuenta en los dos, cada uno con su parte del total.
              const tipos = await tiposDeLaCuenta(s.accountId);
              const reparto = repartoPorOrigen(
                { kind: c.cuenta?.kind ?? "MOSTRADOR", dePie: c.cuenta?.dePie === true },
                (c.lineas ?? []).map((l) => ({ kind: tipos.get(l.lineId), amount: money(BigInt(l.amount.minor), FUNCIONAL) })),
                total,
              );
              for (const [origen, parte] of reparto) {
                const o = porOrigen.get(origen)!;
                o.ventas += 1;
                o.vendido = add(o.vendido, parte);
              }
            }
            porCajera.set(s.cashierName, cajera);
          }
          // Lo que los clientes devolvieron en este turno (B3-14): se resta de lo vendido, y de la cajera que lo devolvió.
          for (const d of await tx.saleReturn.findMany({ where: { shiftId: t.id }, select: { totalMinor: true, requestedByName: true } })) {
            const devuelta = money(d.totalMinor, FUNCIONAL);
            nDevoluciones += 1;
            devuelto = add(devuelto, devuelta);
            vendido = add(vendido, money(-devuelta.amount, FUNCIONAL));
            const quien = porCajera.get(d.requestedByName) ?? { ventas: 0, vendido: zero(FUNCIONAL), anuladas: 0 };
            quien.vendido = add(quien.vendido, money(-devuelta.amount, FUNCIONAL));
            porCajera.set(d.requestedByName, quien);
          }
          desdePapel += delTurno.ventas.desdePapel;

          // El cuadre con su Z: lo que el corte dejó escrito contra lo que hoy dicen los asientos.
          const z = t.cuts[0];
          let cuadre: InformeDeVentasDto["porTurno"][number]["cuadre"] = { estado: "SIN_Z", diferencias: [] };
          if (z) {
            const corte = CorteSchema.parse(z.content);
            const calculado = {
              cantidad: delTurno.ventas.cantidad,
              anuladas: delTurno.ventas.anuladas,
              total: aDinero(delTurno.ventas.total),
              porMedio: new Map(medios.map((m) => [`${m.methodCode}|${m.currency}`, aDinero(m.neto)])),
            };
            const escrito = {
              cantidad: corte.ventas.cantidad,
              anuladas: corte.ventas.anuladas,
              total: aDinero(corte.ventas.total),
              porMedio: new Map(corte.porMedio.map((m) => [`${m.methodCode}|${m.currency}`, aDinero(m.neto)])),
            };
            const diferencias = cuadreConZ(calculado, escrito);
            cuadre = { estado: diferencias.length === 0 ? "CUADRA" : "NO_CUADRA", diferencias };
          }
          porTurno.push({
            id: t.id,
            dia: fecha(t.businessDate),
            punto: t.pointLabel,
            abrio: t.openedByName,
            abierto: t.openedAt.toISOString(),
            cerrado: t.closedAt?.toISOString() ?? null,
            estado: t.status as "ABIERTO" | "EN_CIERRE" | "CERRADO_Z",
            ventas: delTurno.ventas.cantidad - delTurno.ventas.anuladas,
            anuladas: delTurno.ventas.anuladas,
            vendido: delTurno.ventas.total,
            cuadre,
            // B3-9 (M-31): el turno que se abrió fuera del punto de cobro, con quién lo autorizó y por qué.
            fueraDelPunto: t.outsidePointByName && t.outsidePointReason ? { autorizadoPor: t.outsidePointByName, motivo: t.outsidePointReason } : null,
          });
        }

        const medios = [...porMedio.entries()].sort(([a], [b]) => a.localeCompare(b));
        const cobradoEnDolares = medios.reduce<Money | null>((s, [, m]) => (s === null || m.enDolares === null ? null : add(s, m.enDolares)), zero(FUNCIONAL));
        const cajera = q.cajera ? (cajeras.find((c) => c.id === q.cajera) ?? null) : null;
        // Las deudas de clientes del periodo (B11-4): lo que quedó en deuda, lo recuperado y lo perdido. No son de una caja: sin
        // filtro de cajera.
        const deudas = q.cajera
          ? null
          : await resumenDeDeudas(tx, ctx.branchId, new Date(startOfDay(q.desde, ajustes.zonaHoraria)), new Date(startOfDay(addDays(q.hasta, 1), ajustes.zonaHoraria)));
        return InformeDeVentasSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          cajera,
          resumen: {
            ventas,
            vendido: dinero(vendido),
            igtf: dinero(igtf),
            anuladas: nAnuladas,
            anulado: dinero(anulado),
            devoluciones: nDevoluciones,
            devuelto: dinero(devuelto),
            desdePapel,
            turnos: turnos.length,
            turnosSinZ: turnos.filter((t) => t.cuts.length === 0).length,
            cobradoEnDolares: cobradoEnDolares ? dinero(cobradoEnDolares) : null,
          },
          porMedio: medios.map(([clave, m]) => ({
            medio: clave.split("|")[0]!,
            nombre: m.nombre,
            moneda: m.moneda,
            cobrado: dinero(m.cobrado),
            vuelto: dinero(m.vuelto),
            neto: dinero(m.neto),
            enDolares: m.enDolares ? dinero(m.enDolares) : null,
          })),
          porOrigen: [...porOrigen.entries()].map(([origen, o]) => ({ origen, ventas: o.ventas, vendido: dinero(o.vendido) })),
          porCajera: [...porCajera.entries()]
            .map(([nombre, c]) => ({ cajera: nombre, ventas: c.ventas, vendido: dinero(c.vendido), anuladas: c.anuladas }))
            .sort((a, b) => a.cajera.localeCompare(b.cajera, "es")),
          porTurno,
          anuladas,
          cajeras,
          ...(deudas ? { deudas } : {}),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
