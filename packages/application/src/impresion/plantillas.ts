/**
 * Lo que sale en el papel — B5-2, F1-12, JORNADA §5.
 *
 * Cada plantilla arma el documento de `@l2/domain-printing` desde lo que ya guardó el servidor: el
 * recibo desde la VENTA (la foto del cobro, no la pantalla), el ticket de corte desde el CORTE sellado y
 * la prueba desde la impresora. Dicen lo mismo que la pantalla (`recibo.ts` de la caja): los importes a
 * la venezolana, la tasa con dos decimales y la hora en el formato y la zona del local.
 *
 * La comanda sale del PEDIDO del mesero (B6-2, ADR-022): la mesa en grande, el número que se canta y
 * lo pedido con su nota, sin precios (en la cocina no hacen falta).
 *
 * ⚠ §7.6: las referencias de pago y el documento del cliente llegan enmascarados desde la venta.
 */
import type { AjustesSucursalDto, CorteDto, DevolucionDeVentaDto, ExcepcionDto, MoneyDto, VentaCerradaDto } from "@l2/contracts";
import { cuentasDelCobro } from "@l2/domain-cash";
import { convert, invertRate, money, multiply, type CurrencyCode, type Money } from "@l2/domain-money";
import { frozenRateOf } from "@l2/domain-rates";
import { percentFromBasisPoints } from "@l2/domain-tax";
import { COLUMNAS, fechaYHora, importeVE, tasaVE, type Ancho, type Documento, type Renglon } from "@l2/domain-printing";

const dinero = (m: MoneyDto): Money => money(BigInt(m.minor), m.currency as CurrencyCode);
const texto = (m: Money) => importeVE(m.amount, m.currency);
const orden = (n: number) => `#${String(n).padStart(4, "0")}`;

const MOTIVO_CORTESIA: Readonly<Record<string, string>> = {
  INVITACION: "invitación",
  ERROR_DE_COCINA: "error de cocina",
  CONSUMO_DE_PERSONAL: "consumo de personal",
  OTRO: "otro",
};
const DESTINO: Readonly<Record<string, string>> = { VUELTO: "Vuelto entregado", PROPINA: "Propina", RESIDUO: "Redondeo a caja" };

/** Nombre, RIF y dirección del local, si los declaró (B4-4). */
function cabecera(local: AjustesSucursalDto): Renglon[] {
  return [
    { tipo: "TEXTO", texto: local.nombre, alinear: "CENTRO", negrita: true, grande: true },
    ...(local.rif ? [{ tipo: "TEXTO", texto: `RIF ${local.rif}`, alinear: "CENTRO" } as const] : []),
    ...(local.direccionFiscal ? [{ tipo: "TEXTO", texto: local.direccionFiscal, alinear: "CENTRO" } as const] : []),
  ];
}

/**
 * El recibo no fiscal de una venta (C8). `copia`: una reimpresión lo dice arriba (§5.4).
 *
 * Los pagos dicen lo que pasó en la caja (B3-12): cada uno en su moneda y, si no es en dólares, su equivalente a la
 * tasa del cobro; «Pagado», si hubo más de uno, otra moneda o algo de más; y el vuelto también en bolívares. Las
 * cuentas las hace `cuentasDelCobro` (`@l2/domain-cash`), la misma que usa el recibo de la pantalla.
 */
/**
 * El comprobante de una devolución (B3-14, M-34): de qué venta, qué volvió y a dónde (estante o merma), lo que se devolvió
 * con su descuento, IVA e IGTF, y por qué pago, con la referencia enmascarada. Quién y quién autorizó.
 */
