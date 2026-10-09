/**
 * El recibo en papel dice lo que pasó en la caja (B3-12, M-34): una batería de cobros (mixto en dólares y bolívares,
 * con vuelto, con la tasa, descuento con el IVA incluido, cortesía y cuenta dividida) y, en cada uno, que lo pagado
 * menos el vuelto da el total y que cada cosa sale en su renglón.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { VentaCerradaDto } from "@l2/contracts";
import { cuentasDelCobro } from "@l2/domain-cash";
import { comoTexto } from "@l2/domain-printing";
import { money, type CurrencyCode } from "@l2/domain-money";
import { ajustesDeFabrica } from "../sucursal/ajustes.ts";
import { documentoDeRecibo } from "./plantillas.ts";

const local = ajustesDeFabrica("Abby Kingdom");
const usd = (minor: string) => ({ minor, currency: "USD" as const });
const bs = (minor: string) => ({ minor, currency: "VES" as const });
const TASA = { id: "tasa-1", value: "874.73" };

type Pago = VentaCerradaDto["payments"][number];
const efectivo = (minor: string): Pago => ({ methodCode: "EFECTIVO_USD", label: "Efectivo $", cash: true, dataKind: null, paid: usd(minor), refundable: usd(minor), referencia: null });
const pagoMovil = (minor: string): Pago => ({ methodCode: "PAGO_MOVIL", label: "Pago Móvil", cash: false, dataKind: "PAGO_MOVIL", paid: bs(minor), refundable: bs(minor), referencia: "Ref. ****1234" });

function venta(v: Partial<VentaCerradaDto>): VentaCerradaDto {
  return {
    id: "venta-1",
    orderNumber: 42,
    accountId: "cuenta-1",
    cobroKey: "0199a0c0-0000-7000-8000-000000000042",
    closedAt: "2026-10-08T18:55:00.000Z",
    businessDate: "2026-10-08",
    cashier: "Marisol Prieto",
    cuenta: { kind: "MOSTRADOR", family: "Venta de mostrador", tableLabel: null },
    parte: null,
    cliente: { kind: "CONSUMIDOR_FINAL" },
    lineas: [{ lineId: "l1", concept: "Jugo natural", amount: usd("500"), cortesia: null }],
    subtotal: usd("500"),
    descuento: null,
    impuestos: [{ basisPoints: 1600, tax: usd("80") }],
    ivaIncluido: false,
    igtf: { basisPoints: 0, amount: usd("0") },
    total: usd("580"),
    tasa: null,
    payments: [efectivo("580")],
    sobra: null,
    prints: [],
    voided: null,
    ...v,
  } as VentaCerradaDto;
}

/** El papel a 80 mm, y si cuadra: lo pagado menos lo de más es el total. */
function imprimir(v: VentaCerradaDto) {
  const texto = comoTexto(documentoDeRecibo(v, local, false), 80);
  const a = (m: { minor: string; currency: string }) => money(BigInt(m.minor), m.currency as CurrencyCode);
  const c = cuentasDelCobro({
    total: a(v.total),
    pagos: v.payments.map((p) => ({ medio: p.label, pagado: a(p.paid), referencia: p.referencia })),
    sobra: v.sobra ? { monto: a(v.sobra.amount), destino: v.sobra.destino } : null,
    aBolivares: null,
    ...(v.tasa ? { aBolivares: { from: "USD" as const, to: "VES" as const, numerator: 100n, denominator: 87_473n } } : {}),
  });
  return { texto, renglones: texto.split("\n").map((r) => r.replace(/\s+/g, " ").trim()), cuadra: c.diferencia.amount === 0n };
}

