/**
 * Ventas de ejemplo: los prepagos que las cuentas de ejemplo ya tienen
 * pagados (#1041 a #1043), para que «Ventas» no arranque vacía en la demo.
 *
 * Todos en bolívares a 228,41 Bs/$, sin IGTF: el paquete + IVA 16 %.
 */
import { VentaCerradaSchema, type VentaCerradaDto } from "@l2/contracts";

const base = (
  id: string,
  orden: number,
  cuenta: string,
  familia: string,
  closedAt: string,
  cuando: string,
  concepto: string,
  precio: { usd: string; iva: string; total: string; minor: string; bs: string },
  pago: { medio: string; detalle: string | null },
) => ({
  id,
  orderNumber: orden,
  accountId: cuenta,
  closedAt,
  cashier: { id: "u-marisol", name: "Marisol Prieto" },
  total: { minor: precio.minor, currency: "USD" },
  methods: [pago.medio],
  recibo: {
    orden: `#${orden}`,
    cuenta: familia,
    cuando,
    facturaA: "Consumidor final",
    lineas: [{ cantidad: 1, concepto, importe: precio.usd }],
    subtotal: precio.usd,
    impuestos: [{ etiqueta: "IVA 16%", monto: precio.iva }],
    total: precio.total,
    totalBs: precio.bs,
    tasa: "228,41 Bs/$",
    pagos: [{ medio: pago.medio, detalle: pago.detalle, monto: precio.bs }],
    vuelto: null,
    destinoVuelto: null,
    cajera: "Marisol Prieto",
    telefono: null,
  },
  prints: [{ at: closedAt, by: { id: "u-marisol", name: "Marisol Prieto" } }],
});

const CINCO = { usd: "$ 5.00", iva: "$ 0.80", total: "$ 5.80", minor: "580", bs: "Bs. 1.324,78" };
const TRES = { usd: "$ 3.00", iva: "$ 0.48", total: "$ 3.48", minor: "348", bs: "Bs. 794,87" };

export const DEMO_VENTAS: readonly VentaCerradaDto[] = VentaCerradaSchema.array().parse([
  base("v-1041", 1041, "c-rojas", "Ana Rojas", "2026-09-11T18:21:00.000Z", "11/09/2026 · 2:21 pm", "Paquete 1 hora · Vale", CINCO, {
    medio: "Pago Móvil",
    detalle: "Banesco · Ref. ···4821",
  }),
  base("v-1042", 1042, "c-guerrero", "Luis Guerrero", "2026-09-11T18:26:00.000Z", "11/09/2026 · 2:26 pm", "Paquete 30 minutos · Mateo", TRES, {
    medio: "Efectivo Bs",
    detalle: null,
  }),
  base("v-1043", 1043, "c-prieto", "Marisol Prieto", "2026-09-11T18:34:00.000Z", "11/09/2026 · 2:34 pm", "Paquete 1 hora · Isa", CINCO, {
    medio: "Punto débito",
    detalle: "Punto Banesco · Ref. ···0932",
  }),
]);