export function documentoDeDevolucion(v: VentaCerradaDto, d: DevolucionDeVentaDto, local: AjustesSucursalDto): Documento {
  const filas = new Map<string, { cantidad: number; concepto: string; precio: Money; destino: string }>();
  for (const l of d.lineas) {
    const clave = `${l.concept}|${l.amount.minor}|${l.destino}`;
    const f = filas.get(clave);
    if (f) f.cantidad += 1;
    else filas.set(clave, { cantidad: 1, concepto: l.concept, precio: dinero(l.amount), destino: l.destino === "ESTANTE" ? "al estante" : "a merma" });
  }
  const renglones: Renglon[] = [
    ...cabecera(local),
    { tipo: "TEXTO", texto: "DEVOLUCIÓN", alinear: "CENTRO", negrita: true },
    { tipo: "TEXTO", texto: `De la orden ${orden(v.orderNumber)}`, alinear: "CENTRO", negrita: true },
    { tipo: "TEXTO", texto: fechaYHora(Date.parse(d.at), local.formatoHora, local.zonaHoraria), alinear: "CENTRO" },
    { tipo: "TEXTO", texto: `Factura a: ${v.cliente.kind === "CONSUMIDOR_FINAL" ? "Consumidor final" : `${v.cliente.name} · ${v.cliente.document}`}` },
    { tipo: "LINEA" },
    ...[...filas.values()].flatMap((f): Renglon[] => [
      { tipo: "PAR", izq: `${f.cantidad} × ${f.concepto}`, der: texto(multiply(f.precio, BigInt(f.cantidad))) },
      { tipo: "TEXTO", texto: `  ${f.destino}` },
    ]),
    { tipo: "LINEA" },
    ...(BigInt(d.descuento.minor) > 0n ? [{ tipo: "PAR", izq: "Descuento", der: `- ${texto(dinero(d.descuento))}` } as const] : []),
    ...(BigInt(d.iva.minor) > 0n ? [{ tipo: "PAR", izq: "IVA", der: texto(dinero(d.iva)) } as const] : []),
    ...(BigInt(d.igtf.minor) > 0n ? [{ tipo: "PAR", izq: "IGTF", der: texto(dinero(d.igtf)) } as const] : []),
    { tipo: "LINEA", caracter: "=" },
    { tipo: "PAR", izq: "SE DEVUELVE", der: texto(dinero(d.total)), negrita: true, grande: true },
    { tipo: "LINEA" },
    ...d.reintegros.flatMap((r): Renglon[] => {
      const p = v.payments[r.paymentIndex];
      return [
        { tipo: "PAR", izq: p?.label ?? "Pago", der: texto(dinero(r.amount)) },
        ...(r.reference ? [{ tipo: "TEXTO", texto: `  Ref. ${r.reference}` } as const] : []),
      ];
    }),
    { tipo: "LINEA" },
    { tipo: "TEXTO", texto: `Motivo: ${d.motivo}` },
    { tipo: "TEXTO", texto: `Atendió: ${d.por}${d.autorizo && d.autorizo !== d.por ? ` · autorizó ${d.autorizo}` : ""}` },
  ];
  return { renglones };
}