describe("el recibo en papel dice lo que pasó en la caja (B3-12)", () => {
  test("un pago exacto: sin «Pagado» de más", () => {
    const r = imprimir(venta({}));
    assert.ok(r.cuadra);
    assert.ok(r.renglones.includes("Efectivo $ $ 5.80"));
    assert.ok(!r.renglones.some((x) => x.startsWith("Pagado")));
  });

  test("en efectivo con vuelto: lo entregado, «Pagado» y el vuelto", () => {
    const r = imprimir(venta({ payments: [efectivo("5000")], sobra: { amount: usd("4420"), destino: "VUELTO" } }));
    assert.ok(r.cuadra);
    assert.ok(r.renglones.includes("Efectivo $ $ 50.00"));
    assert.ok(r.renglones.includes("Pagado $ 50.00"));
    assert.ok(r.renglones.includes("Vuelto entregado $ 44.20"));
  });

  test("mixto en dólares y bolívares: el pago en bolívares con su equivalente, y el total pagado", () => {
    const r = imprimir(
      venta({
        lineas: [{ lineId: "l1", concept: "Paquete 1 hora", amount: usd("1000"), cortesia: null }],
        subtotal: usd("1000"),
        impuestos: [{ basisPoints: 1600, tax: usd("160") }],
        total: usd("1160"),
        tasa: TASA,
        payments: [efectivo("1000"), pagoMovil("139957")],
      }),
    );
    assert.ok(r.cuadra);
    assert.ok(r.renglones.includes("Pago Móvil Bs. 1.399,57"), r.texto);
    assert.ok(r.renglones.includes("Ref. ****1234 = $ 1.60"), r.texto);
    assert.ok(r.renglones.includes("Pagado $ 11.60"), r.texto);
    assert.ok(r.renglones.some((x) => /^En Bs\. a 874,73 Bs\. 10\.146,87$/.test(x)), r.texto);
  });

  test("con la tasa del cobro, el vuelto también en bolívares", () => {
    const r = imprimir(venta({ tasa: TASA, payments: [efectivo("1000")], sobra: { amount: usd("420"), destino: "VUELTO" } }));
    assert.ok(r.cuadra);
    assert.ok(r.renglones.includes("Vuelto entregado $ 4.20"));
    assert.ok(r.renglones.includes("en bolívares Bs. 3.673,87"), r.texto);
  });

  test("descuento con el IVA incluido: el descuento antes del IVA y el IVA dicho, no sumado", () => {
    const r = imprimir(
      venta({
        lineas: [{ lineId: "l1", concept: "Hamburguesa", amount: usd("1000"), cortesia: null }],
        subtotal: usd("1000"),
        descuento: { nombre: "VIP 10 %", valor: { tipo: "PORCENTAJE", basisPoints: 1000 }, importe: usd("100") } as never,
        impuestos: [{ basisPoints: 1600, tax: usd("124") }],
        ivaIncluido: true,
        total: usd("900"),
        payments: [efectivo("900")],
      }),
    );
    assert.ok(r.cuadra);
    assert.ok(r.renglones.some((x) => x.startsWith("Descuento · VIP 10 %") && x.endsWith("- $ 1.00")), r.texto);
    assert.ok(r.renglones.includes("IVA 16 % (incluido) $ 1.24"), r.texto);
  });

  test("cortesía y cuenta dividida: lo regalado en cero y la parte que se cobra", () => {
    const r = imprimir(
      venta({
        parte: { n: 2, de: 3 },
        lineas: [
          { lineId: "l1", concept: "Refresco", amount: usd("200"), cortesia: null },
          { lineId: "l2", concept: "Tequeños", amount: usd("450"), cortesia: "INVITACION" },
        ],
        subtotal: usd("200"),
        impuestos: [{ basisPoints: 1600, tax: usd("32") }],
        total: usd("232"),
        payments: [efectivo("232")],
      }),
    );
    assert.ok(r.cuadra);
    assert.ok(r.renglones.includes("Parte 2 de 3"));
    assert.ok(r.renglones.includes("1 × Tequeños (cortesía, invitación) 0.00"), r.texto);
  });
});
