/**
 * El recibo del cobro — UX-MEJORAS §9, C8.
 *
 * **No es la factura.** La factura fiscal la emite la máquina fiscal con su
 * propia serie (F3, DEC-1). Esto es el comprobante que se le da al cliente en
 * la mano o por WhatsApp, y lo dice arriba en grande para que nadie lo
 * confunda.
 *
 * Se toma como FOTO en el instante de cerrar el cobro: con los textos ya
 * formateados. Si después cambia una tasa o un precio, el recibo sigue
 * diciendo lo que se cobró.
 *
 * ⚠ §7.6: las referencias de pago y el documento del cliente van
 * enmascarados. Un recibo viaja por WhatsApp y se reenvía.
 */
import { TelefonoVeSchema, type ReciboDto } from "@l2/contracts";

/** La forma vive en el contrato (`ReciboSchema`): la guarda «Ventas» y la valida al cargar. */
export type Recibo = ReciboDto;

/** El recibo como texto de WhatsApp: corto, con negritas de WhatsApp y sin datos sensibles. */
export function textoRecibo(r: Recibo, copia = false): string {
  const renglones = [
    `*Abby Kingdom* · Recibo no fiscal${copia ? " · COPIA" : ""}`,
    `Orden ${r.orden} · ${r.cuando}`,
    `Factura a: ${r.facturaA}`,
    "",
    ...r.lineas.map((l) => `${l.cantidad} × ${l.concepto} — ${l.importe}`),
    "",
    `Subtotal: ${r.subtotal}`,
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