export function documentoDeRecibo(v: VentaCerradaDto, local: AjustesSucursalDto, copia: boolean): Documento {
  const filas = new Map<string, { cantidad: number; concepto: string; precio: Money; cortesia: string | null }>();
  for (const l of v.lineas) {
    const clave = `${l.concept}|${l.amount.minor}|${l.cortesia ?? ""}`;
    const f = filas.get(clave);
    if (f) f.cantidad += 1;
    else filas.set(clave, { cantidad: 1, concepto: l.concept, precio: dinero(l.amount), cortesia: l.cortesia });
  }
  const total = dinero(v.total);
  const aBolivares = v.tasa ? invertRate(frozenRateOf({ pair: "USD/VES", value: v.tasa.value })) : null;
  const d = v.descuento;
  const cuentas = cuentasDelCobro({
    total,
    pagos: v.payments.map((p) => ({ medio: p.label, pagado: dinero(p.paid), referencia: p.referencia })),
    sobra: v.sobra ? { monto: dinero(v.sobra.amount), destino: v.sobra.destino } : null,
    aBolivares,
  });
  const renglones: Renglon[] = [
    ...cabecera(local),
    { tipo: "TEXTO", texto: "RECIBO NO FISCAL", alinear: "CENTRO", negrita: true },
    ...(copia ? [{ tipo: "TEXTO", texto: "*** COPIA ***", alinear: "CENTRO", negrita: true } as const] : []),
    // La orden y la hora, cada una en su renglón: juntas, a 58 mm partían la hora y dejaban el «pm» solo (B3-12).
    { tipo: "TEXTO", texto: `Orden ${orden(v.orderNumber)}`, alinear: "CENTRO", negrita: true },
    { tipo: "TEXTO", texto: fechaYHora(Date.parse(v.closedAt), local.formatoHora, local.zonaHoraria), alinear: "CENTRO" },
    { tipo: "TEXTO", texto: v.cuenta.kind === "MOSTRADOR" ? "Venta de mostrador" : v.cuenta.kind === "MESA" ? `Mesa ${v.cuenta.tableLabel ?? ""} · ${v.cuenta.family}` : v.cuenta.family },
    { tipo: "TEXTO", texto: `Factura a: ${v.cliente.kind === "CONSUMIDOR_FINAL" ? "Consumidor final" : `${v.cliente.name} · ${v.cliente.document}`}` },
    ...(v.parte ? [{ tipo: "TEXTO", texto: `Parte ${v.parte.n} de ${v.parte.de}`, negrita: true } as const] : []),
    { tipo: "LINEA" },
    ...[...filas.values()].map(
      (f): Renglon =>
        f.cortesia
          ? { tipo: "PAR", izq: `${f.cantidad} × ${f.concepto} (cortesía, ${MOTIVO_CORTESIA[f.cortesia] ?? f.cortesia})`, der: "0.00" }
          : { tipo: "PAR", izq: `${f.cantidad} × ${f.concepto}`, der: texto(multiply(f.precio, BigInt(f.cantidad))) },
    ),
    { tipo: "LINEA" },
    { tipo: "PAR", izq: "Subtotal", der: texto(dinero(v.subtotal)) },
    ...(d
      ? [
          {
            tipo: "PAR",
            izq: `Descuento · ${d.nombre} · ${d.valor.tipo === "PORCENTAJE" ? `${percentFromBasisPoints(d.valor.basisPoints)} %` : texto(dinero(d.valor.monto))}`,
            der: `- ${texto(dinero(d.importe))}`,
          } as const,
        ]
      : []),
    // Con los precios con IVA incluido, el IVA va dentro del total: se dice, no se suma.
    ...v.impuestos.map((i): Renglon => ({ tipo: "PAR", izq: `IVA ${percentFromBasisPoints(i.basisPoints)} %${v.ivaIncluido ? " (incluido)" : ""}`, der: texto(dinero(i.tax)) })),
    ...(BigInt(v.igtf.amount.minor) > 0n ? [{ tipo: "PAR", izq: `IGTF ${percentFromBasisPoints(v.igtf.basisPoints)} %`, der: texto(dinero(v.igtf.amount)) } as const] : []),
    { tipo: "LINEA", caracter: "=" },
    { tipo: "PAR", izq: "TOTAL", der: texto(total), negrita: true, grande: true },
    ...(aBolivares && v.tasa
      ? [{ tipo: "PAR", izq: `En Bs. a ${tasaVE(v.tasa.value)}`, der: texto(convert(total, aBolivares)) } as const]
      : []),
    { tipo: "LINEA" },
    ...cuentas.pagos.flatMap((p): Renglon[] => [
      { tipo: "PAR", izq: p.medio, der: texto(p.pagado) },
      // La referencia y, en otra moneda, lo que vale en dólares: así se suma contra el total.
      ...(p.referencia || p.enFuncional
        ? [{ tipo: "PAR", izq: `  ${p.referencia ?? ""}`, der: p.enFuncional ? `= ${texto(p.enFuncional)}` : "" } as const]
        : []),
    ]),
    ...(cuentas.diceElPagado ? [{ tipo: "PAR", izq: "Pagado", der: texto(cuentas.pagado), negrita: true } as const] : []),
    ...(cuentas.sobra
      ? [
          { tipo: "PAR", izq: DESTINO[cuentas.sobra.destino] ?? "Vuelto", der: texto(cuentas.sobra.monto) } as const,
          ...(cuentas.sobra.enBolivares ? [{ tipo: "PAR", izq: "  en bolívares", der: texto(cuentas.sobra.enBolivares) } as const] : []),
        ]
      : []),
    { tipo: "VACIO" },
    { tipo: "TEXTO", texto: `Atendió ${v.cashier}`, alinear: "CENTRO" },
    { tipo: "TEXTO", texto: "¡Gracias por visitarnos!", alinear: "CENTRO" },
    { tipo: "TEXTO", texto: "La factura la emite la máquina fiscal.", alinear: "CENTRO" },
  ];
  return { renglones };
}

const TIPO_EXCEPCION: Readonly<Record<ExcepcionDto["tipo"], string>> = {
  ANULACION: "Anulación",
  DESCUENTO: "Descuento",
  CORTESIA: "Cortesía",
  REIMPRESION: "Reimpresión",
  RESIDUO: "Redondeo",
  INCOBRABLE: "Incobrable",
  DIFERENCIA: "Diferencia",
  PAPEL: "Desde papel",
  DEVOLUCION: "Devolución",
};

