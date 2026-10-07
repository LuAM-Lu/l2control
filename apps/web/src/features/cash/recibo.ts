/**
 * El recibo del cobro — UX-MEJORAS §9, C8.
 *
 * **No es la factura.** La factura fiscal la emite la máquina fiscal con su
 * propia serie (F3, DEC-1). Esto es el comprobante que se le da al cliente en
 * la mano o por WhatsApp, y lo dice arriba en grande para que nadie lo
 * confunda.
 *
 * Desde B3-4 lo cobrado lo guarda el servidor como FOTO del instante del cobro
 * (la venta, con sus importes y su tasa); aquí solo se escribe con el formato
 * del local. Si después cambia una tasa o un precio, el recibo sigue diciendo
 * lo que se cobró, y lo que dice no lo decide la pantalla.
 *
 * ⚠ §7.6: las referencias de pago y el documento del cliente llegan ya
 * enmascarados. Un recibo viaja por WhatsApp y se reenvía.
 */
import { TelefonoVeSchema, type AjustesSucursalDto, type MoneyDto, type ReciboDto, type VentaCerradaDto } from "@l2/contracts";
import { convert, invertRate, money, multiply, toMajor, type CurrencyCode, type Money } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { formatMoneyVE } from "@l2/ui";
import { formatClock } from "../park/time-format.ts";
import { formatTasaVE } from "./tasa-format.ts";
import { TEXTO_MOTIVO } from "./CortesiaDialog.tsx";
import { etiquetaDescuento } from "./descuentos.ts";
import { nombreDeCuenta } from "../cuentas/cuentas.ts";

/** La forma vive en el contrato (`ReciboSchema`). */
export type Recibo = ReciboDto;

const aDinero = (m: MoneyDto): Money => money(BigInt(m.minor), m.currency as CurrencyCode);
const texto = (m: Money) => formatMoneyVE(toMajor(m), m.currency);

const DESTINO: Record<NonNullable<VentaCerradaDto["sobra"]>["destino"], string> = {
  VUELTO: "Vuelto entregado",
  PROPINA: "Propina",
  RESIDUO: "Redondeo a caja",
};

/** «#0042»: como se dice y se busca un número de orden. */
export const ordenDe = (n: number) => `#${String(n).padStart(4, "0")}`;

/** «27/09/2026»: el día de un instante en la zona del local. */
const diaNumerico = (instante: number, zona: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: zona }).format(instante);

/**
 * El recibo de una venta, con los datos y el formato del local (B4-4). Las unidades iguales van en
 * una fila con su cantidad, como en el ticket de la caja; lo regalado, en la suya y marcado.
 */
