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
import type { AjustesSucursalDto, CorteDto, ExcepcionDto, MoneyDto, VentaCerradaDto } from "@l2/contracts";
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

/** El recibo no fiscal de una venta (C8). `copia`: una reimpresión lo dice arriba (§5.4). */
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
  const renglones: Renglon[] = [
    ...cabecera(local),
    { tipo: "TEXTO", texto: "RECIBO NO FISCAL", alinear: "CENTRO", negrita: true },
    ...(copia ? [{ tipo: "TEXTO", texto: "*** COPIA ***", alinear: "CENTRO", negrita: true } as const] : []),
    { tipo: "TEXTO", texto: `Orden ${orden(v.orderNumber)} · ${fechaYHora(Date.parse(v.closedAt), local.formatoHora, local.zonaHoraria)}`, alinear: "CENTRO" },
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
    ...v.impuestos.map((i): Renglon => ({ tipo: "PAR", izq: `IVA ${percentFromBasisPoints(i.basisPoints)} %`, der: texto(dinero(i.tax)) })),
    ...(BigInt(v.igtf.amount.minor) > 0n ? [{ tipo: "PAR", izq: `IGTF ${percentFromBasisPoints(v.igtf.basisPoints)} %`, der: texto(dinero(v.igtf.amount)) } as const] : []),
    { tipo: "LINEA", caracter: "=" },
    { tipo: "PAR", izq: "TOTAL", der: texto(total), negrita: true, grande: true },
    ...(aBolivares && v.tasa
      ? [{ tipo: "PAR", izq: `En Bs. a ${tasaVE(v.tasa.value)}`, der: texto(convert(total, aBolivares)) } as const]
      : []),
    { tipo: "LINEA" },
    ...v.payments.flatMap((p): Renglon[] => [
      { tipo: "PAR", izq: p.label, der: texto(dinero(p.paid)) },
      ...(p.referencia ? [{ tipo: "TEXTO", texto: `  ${p.referencia}` } as const] : []),
    ]),
    ...(v.sobra ? [{ tipo: "PAR", izq: DESTINO[v.sobra.destino] ?? "Vuelto", der: texto(dinero(v.sobra.amount)) } as const] : []),
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
  impresora: Readonly<{ nombre: string; ip: string; puerto: number; ancho: Ancho }>,
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
      { tipo: "PAR", izq: "Dirección", der: `${impresora.ip}:${impresora.puerto}` },
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

/**
 * La comanda de un pedido (B6-2, ADR-022): la mesa en grande, el número de la comanda, cuándo y quién, y
 * cada plato con su cantidad y su nota. `copia`: una reimpresión lo dice arriba, para que la cocina no
 * prepare dos veces lo mismo.
 */
export function documentoDeComanda(
  p: Readonly<{ numero: number; mesa: string; enviadoEn: number; enviadoPor: string; lineas: readonly Readonly<{ nombre: string; cantidad: number; nota: string | null }>[] }>,
  local: AjustesSucursalDto,
  copia: boolean,
): Documento {
  const renglones: Renglon[] = [
    ...(copia ? [{ tipo: "TEXTO", texto: "REIMPRESIÓN · NO PREPARAR DOS VECES", alinear: "CENTRO", negrita: true } as const] : []),
    { tipo: "TEXTO", texto: `MESA ${p.mesa}`, alinear: "CENTRO", negrita: true, grande: true },
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