/** El ticket de un corte X o Z (JORNADA §5, C5 y R4): lo vendido, por medio, la gaveta y la firma. */
export function documentoDeCorte(c: CorteDto, local: AjustesSucursalDto): Documento {
  const t = c.turno;
  const cuando = (iso: string) => fechaYHora(Date.parse(iso), local.formatoHora, local.zonaHoraria);
  const [a, m, d] = t.businessDate.split("-");
  const renglones: Renglon[] = [
    ...cabecera(local),
    { tipo: "TEXTO", texto: c.tipo === "Z" ? "CORTE Z" : "CORTE X", alinear: "CENTRO", negrita: true, grande: true },
    { tipo: "TEXTO", texto: `${t.punto} · día ${d}/${m}/${a}`, alinear: "CENTRO" },
    { tipo: "PAR", izq: "Abrió", der: `${t.abiertoPor.name}` },
    { tipo: "TEXTO", texto: cuando(t.abiertoEn), alinear: "DER" },
    { tipo: "PAR", izq: c.tipo === "Z" ? "Cerró" : "Corte", der: c.hechoPor },
    { tipo: "TEXTO", texto: cuando(c.hechoEn), alinear: "DER" },
    { tipo: "LINEA" },
    { tipo: "PAR", izq: `Ventas (${c.ventas.cantidad}${c.ventas.anuladas ? `, ${c.ventas.anuladas} anuladas` : ""})`, der: texto(dinero(c.ventas.total)), negrita: true },
    ...(BigInt(c.ventas.igtf.minor) > 0n ? [{ tipo: "PAR", izq: "IGTF retenido", der: texto(dinero(c.ventas.igtf)) } as const] : []),
    { tipo: "LINEA" },
    { tipo: "TEXTO", texto: "Por medio de pago", negrita: true },
    ...(c.porMedio.length === 0 ? [{ tipo: "TEXTO", texto: "Sin cobros" } as const] : c.porMedio.map((p): Renglon => ({ tipo: "PAR", izq: p.label, der: texto(dinero(p.neto)) }))),
  ];
  if (c.gaveta) {
    renglones.push({ tipo: "LINEA" }, { tipo: "TEXTO", texto: "Gaveta según el libro", negrita: true });
    for (const g of c.gaveta) {
      renglones.push(
        { tipo: "PAR", izq: `Fondo ${g.currency}`, der: texto(dinero(g.fondo)) },
        { tipo: "PAR", izq: "Entradas", der: texto(dinero(g.entradas)) },
        { tipo: "PAR", izq: "Salidas", der: texto(dinero(g.salidas)) },
        { tipo: "PAR", izq: "Esperado", der: texto(dinero(g.esperado)), negrita: true },
      );
    }
  }
  if (c.arqueo) {
    renglones.push({ tipo: "LINEA" }, { tipo: "TEXTO", texto: "Arqueo (a ciegas)", negrita: true });
    c.arqueo.contado.forEach((contado, i) => {
      const dif = c.arqueo!.diferencias[i];
      renglones.push({ tipo: "PAR", izq: `Contado ${contado.currency}`, der: texto(dinero(contado)) });
      if (dif) renglones.push({ tipo: "PAR", izq: BigInt(dif.minor) < 0n ? "Falta" : BigInt(dif.minor) > 0n ? "Sobra" : "Cuadra", der: texto(dinero(dif)) });
    });
  }
  if (c.cierre) {
    renglones.push(
      { tipo: "LINEA" },
      { tipo: "PAR", izq: c.cierre.tipo === "RELEVO" ? "Cierre por relevo" : "Cierre de la jornada", der: "" },
      { tipo: "PAR", izq: "Firmó", der: c.cierre.firmadoPor },
      ...(c.cierre.autorizadoPor ? [{ tipo: "PAR", izq: "Autorizó", der: c.cierre.autorizadoPor } as const] : []),
      ...(c.cierre.justificacion ? [{ tipo: "TEXTO", texto: `Justificación: ${c.cierre.justificacion}` } as const] : []),
      ...c.cierre.quedaEnGaveta.map((q): Renglon => ({ tipo: "PAR", izq: `Queda en gaveta ${q.currency}`, der: texto(dinero(q)) })),
      ...c.cierre.retirado.map((r): Renglon => ({ tipo: "PAR", izq: `Se retira ${r.currency}`, der: texto(dinero(r)) })),
    );
  }
  renglones.push({ tipo: "LINEA" }, { tipo: "TEXTO", texto: `Excepciones (${c.excepciones.length})`, negrita: true });
  for (const e of c.excepciones) {
    renglones.push({ tipo: "PAR", izq: `${TIPO_EXCEPCION[e.tipo]} · ${e.detalle}`, der: e.importe ? texto(dinero(e.importe)) : "" });
    renglones.push({ tipo: "TEXTO", texto: `  ${e.motivo}${e.autorizadoPor ? ` · autorizó ${e.autorizadoPor}` : ""}` });
  }
  renglones.push({ tipo: "VACIO" }, { tipo: "TEXTO", texto: "Firma: ______________________", alinear: "CENTRO" });
  return { renglones };
}