export function reciboDeVenta(v: VentaCerradaDto, local: AjustesSucursalDto): Recibo {
  const cuando = Date.parse(v.closedAt);
  const filas = new Map<string, { cantidad: number; concepto: string; precio: Money; cortesia: string | null }>();
  for (const l of v.lineas) {
    const clave = `${l.concept}|${l.amount.minor}|${l.cortesia ?? ""}`;
    const f = filas.get(clave);
    if (f) f.cantidad += 1;
    else filas.set(clave, { cantidad: 1, concepto: l.concept, precio: aDinero(l.amount), cortesia: l.cortesia });
  }
  const total = aDinero(v.total);
  // El total en bolívares con la tasa congelada del cobro (ADR-005), nunca con la de hoy.
  const aBolivares = v.tasa ? invertRate(frozenRateOf({ pair: "USD/VES", value: v.tasa.value })) : null;
  const igtf = aDinero(v.igtf.amount);
  return {
    local: { nombre: local.nombre, rif: local.rif, direccion: local.direccionFiscal },
    orden: ordenDe(v.orderNumber),
    cuenta: nombreDeCuenta(v.cuenta),
    cuando: `${diaNumerico(cuando, local.zonaHoraria)} · ${formatClock(cuando, local.formatoHora, local.zonaHoraria)}`,
    facturaA: v.cliente.kind === "CONSUMIDOR_FINAL" ? "Consumidor final" : `${v.cliente.name} · ${v.cliente.document}`,
    parte: v.parte ? `Parte ${v.parte.n} de ${v.parte.de}` : null,
    lineas: [...filas.values()].map((f) => ({
      cantidad: f.cantidad,
      concepto: f.cortesia ? `Cortesía · ${TEXTO_MOTIVO[f.cortesia as keyof typeof TEXTO_MOTIVO]} · ${f.concepto}`.slice(0, 80) : f.concepto,
      importe: texto(multiply(f.precio, BigInt(f.cantidad))),
      ...(f.cortesia ? { cortesia: true } : {}),
    })),
    subtotal: texto(aDinero(v.subtotal)),
    // El descuento va antes del IVA (B3-6): el subtotal es antes de él y los impuestos, después.
    descuento: v.descuento
      ? {
          // «Descuento · Pago con Zelle · 10 %», sin repetir la palabra si el nombre ya la dice.
          etiqueta: `${/^descuento/i.test(v.descuento.nombre) ? "" : "Descuento · "}${etiquetaDescuento(v.descuento)}`.slice(0, 80),
          monto: `− ${texto(aDinero(v.descuento.importe))}`,
        }
      : null,
    impuestos: [
      // Con los precios con IVA incluido, el IVA va dentro del total: se dice, no se suma.
      ...v.impuestos.map((i) => ({ etiqueta: `IVA ${i.basisPoints / 100}%${v.ivaIncluido ? " (incluido)" : ""}`, monto: texto(aDinero(i.tax)) })),
      ...(igtf.amount > 0n ? [{ etiqueta: `IGTF ${v.igtf.basisPoints / 100}%`, monto: texto(igtf) }] : []),
    ],
    total: texto(total),
    totalBs: aBolivares ? texto(convert(total, aBolivares)) : null,
    tasa: v.tasa ? `${formatTasaVE(v.tasa.value)} Bs/$` : null,
    pagos: v.payments.map((p) => ({ medio: p.label, detalle: p.referencia, monto: texto(aDinero(p.paid)) })),
    vuelto: v.sobra ? texto(aDinero(v.sobra.amount)) : null,
    destinoVuelto: v.sobra ? DESTINO[v.sobra.destino] : null,
    cajera: v.cashier,
    // TODO(F5-03/backend): el teléfono del representante vendrá con la cuenta.
    telefono: null,
  };
}

/** El recibo como texto de WhatsApp: corto, con negritas de WhatsApp y sin datos sensibles. */
export function textoRecibo(r: Recibo, copia = false): string {
  const renglones = [
    `*${r.local.nombre}* · Recibo no fiscal${copia ? " · COPIA" : ""}`,
    ...(r.local.rif ? [`RIF ${r.local.rif}`] : []),
    `Orden ${r.orden} · ${r.cuando}`,
    ...(r.parte ? [`*${r.parte}*`] : []),
    `Factura a: ${r.facturaA}`,
    "",
    // Lo regalado va tachado, y se sabe por su bandera: leer el concepto para
    // adivinarlo se rompe el día que alguien cambia una palabra.
    ...r.lineas.map((l) =>
      l.cortesia
        ? `${l.cantidad} × ${l.concepto} — ~${l.importe}~`
        : `${l.cantidad} × ${l.concepto} — ${l.importe}`,
    ),
    "",
    `Subtotal: ${r.subtotal}`,
    ...(r.descuento ? [`${r.descuento.etiqueta}: ${r.descuento.monto}`] : []),
    ...r.impuestos.map((i) => `${i.etiqueta}: ${i.monto}`),
    `*Total: ${r.total}*${r.totalBs ? ` (${r.totalBs})` : ""}`,
    "",
    ...r.pagos.map((p) => `Pagado con ${p.medio}: ${p.monto}`),
    ...(r.vuelto ? [`${r.destinoVuelto ?? "Vuelto"}: ${r.vuelto}`] : []),
    "",
    "¡Gracias por visitarnos!",
  ];
  return renglones.join("\n");
}

/**
 * Enlace de WhatsApp para enviar el recibo desde el teléfono o el equipo de la
 * caja. Sin servidor ni API: abre WhatsApp con el mensaje escrito y la cajera
 * pulsa enviar. Devuelve `null` si el teléfono no es venezolano válido.
 */
export function enlaceWhatsApp(telefono: string, texto: string): string | null {
  const r = TelefonoVeSchema.safeParse(telefono);
  if (!r.success) return null;
  const nacional = r.data.replace(/\D/g, "").replace(/^0/, "");
  return `https://wa.me/58${nacional}?text=${encodeURIComponent(texto)}`;
}
