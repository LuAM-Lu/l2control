/**
 * Un cliente devuelve parte de lo que compró — B3-14 (M-34, S-4).
 *
 * Desde una venta (las del turno, o buscándola por su número) se eligen las líneas que vuelven (cada una, una unidad;
 * nunca una que ya volvió) y a dónde va cada una: al estante (vuelve a venderse, al costo con que salió) o a merma. Lo
 * que se devuelve lo calcula el dominio (`devolucionDe`): el descuento en proporción, el IVA recalculado por alícuota y
 * el IGTF en proporción. El dinero vuelve por los pagos que elige la caja, cada uno por su medio y en su moneda, sin
 * pasar de lo que le queda: en el libro, asientos DEVOLUCION en el turno de hoy (el efectivo, de esta gaveta). Con el
 * PIN de administración (`venta.devolver`, B3-18) y un motivo. Imprime su comprobante. Del parque, solo el paquete de un
 * niño que ya salió: entero, o lo que no usó (B3-18); el tiempo de más y los servicios no se devuelven por aquí; una
 * venta anulada o dividida en partes, tampoco. Nada se borra.
 */
import {
  BuscarVentaSchema,
  DevolucionHechaSchema,
  ParqueDeLaVentaSchema,
  type ParqueDeLaVentaDto,
  DevolverVentaCommandSchema,
  problemasDe,
  type DevolucionHechaDto,
  type Rechazo,
  type Resultado,
  type VentaCerradaDto,
} from "@l2/contracts";
import { CONSUMO_DEL_PERSONAL, cuadraLaDevolucion, devolucionDe, USDT_AT_PAR } from "@l2/domain-cash";
import { invertRate, money, type CurrencyCode, type FrozenRate, type Money } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { errorDeBase, type Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { auditar, auditarRechazo } from "../auditoria/auditar.ts";
import { esSoporte, nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import { exigirPermisoOAutorizacion } from "../identidad/autorizacion.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { devolverParteEn } from "../dinero/pagos.ts";
import { bloquearProducto } from "../inventario/existencias.ts";
import { encolarEn } from "../impresion/impresion.ts";
import { documentoDeDevolucion } from "../impresion/plantillas.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { esperadoEnGaveta } from "./gaveta.ts";
import { turnoParaCobrar } from "./turnos.ts";
import { valorDelTiempoUsado } from "../park/parque.ts";
import { CON_TODO, ventaDe, type LineaDevueltaGuardada, type ReintegroGuardado } from "./ventas.ts";

export interface CasosDevoluciones {
  /** Devuelve parte de una venta (`DevolverVentaCommandSchema`); `autorizacion`, el PIN de supervisión si hace falta. */
  devolver(ctx: Contexto, entrada: unknown, autorizacion?: unknown, ahora?: number): Promise<Resultado<DevolucionHechaDto>>;
  /** La venta más reciente con ese número de orden en la sucursal (`BuscarVentaSchema`), o `null`. */
  buscar(ctx: Contexto, entrada: unknown): Promise<Resultado<VentaCerradaDto | null>>;
  /** El tiempo del parque de una venta y lo que su niño no usó (B3-18), para devolverlo. */
  delParque(ctx: Contexto, saleId: string): Promise<Resultado<ParqueDeLaVentaDto>>;
}

const CON_PIN = { confirmarConPin: true } as const;
const invalido = (mensaje: string, path: (string | number)[], message: string): Rechazo => ({ ok: false, motivo: "INVALIDO", mensaje, problemas: [{ path, message }] });

/** La tasa del cobro de la moneda funcional a la de un pago; `null` si el pago es en la funcional. */
function desdeFuncional(moneda: string, tasa: { value: string } | null): FrozenRate | null {
  if (moneda === "USD") return null;
  if (moneda === "USDT") return invertRate(USDT_AT_PAR);
  return tasa ? invertRate(frozenRateOf({ pair: "USD/VES", value: tasa.value })) : null;
}

/** Las líneas de la cuenta tal como se cobraron: de ahí salen su tipo, su producto y su IVA. */
type LineaDeLaCuenta = { id: string; kind: string; productId?: string; taxCode?: string; sessionId?: string };

export function casosDevoluciones(base: Base, cifrador: Cifrador | null, soporteOpera = false): CasosDevoluciones {
  return {
    async buscar(ctx, entrada) {
      const v = BuscarVentaSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Escribe el número de la orden.", problemas: problemasDe(v.error) };
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<VentaCerradaDto | null>> => {
        const p = await permisoEn(tx, ctx, "venta.devolver");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const s = await tx.sale.findFirst({ where: { branchId: ctx.branchId, orderNumber: v.data.orden }, orderBy: { closedAt: "desc" }, include: CON_TODO });
        return { ok: true, valor: s ? ventaDe(s, cifrador) : null };
      });
    },

    async delParque(ctx, saleId) {
      return base.conTenant(ctx.tenantId, async (tx): Promise<Resultado<ParqueDeLaVentaDto>> => {
        const p = await permisoEn(tx, ctx, "venta.devolver");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const s = await tx.sale.findFirst({ where: { id: saleId, branchId: ctx.branchId }, select: { accountId: true, operationKey: true, content: true } });
        if (!s) return { ok: true, valor: { lineas: [] } };
        const cobro = await tx.accountVersion.findFirst({ where: { accountId: s.accountId, operationKey: s.operationKey }, select: { content: true } });
        const deLaCuenta = ((cobro?.content as { lines?: LineaDeLaCuenta[] } | undefined)?.lines ?? []).filter((l) => l.kind === "PAQUETE" && l.sessionId);
        const vendidas = new Map(((s.content as { lineas?: { lineId: string; amount: { minor: string } }[] }).lineas ?? []).map((l) => [l.lineId, BigInt(l.amount.minor)]));
        const lineas: ParqueDeLaVentaDto["lineas"] = [];
        for (const l of deLaCuenta) {
          const pagado = vendidas.get(l.id);
          if (pagado === undefined) continue;
          const valor = await valorDelTiempoUsado(tx, ctx.branchId, l.sessionId!);
          const masTiempo = deLaCuenta.filter((x) => x.sessionId === l.sessionId).length > 1;
          const noUsado = valor && !masTiempo ? pagado - valor.amount : null;
          lineas.push({ lineId: l.id, enSala: valor === null, noUsado: noUsado !== null && noUsado > 0n ? { minor: String(noUsado), currency: "USD" } : null });
        }
        return { ok: true, valor: ParqueDeLaVentaSchema.parse({ lineas }) };
      });
    },

    async devolver(ctx, entrada, autorizacion, ahora = Date.now()) {
      const v = DevolverVentaCommandSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "No se devolvió: hay datos que corregir.", problemas: problemasDe(v.error) };
      const cmd = v.data;
      const intentar = () =>
        base.conTenant(ctx.tenantId, async (tx): Promise<DevolucionHechaDto | Rechazo> => {
          const p = await permisoEn(tx, ctx, "venta.devolver");
          if (p === "DENEGADO") return rechazoDePermiso(p);
          if (!soporteOpera && (await esSoporte(tx, ctx))) {
            return { ok: false, motivo: "NO_PERMITIDO", mensaje: "La cuenta de soporte no devuelve aquí: lo hace el personal del local." };
          }
          // Un doble clic devuelve la misma devolución, sin volver a pedir el PIN.
          const previa = await tx.saleReturn.findUnique({ where: { tenantId_operationKey: { tenantId: ctx.tenantId, operationKey: cmd.idempotencyKey } } });
          if (previa) {
            if (previa.saleId !== cmd.saleId) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa clave ya se usó para otra devolución." };
            const s = await tx.sale.findUniqueOrThrow({ where: { id: previa.saleId }, include: CON_TODO });
            return DevolucionHechaSchema.parse({ venta: ventaDe(s, cifrador), comprobanteNoImpreso: null });
          }

          const s = await tx.sale.findFirst({ where: { id: cmd.saleId, branchId: ctx.branchId }, include: CON_TODO });
          if (!s) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa venta no está en esta sucursal." };
          const venta = ventaDe(s, cifrador);
          if (venta.voided) return { ok: false, motivo: "CONFLICTO", mensaje: "Esa venta se anuló: no hay nada que devolver." };
          if (venta.parte) return { ok: false, motivo: "CONFLICTO", mensaje: "Una venta cobrada en partes no se devuelve por aquí: anula su parte." };

          // Lo que ya volvió en devoluciones anteriores no vuelve otra vez.
          const yaDevueltas = new Set(venta.devoluciones.flatMap((d) => d.lineas.map((l) => l.lineId)));
          const cobro = await tx.accountVersion.findFirst({ where: { accountId: s.accountId, operationKey: s.operationKey }, select: { content: true } });
          const deLaCuenta = new Map(((cobro?.content as { lines?: LineaDeLaCuenta[] } | undefined)?.lines ?? []).map((l) => [l.id, l]));
          const tipos = new Map(
            (
              await tx.product.findMany({
                where: { id: { in: [...deLaCuenta.values()].map((l) => l.productId).filter((x): x is string => Boolean(x)) } },
                select: { id: true, kind: true, tracksStock: true },
              })
            ).map((x) => [x.id, x]),
          );
          /** De una línea, solo esta parte (B3-18): lo que un niño no usó de su paquete. */
          const parciales = new Map<string, Money>();
          for (const [i, l] of cmd.lineas.entries()) {
            const vendida = venta.lineas.find((x) => x.lineId === l.lineId);
            if (!vendida) return invalido("Esa línea no es de esta venta.", ["lineas", i, "lineId"], "LINEA_AJENA");
            if (yaDevueltas.has(l.lineId)) return invalido(`«${vendida.concept}» ya se devolvió.`, ["lineas", i, "lineId"], "YA_DEVUELTA");
            if (vendida.cortesia) return invalido(`«${vendida.concept}» fue una cortesía: no hay nada que devolver.`, ["lineas", i, "lineId"], "CORTESIA");
            const linea = deLaCuenta.get(l.lineId);
            // B3-18 (M-37 U-11, cambia M-18): el paquete que un niño pagó por adelantado, cuando ya salió: entero (un
            // problema del local) o lo que no usó, lo pagado menos lo que vale su tiempo con la regla de B4-17.
            if (linea?.kind === "PAQUETE" && linea.sessionId) {
              const valor = await valorDelTiempoUsado(tx, ctx.branchId, linea.sessionId);
              if (!valor) return invalido(`«${vendida.concept}»: el niño sigue en la sala; su tiempo se devuelve después de su salida.`, ["lineas", i, "lineId"], "NINO_EN_SALA");
              if (l.noUsado) {
                const delMismo = [...deLaCuenta.values()].filter((x) => x.kind === "PAQUETE" && x.sessionId === linea.sessionId);
                if (delMismo.length > 1) return invalido(`«${vendida.concept}» tuvo más tiempo: devuelve sus líneas enteras.`, ["lineas", i, "noUsado"], "CON_MAS_TIEMPO");
                const noUsado = BigInt(vendida.amount.minor) - valor.amount;
                if (noUsado <= 0n) return invalido(`«${vendida.concept}»: usó todo lo que pagó, no queda nada que devolver.`, ["lineas", i, "noUsado"], "USO_TODO");
                parciales.set(l.lineId, money(noUsado, "USD"));
              }
              continue;
            }
            if (l.noUsado) return invalido("«Lo que no usó» es del tiempo del parque.", ["lineas", i, "noUsado"], "NO_ES_DEL_PARQUE");
            const producto = linea?.productId ? tipos.get(linea.productId) : undefined;
            // El tiempo del parque y los servicios no se devuelven por aquí.
            if (!linea || linea.kind !== "RESTAURANTE" || !producto || producto.kind === "SERVICIO") {
              return invalido(`«${vendida.concept}» no se devuelve por aquí: el tiempo del parque y los servicios, no.`, ["lineas", i, "lineId"], "NO_SE_DEVUELVE");
            }
            if (l.destino === "ESTANTE" && !producto.tracksStock) {
              return invalido(`«${vendida.concept}» se prepara al momento: no vuelve al estante, va a merma.`, ["lineas", i, "destino"], "NO_VUELVE_AL_ESTANTE");
            }
          }

          // Lo que vuelve, con su descuento, IVA e IGTF (el dominio).
          const funcional = venta.total.currency as CurrencyCode;
          const bpGeneral = Math.max(0, ...venta.impuestos.map((x) => x.basisPoints));
          const calculo = devolucionDe(
            {
              lineas: venta.lineas.map((l) => ({
                lineId: l.lineId,
                amount: money(BigInt(l.amount.minor), funcional),
                taxBp: (l.taxCode ?? deLaCuenta.get(l.lineId)?.taxCode) === "EXENTA" ? 0 : bpGeneral,
              })),
              subtotal: money(BigInt(venta.subtotal.minor), funcional),
              descuento: money(BigInt(venta.descuento?.importe.minor ?? "0"), funcional),
              ivaIncluido: venta.ivaIncluido,
              igtf: money(BigInt(venta.igtf.amount.minor), funcional),
              total: money(BigInt(venta.total.minor), funcional),
            },
            cmd.lineas.map((l) => l.lineId),
            parciales,
          );

          // Cómo vuelve: por cada pago elegido, en su moneda, sin pasar de lo que le queda; entre todos, lo que vuelve.
          for (const [i, r] of cmd.reintegros.entries()) {
            const pago = venta.payments[r.paymentIndex];
            if (!pago) return invalido("Un reintegro apunta a un pago que no existe.", ["reintegros", i, "paymentIndex"], "PAGO_DESCONOCIDO");
            if (r.amount.currency !== pago.refundable.currency) return invalido(`${pago.label} se devuelve en su moneda.`, ["reintegros", i, "amount"], "OTRA_MONEDA");
            if (BigInt(r.amount.minor) <= 0n) return invalido("Un reintegro devuelve algo.", ["reintegros", i, "amount"], "SIN_MONTO");
            if (BigInt(r.amount.minor) > BigInt(pago.refundable.minor)) {
              return invalido(`De ${pago.label} queda menos por devolver.`, ["reintegros", i, "amount"], "MAS_DE_LO_QUE_QUEDA");
            }
            // El consumo del personal (B3-17) vuelve a su vale: no hay banco que dé una referencia.
            if (!pago.cash && pago.methodCode !== CONSUMO_DEL_PERSONAL && !r.reference) {
              return invalido(pago.dataKind === "PUNTO" ? "Escribe la aprobación de la devolución en el terminal." : "Escribe la referencia de la devolución.", ["reintegros", i, "reference"], "FALTA_LA_REFERENCIA");
            }
            if (r.reference && !pago.cash && !cifrador) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Este servidor no puede guardar referencias (falta L2_CLAVE_CIFRADO)." };
          }
          const cuadre = cuadraLaDevolucion(
            calculo.total,
            cmd.reintegros.map((r) => ({ monto: money(BigInt(r.amount.minor), r.amount.currency as CurrencyCode), desdeFuncional: desdeFuncional(r.amount.currency, venta.tasa) })),
          );
          if (!cuadre.cuadra) {
            return invalido("Lo que vuelve por los pagos no cuadra con lo que se devuelve.", ["reintegros"], `NO_CUADRA: ${cuadre.diferencia.amount}`);
          }

          // El dinero sale de la gaveta de HOY: hace falta el turno de este equipo, y el efectivo que se devuelve.
          const turno = await turnoParaCobrar(tx, ctx);
          if ("ok" in turno) return turno;
          const enEfectivo = new Map<"USD" | "VES", bigint>();
          for (const r of cmd.reintegros) {
            const pago = venta.payments[r.paymentIndex]!;
            if (pago.cash && (r.amount.currency === "USD" || r.amount.currency === "VES")) enEfectivo.set(r.amount.currency, (enEfectivo.get(r.amount.currency) ?? 0n) + BigInt(r.amount.minor));
          }
          if (enEfectivo.size > 0) {
            const hay = await esperadoEnGaveta(tx, turno.id);
            for (const [moneda, falta] of enEfectivo) {
              if ((hay.get(moneda)?.amount ?? 0n) < falta) {
                return { ok: false, motivo: "CONFLICTO", mensaje: `En la gaveta de este turno no hay ${moneda === "USD" ? "dólares" : "bolívares"} suficientes para devolverlo en efectivo.` };
              }
            }
          }

          // La autorización se comprueba y se registra ANTES de tocar el libro (§7.3).
          const permiso = await exigirPermisoOAutorizacion(tx, ctx, "venta.devolver", autorizacion, ahora, CON_PIN);
          if (!permiso.ok) return permiso;
          const quien = await nombreDe(tx, ctx);
          const autorizador = permiso.autorizadoPor ? await tx.staffUser.findUnique({ where: { id: permiso.autorizadoPor }, select: { fullName: true } }) : null;

          // El libro: cada reintegro, parte del cobro de su pago (el k-ésimo cobro del libro de esa venta).
          const cobros = await tx.payment.findMany({ where: { operationKey: s.operationKey, kind: "COBRO", reversesId: null }, orderBy: { line: "asc" } });
          for (const [i, r] of cmd.reintegros.entries()) {
            const original = cobros[r.paymentIndex];
            if (!original) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "No se encuentra en el libro el pago de esa venta." };
            await devolverParteEn(tx, ctx, {
              original,
              turno,
              operationKey: cmd.idempotencyKey,
              line: i,
              monto: BigInt(r.amount.minor),
              motivo: cmd.motivo,
              autorizadoPor: permiso.autorizadoPor,
              ahora,
            });
          }

          const lineas: LineaDevueltaGuardada[] = cmd.lineas.map((l) => {
            const vendida = venta.lineas.find((x) => x.lineId === l.lineId)!;
            const parte = parciales.get(l.lineId);
            return {
              lineId: l.lineId,
              concept: parte ? `${vendida.concept} · lo que no usó`.slice(0, 80) : vendida.concept,
              productId: deLaCuenta.get(l.lineId)?.productId ?? null,
              amount: parte ? { minor: String(parte.amount), currency: vendida.amount.currency } : vendida.amount,
              destino: l.destino,
            };
          });
          const reintegros: ReintegroGuardado[] = cmd.reintegros.map((r) => {
            const pago = venta.payments[r.paymentIndex]!;
            return { paymentIndex: r.paymentIndex, amountMinor: r.amount.minor, currency: r.amount.currency, referenceCipher: r.reference && !pago.cash ? cifrador!.cifrar(r.reference) : null };
          });
          const devolucion = await tx.saleReturn.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: ctx.branchId,
              saleId: s.id,
              shiftId: turno.id,
              operationKey: cmd.idempotencyKey,
              returnedAt: new Date(ahora),
              lines: lineas,
              subtotalMinor: calculo.base.amount,
              discountMinor: calculo.descuento.amount,
              taxMinor: calculo.iva.amount,
              igtfMinor: calculo.igtf.amount,
              totalMinor: calculo.total.amount,
              currency: funcional,
              refunds: reintegros,
              reason: cmd.motivo,
              requestedBy: ctx.quien?.userId ?? null,
              requestedByName: quien.nombre,
              authorizedBy: permiso.autorizadoPor ?? null,
              authorizedByName: autorizador?.fullName ?? null,
              deviceId: ctx.quien?.deviceId ?? null,
            },
          });

          // El estante: lo que vuelve, al costo con que salió (el promedio de lo que esa cuenta sacó de cada producto).
          const alEstante = new Map<string, number>();
          for (const l of lineas) if (l.destino === "ESTANTE" && l.productId) alEstante.set(l.productId, (alEstante.get(l.productId) ?? 0) + 1);
          for (const [productId, cantidad] of [...alEstante].sort(([a], [b]) => a.localeCompare(b))) {
            await bloquearProducto(tx, ctx.branchId, productId);
            const salio = await tx.stockMovement.aggregate({ where: { accountId: s.accountId, productId }, _sum: { quantity: true, valueMinor: true } });
            const unidades = -(salio._sum.quantity ?? 0);
            const valor = -(salio._sum.valueMinor ?? 0n);
            const valorDeVuelta = unidades > 0 && valor > 0n ? (valor * BigInt(cantidad) * 2n + BigInt(unidades)) / (2n * BigInt(unidades)) : 0n;
            await tx.stockMovement.create({
              data: {
                tenantId: ctx.tenantId,
                branchId: ctx.branchId,
                productId,
                quantity: cantidad,
                kind: "RETORNO",
                valueMinor: valorDeVuelta,
                saleReturnId: devolucion.id,
                at: new Date(ahora),
                createdBy: ctx.quien?.userId ?? null,
                createdByName: quien.nombre,
                deviceId: ctx.quien?.deviceId ?? null,
              },
            });
          }

          await auditar(tx, ctx, {
            action: "venta.devolver",
            entityType: "sale",
            entityId: s.id,
            ...(permiso.autorizadoPor ? { authorizedBy: permiso.autorizadoPor } : {}),
            reason: cmd.motivo,
            after: {
              orderNumber: s.orderNumber,
              lineas: lineas.length,
              alEstante: lineas.filter((l) => l.destino === "ESTANTE").length,
              total: { minor: String(calculo.total.amount), currency: funcional },
              reintegros: reintegros.map((r) => ({ paymentIndex: r.paymentIndex, amount: { minor: r.amountMinor, currency: r.currency } })),
            },
          });

          // El comprobante: sin impresora de recibos, la devolución se hace igual y se dice por qué no salió.
          const conTodo = await tx.sale.findUniqueOrThrow({ where: { id: s.id }, include: CON_TODO });
          const dto = ventaDe(conTodo, cifrador);
          const hecha = dto.devoluciones.find((d) => d.id === devolucion.id)!;
          const trabajo = await encolarEn(
            tx,
            ctx,
            { tipo: "RECIBO", titulo: `Devolución de la orden #${String(s.orderNumber).padStart(4, "0")}`, copia: false, saleId: s.id, documento: documentoDeDevolucion(dto, hecha, await ajustesDe(tx, ctx.branchId)), para: "recibos" },
            ahora,
          );
          return DevolucionHechaSchema.parse({ venta: dto, comprobanteNoImpreso: "ok" in trabajo ? trabajo.mensaje : null });
        });

      try {
        const r = await intentar();
        if ("ok" in r) {
          if (r.motivo === "NO_PERMITIDO") await auditarRechazo(base, ctx, { action: "venta.devolver", reason: r.mensaje });
          return r;
        }
        return { ok: true, valor: r };
      } catch (e) {
        // Dos devoluciones a la vez con la misma clave: la base deja una, y el segundo intento la devuelve.
        if (errorDeBase(e)?.motivo !== "DUPLICADO") throw e;
        const r = await intentar();
        return "ok" in r ? r : { ok: true, valor: r };
      }
    },
  };
}