/** La prueba de una impresora: su nombre y dirección, las letras del español y una regla del ancho. */
export function documentoDePrueba(
  impresora: Readonly<{ nombre: string; direccion: string; ancho: Ancho }>,
  local: AjustesSucursalDto,
  ahora: number,
  quien: string,
): Documento {
  const cols = COLUMNAS[impresora.ancho];
  const regla = Array.from({ length: cols }, (_, i) => String((i + 1) % 10)).join("");
  return {
    renglones: [
      ...cabecera(local),
      { tipo: "TEXTO", texto: "PRUEBA DE IMPRESIÓN", alinear: "CENTRO", negrita: true },
      { tipo: "TEXTO", texto: fechaYHora(ahora, local.formatoHora, local.zonaHoraria), alinear: "CENTRO" },
      { tipo: "LINEA" },
      { tipo: "PAR", izq: "Impresora", der: impresora.nombre },
      { tipo: "PAR", izq: "Dirección", der: impresora.direccion },
      { tipo: "PAR", izq: "Papel", der: `${impresora.ancho} mm · ${cols} columnas` },
      { tipo: "PAR", izq: "Pidió", der: quien },
      { tipo: "LINEA" },
      { tipo: "TEXTO", texto: regla },
      { tipo: "TEXTO", texto: "Ññ áéíóú ÁÉÍÓÚ ü ¿? ¡! · Bs. $" },
      { tipo: "TEXTO", texto: "Texto en negrita", negrita: true },
      { tipo: "TEXTO", texto: "GRANDE", grande: true },
      { tipo: "VACIO" },
      { tipo: "TEXTO", texto: "Si esto se lee bien, la impresora está lista.", alinear: "CENTRO" },
    ],
  };
}

/** De dónde es un pedido (B6-7): su mesa (`null` si es de pie) y el nombre propio de su cuenta, si lo tiene. */
type Destino = Readonly<{ mesa: string | null; nombreCuenta: string | null }>;

/** «Mesa 3», «Mesa 3 · Familia Pérez» o «De pie · Sr. Luis»: cómo se nombra un pedido en una lista o un título. */
export function rotuloDePedido(f: Readonly<{ tableId: string | null; tableLabel: string; accountLabel: string | null }>): string {
  if (f.tableId === null) return `De pie · ${f.accountLabel ?? ""}`;
  return f.accountLabel ? `Mesa ${f.tableLabel} · ${f.accountLabel}` : `Mesa ${f.tableLabel}`;
}

/**
 * De qué área es un papel (B6-10) y cuál de los del pedido: «COCINA», «BARRA» en grande; «1 de 2» si el pedido sacó más
 * de uno. Sin área (un pedido de antes), nada.
 */
type AreaDelPapel = Readonly<{ area?: "COCINA" | "BARRA" | null; parte?: Readonly<{ n: number; de: number }> | null }>;

function rotuloDeArea(a: AreaDelPapel): Renglon[] {
  if (!a.area) return [];
  return [{ tipo: "TEXTO", texto: a.parte && a.parte.de > 1 ? `${a.area} · ${a.parte.n} de ${a.parte.de}` : a.area, alinear: "CENTRO", negrita: true, grande: true }];
}

/** La cabecera en grande de la comanda y del papel «ANULAR»: la mesa (o DE PIE) y, debajo, a quién va. */
function cabeceraDeMesa(d: Destino): Renglon[] {
  return [
    { tipo: "TEXTO", texto: d.mesa === null ? "DE PIE" : `MESA ${d.mesa}`, alinear: "CENTRO", negrita: true, grande: true },
    ...(d.nombreCuenta ? [{ tipo: "TEXTO", texto: d.nombreCuenta, alinear: "CENTRO", negrita: true } as const] : []),
  ];
}

/**
 * La comanda de un pedido (B6-2, ADR-022): la mesa en grande (o DE PIE) y el nombre de su cuenta si lo tiene
 * (B6-7), el número de la comanda, cuándo y quién, y cada plato con su cantidad y su nota. `copia`: una
 * reimpresión lo dice arriba, para que la cocina no prepare dos veces lo mismo.
 */
export function documentoDeComanda(
  p: Destino &
    AreaDelPapel &
    Readonly<{ numero: number; enviadoEn: number; enviadoPor: string; lineas: readonly Readonly<{ nombre: string; cantidad: number; nota: string | null }>[] }>,
  local: AjustesSucursalDto,
  copia: boolean,
): Documento {
  const renglones: Renglon[] = [
    ...(copia ? [{ tipo: "TEXTO", texto: "REIMPRESIÓN · NO PREPARAR DOS VECES", alinear: "CENTRO", negrita: true } as const] : []),
    ...rotuloDeArea(p),
    ...cabeceraDeMesa(p),
    { tipo: "TEXTO", texto: `Comanda ${orden(p.numero)}`, alinear: "CENTRO", negrita: true },
    { tipo: "TEXTO", texto: `${fechaYHora(p.enviadoEn, local.formatoHora, local.zonaHoraria)} · ${p.enviadoPor}`, alinear: "CENTRO" },
    { tipo: "LINEA", caracter: "=" },
  ];
  for (const l of p.lineas) {
    renglones.push({ tipo: "TEXTO", texto: `${l.cantidad} x ${l.nombre}`, negrita: true, grande: true });
    if (l.nota) renglones.push({ tipo: "TEXTO", texto: `   > ${l.nota}` });
  }
  const unidades = p.lineas.reduce((n, l) => n + l.cantidad, 0);
  renglones.push({ tipo: "LINEA", caracter: "=" }, { tipo: "TEXTO", texto: `${unidades} ${unidades === 1 ? "plato" : "platos"}`, alinear: "CENTRO" });
  return { renglones };
}

/**
 * El papel «ANULAR» (B6-6, M-18): sale en la impresora de comandas cuando se anulan platos ya enviados, para
 * que la cocina no los prepare (o deje de hacerlo). Lleva la mesa en grande, la comanda que corrige, cuándo,
 * quién lo autorizó y cada plato anulado con su cantidad. Sin precios, como la comanda.
 */
export function documentoDeAnulacion(
  a: Destino &
    AreaDelPapel &
    Readonly<{ numero: number; anuladoEn: number; autorizadoPor: string; motivo: string; lineas: readonly Readonly<{ nombre: string; cantidad: number }>[] }>,
  local: AjustesSucursalDto,
): Documento {
  const renglones: Renglon[] = [
    { tipo: "TEXTO", texto: "ANULAR · NO PREPARAR", alinear: "CENTRO", negrita: true, grande: true },
    ...rotuloDeArea({ area: a.area ?? null }),
    ...cabeceraDeMesa(a),
    { tipo: "TEXTO", texto: `De la comanda ${orden(a.numero)}`, alinear: "CENTRO", negrita: true },
    { tipo: "TEXTO", texto: `${fechaYHora(a.anuladoEn, local.formatoHora, local.zonaHoraria)} · ${a.autorizadoPor}`, alinear: "CENTRO" },
    { tipo: "TEXTO", texto: a.motivo, alinear: "CENTRO" },
    { tipo: "LINEA", caracter: "=" },
  ];
  for (const l of a.lineas) renglones.push({ tipo: "TEXTO", texto: `${l.cantidad} x ${l.nombre}`, negrita: true, grande: true });
  const unidades = a.lineas.reduce((n, l) => n + l.cantidad, 0);
  renglones.push({ tipo: "LINEA", caracter: "=" }, { tipo: "TEXTO", texto: `${unidades} ${unidades === 1 ? "plato anulado" : "platos anulados"}`, alinear: "CENTRO" });
  return { renglones };
}

