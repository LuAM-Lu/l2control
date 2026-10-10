/**
 * Movimientos: todo lo que pasó en el periodo — B11-7 (M-37, U-5).
 *
 * De solo lectura, para quien ve la sucursal (`reportes.verSucursal`). Sale de la auditoría, que ya tiene cada cosa que
 * alguien hizo con su hora, su persona, quién lo autorizó y lo esencial de lo hecho: la caja (cobros, devoluciones,
 * anulaciones, turnos), el parque (entradas, salidas, recargas), las mesas (sentar, pedidos, cerrar), el inventario y
 * el personal. Cada movimiento con su categoría, su orden, su monto, el cliente de su cuenta y su detalle; el de una
 * venta abre la venta entera (`reportes.venta`). Se busca por orden, cliente, cédula, pulsera, persona o monto.
 */
import {
  ActividadDelPeriodoSchema,
  ConsultaDeActividadSchema,
  ConsultaDeVentaSchema,
  problemasDe,
  type ActividadDelPeriodoDto,
  type CategoriaDeMovimientoDto,
  type MoneyDto,
  type MovimientoDelLocalDto,
  type Rechazo,
  type Resultado,
  type VentaCerradaDto,
} from "@l2/contracts";
import { importeVE } from "@l2/domain-printing";
import { addDays, startOfDay } from "@l2/domain-rates";
import type { Base } from "@l2/database";
import type { Contexto } from "../contexto.ts";
import { nombreDe, permisoEn, rechazoDePermiso } from "../identidad/actor.ts";
import type { Cifrador } from "../identidad/cifrado.ts";
import { ajustesDe } from "../sucursal/ajustes.ts";
import { CON_TODO, ventaDe } from "../caja/ventas.ts";

/** Hasta cuántos movimientos se devuelven: los más nuevos. Más, se afina la búsqueda. */
const MAXIMO = 1000;

type Clase = Readonly<{ categoria: CategoriaDeMovimientoDto; que: string }>;

/** Lo que entra en Movimientos y cómo se dice. Lo demás (guardar una cuenta, imprimir, ajustes) no es un movimiento. */
const ACCIONES: Readonly<Record<string, Clase>> = {
  "cuenta.cobrar": { categoria: "CAJA", que: "Cobró" },
  "cuenta.anular_cobro": { categoria: "CAJA", que: "Anuló un cobro" },
  "venta.devolver": { categoria: "CAJA", que: "Devolvió" },
  "venta.reimprimir": { categoria: "CAJA", que: "Reimprimió un recibo" },
  "pago.revertir": { categoria: "CAJA", que: "Revirtió un pago" },
  "cuenta.cortesia": { categoria: "CAJA", que: "Regaló (cortesía)" },
  "cuenta.quitar_cortesia": { categoria: "CAJA", que: "Quitó una cortesía" },
  "cuenta.descuento": { categoria: "CAJA", que: "Aplicó un descuento" },
  "cuenta.quitar_descuento": { categoria: "CAJA", que: "Quitó un descuento" },
  "cuenta.incobrable": { categoria: "CAJA", que: "Cuenta incobrable" },
  "cuenta.deuda": { categoria: "CAJA", que: "Se fue sin pagar" },
  "deuda.cobrar": { categoria: "CAJA", que: "Pasó una deuda a la caja" },
  "deuda.cobrada": { categoria: "CAJA", que: "Cobró una deuda" },
  "deuda.devolver": { categoria: "CAJA", que: "Devolvió a deudas" },
  "deuda.perder": { categoria: "CAJA", que: "Dio una deuda por perdida" },
  "cuenta.juntar": { categoria: "CAJA", que: "Juntó cuentas" },
  "cuenta.dividir": { categoria: "CAJA", que: "Dividió por ítems" },
  "cuenta.unir": { categoria: "CAJA", que: "Unió de nuevo" },
  "turno.abrir": { categoria: "CAJA", que: "Abrió la caja" },
  "turno.corte_x": { categoria: "CAJA", que: "Corte X" },
  "turno.corte_z": { categoria: "CAJA", que: "Cerró la caja (corte Z)" },
  "papel.abrir": { categoria: "CAJA", que: "Abrió una carga desde papel" },
  "papel.revisar": { categoria: "CAJA", que: "Revisó una carga desde papel" },
  "cuenta.abrir": { categoria: "CAJA", que: "Abrió una cuenta" },
  "parque.entrada": { categoria: "PARQUE", que: "Entrada al parque" },
  "parque.salida": { categoria: "PARQUE", que: "Salida del parque" },
  "parque.recarga": { categoria: "PARQUE", que: "Recarga" },
  "parque.pausar": { categoria: "PARQUE", que: "Pausa por comida" },
  "parque.reanudar": { categoria: "PARQUE", que: "Volvió de comer" },
  "parque.anular_entrada": { categoria: "PARQUE", que: "Anuló una entrada" },
  "parque.cierre_administrativo": { categoria: "PARQUE", que: "Cerró una estancia a revisar" },
  "evento.entrada": { categoria: "PARQUE", que: "Entrada de un cumpleaños" },
  "evento.reservar": { categoria: "PARQUE", que: "Reservó un cumpleaños" },
  "evento.cancelar": { categoria: "PARQUE", que: "Canceló un cumpleaños" },
  "mesa.vincular": { categoria: "MESAS", que: "Vinculó una pulsera" },
  "mesa.desvincular": { categoria: "MESAS", que: "Desvinculó una pulsera" },
  "pedido.enviar": { categoria: "MESAS", que: "Pedido" },
  "pedido.anular": { categoria: "MESAS", que: "Anuló un pedido" },
  "pedido.servir": { categoria: "MESAS", que: "Sirvió" },
  "mesa.liberar": { categoria: "MESAS", que: "Liberó la mesa" },
  "mesa.cerrar_sin_cobrar": { categoria: "MESAS", que: "Cerró la mesa sin cobrar" },
  "mesa.limpia": { categoria: "MESAS", que: "Dejó limpia la mesa" },
  "inventario.entrada": { categoria: "INVENTARIO", que: "Entrada de mercancía" },
  "inventario.anular_entrada": { categoria: "INVENTARIO", que: "Anuló una entrada" },
  "inventario.salida": { categoria: "INVENTARIO", que: "Salida de inventario" },
  "inventario.conteo": { categoria: "INVENTARIO", que: "Conteo" },
  "existencia.mover": { categoria: "INVENTARIO", que: "Movió existencia" },
  "producto.devolver": { categoria: "INVENTARIO", que: "Devolvió al estante" },
  "precio.programar": { categoria: "INVENTARIO", que: "Cambió precios" },
  "personal.consumir": { categoria: "PERSONAL", que: "Consumo del personal" },
  "personal.reimprimir_vale": { categoria: "PERSONAL", que: "Reimprimió un vale" },
  "sesion.abrir": { categoria: "PERSONAL", que: "Entró" },
  "sesion.cerrar": { categoria: "PERSONAL", que: "Salió" },
};

/** Sentar a un cliente es de las mesas; abrir una venta del mostrador, de la caja. */
function claseDe(accion: string, despues: Record<string, unknown>): Clase {
  if (accion === "cuenta.abrir" && despues.kind === "MESA") return { categoria: "MESAS", que: "Sentó a un cliente" };
  if (accion === "cuenta.abrir" && despues.kind === "MOSTRADOR") return { categoria: "CAJA", que: "Abrió una venta" };
  return ACCIONES[accion]!;
}

const esDinero = (x: unknown): x is MoneyDto => typeof x === "object" && x !== null && typeof (x as MoneyDto).minor === "string" && typeof (x as MoneyDto).currency === "string";
const texto = (m: MoneyDto) => importeVE(BigInt(m.minor), m.currency as "USD" | "VES" | "USDT");
const sinAcentos = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const cifras = (s: string) => s.replace(/\D/g, "");

/** Lo que un asiento dice de sí, en corto: las pulseras, la mesa, el paquete, la persona, el motivo. */
function detalleDe(d: Record<string, unknown>): string {
  const partes: string[] = [];
  if (Array.isArray(d.pulseras) && d.pulseras.length > 0) partes.push(`Pulseras ${d.pulseras.join(", ")}`);
  if (typeof d.ninos === "number") partes.push(`${d.ninos} ${d.ninos === 1 ? "niño" : "niños"}`);
  if (typeof d.mesa === "string") partes.push(d.mesa === "Caja" ? "Caja" : `Mesa ${d.mesa}`);
  if (typeof d.paquete === "string") partes.push(`${d.paquete}${typeof d.minutos === "number" ? ` (${d.minutos} min)` : ""}`);
  if (typeof d.persona === "string") partes.push(d.persona);
  if (typeof d.punto === "string") partes.push(d.punto);
  if (typeof d.tipo === "string") partes.push(d.tipo.toLowerCase());
  if (typeof d.motivo === "string") partes.push(d.motivo.toLowerCase().replaceAll("_", " "));
  if (typeof d.detalle === "string") partes.push(d.detalle);
  if (Array.isArray(d.lineas)) {
    const ls = d.lineas as { nombre?: string; producto?: string; cantidad?: number; unidades?: number }[];
    partes.push(ls.map((l) => `${l.cantidad ?? l.unidades ?? 1} × ${l.nombre ?? l.producto ?? "?"}`).join(", "));
  } else if (typeof d.lineas === "number") partes.push(`${d.lineas} ${d.lineas === 1 ? "línea" : "líneas"}`);
  if (esDinero(d.excedente) && BigInt(d.excedente.minor) > 0n) partes.push(`tiempo de más ${texto(d.excedente)}`);
  if (typeof d.cargadoAMesa === "string") partes.push(`a la mesa ${d.cargadoAMesa}`);
  if (d.recogidoPorOtraPersona === true) partes.push("lo recogió otra persona");
  if (typeof d.firma === "string") partes.push(`firmó ${d.firma.toLowerCase()}`);
  if (esDinero(d.diferencia)) partes.push(`diferencia ${texto(d.diferencia)}`);
  return partes.join(" · ");
}

/** Cómo se llama cada dato de un asiento en el detalle. Lo que no está aquí (claves, versiones, estados internos) no sale. */
const CAMPOS: Readonly<Record<string, string>> = {
  orderNumber: "Orden",
  orden: "Orden",
  total: "Total",
  precio: "Precio",
  monto: "Monto",
  igtf: "IGTF",
  pulseras: "Pulseras",
  ninos: "Niños",
  modo: "Modo",
  paquete: "Paquete",
  minutos: "Minutos",
  excedente: "Tiempo de más",
  cargadoAMesa: "A la mesa",
  recogidoPorOtraPersona: "Lo recogió otra persona",
  mesa: "Mesa",
  nombreCuenta: "Cuenta",
  comanda: "Comanda",
  lineas: "Líneas",
  pagadas: "Líneas cobradas",
  anuladas: "Anuladas",
  regaladas: "Regaladas",
  alEstante: "Al estante",
  persona: "Persona",
  punto: "Punto de cobro",
  businessDate: "Día",
  firma: "Firmó",
  cierre: "Cierre",
  diferencia: "Diferencia del arqueo",
  tipo: "Tipo",
  motivo: "Motivo",
  detalle: "Detalle",
  proveedor: "Proveedor",
  factura: "Factura",
  retiro: "Retiro del catálogo",
  kind: "Clase de cuenta",
};

/** Los datos del asiento, campo por campo, para el detalle: los que tienen nombre, legibles. */
function datosDe(d: Record<string, unknown>): { campo: string; valor: string }[] {
  const r: { campo: string; valor: string }[] = [];
  for (const [k, v] of Object.entries(d)) {
    const campo = CAMPOS[k];
    if (!campo || v === null || v === undefined) continue;
    const valor = esDinero(v)
      ? texto(v)
      : typeof v === "boolean"
        ? v
          ? "Sí"
          : "No"
        : typeof v === "string" || typeof v === "number"
          ? String(v)
          : Array.isArray(v) && v.every((x) => typeof x === "string")
            ? v.join(", ")
            : Array.isArray(v)
              ? String(v.length)
              : null;
    if (valor !== null && valor !== "") r.push({ campo, valor });
  }
  return r;
}

export interface CasosActividad {
  /** Todo lo que pasó en un periodo (`ConsultaDeActividadSchema`), con su búsqueda; los más nuevos primero. */
  actividad(ctx: Contexto, entrada: unknown, ahora?: number): Promise<Resultado<ActividadDelPeriodoDto>>;
  /** Una venta entera, para el detalle de un movimiento: sus líneas, sus pagos, la tasa y quién cobró. */
  venta(ctx: Contexto, entrada: unknown): Promise<Resultado<VentaCerradaDto>>;
}

export function casosActividad(base: Base, cifrador: Cifrador | null): CasosActividad {
  return {
    async actividad(ctx, entrada, ahora = Date.now()) {
      const v = ConsultaDeActividadSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: v.error.issues[0]?.message ?? "El informe no se pudo pedir: revisa el periodo.", problemas: problemasDe(v.error) };
      const q = v.data;
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<ActividadDelPeriodoDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const quien = await nombreDe(tx, ctx);
        const ajustes = await ajustesDe(tx, ctx.branchId);
        const inicio = new Date(startOfDay(q.desde, ajustes.zonaHoraria));
        const fin = new Date(startOfDay(addDays(q.hasta, 1), ajustes.zonaHoraria));
        const asientos = await tx.auditEntry.findMany({
          where: { branchId: ctx.branchId, occurredAt: { gte: inicio, lt: fin }, outcome: "HECHO", action: { in: Object.keys(ACCIONES) } },
          select: { id: true, occurredAt: true, action: true, actorId: true, deviceId: true, authorizedBy: true, reason: true, entityType: true, entityId: true, after: true },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        });

        // Las personas (quién y quién autorizó), los clientes de las cuentas y las ventas de cada movimiento.
        const personas = new Map(
          (
            await tx.staffUser.findMany({
              where: { id: { in: [...new Set(asientos.flatMap((a) => [a.actorId, a.authorizedBy].filter((x): x is string => x !== null)))] } },
              select: { id: true, fullName: true, supportLogin: true },
            })
          ).map((u) => [u.id, u.supportLogin ? `${u.fullName} (soporte)` : u.fullName]),
        );
        const equipos = new Map((await tx.device.findMany({ where: { id: { in: [...new Set(asientos.flatMap((a) => (a.deviceId ? [a.deviceId] : [])))] } }, select: { id: true, label: true } })).map((d) => [d.id, d.label]));
        const despues = (a: (typeof asientos)[number]) => (a.after && typeof a.after === "object" && !Array.isArray(a.after) ? (a.after as Record<string, unknown>) : {});
        const cuentaDe = (a: (typeof asientos)[number]): string | null => {
          if (a.entityType === "account" && a.entityId) return a.entityId;
          const c = despues(a).cuenta;
          return c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string" ? (c as { id: string }).id : null;
        };
        const cuentas = [...new Set(asientos.map(cuentaDe).filter((x): x is string => x !== null))];
        const clientes = new Map<string, { nombre: string; cedula: string }>();
        for (const c of await tx.accountCustomer.findMany({ where: { accountId: { in: cuentas } }, orderBy: { setAt: "asc" }, select: { accountId: true, fullName: true, document: true } })) {
          clientes.set(c.accountId, { nombre: c.fullName, cedula: c.document });
        }
        // La cuenta de una familia es de su representante: el de sus estancias en el parque.
        const sinCliente = cuentas.filter((c) => !clientes.has(c));
        for (const s of await tx.parkSession.findMany({ where: { accountId: { in: sinCliente } }, select: { accountId: true, guardian: { select: { fullName: true, document: true } } } })) {
          if (!clientes.has(s.accountId)) clientes.set(s.accountId, { nombre: s.guardian.fullName, cedula: s.guardian.document ?? "" });
        }
        const claves = asientos.flatMap((a) => {
          const k = despues(a).operationKey;
          return a.action === "cuenta.cobrar" && typeof k === "string" ? [k] : [];
        });
        const porClave = new Map((await tx.sale.findMany({ where: { operationKey: { in: claves } }, select: { id: true, operationKey: true } })).map((s) => [s.operationKey, s.id]));
        const vales = new Map(
          (await tx.staffConsumption.findMany({ where: { id: { in: asientos.filter((a) => a.entityType === "staff_consumption" && a.entityId).map((a) => a.entityId!) } }, select: { id: true, saleId: true } })).map((c) => [c.id, c.saleId]),
        );
        const ventaDelAsiento = (a: (typeof asientos)[number]): string | null => {
          if (a.entityType === "sale" && a.entityId) return a.entityId;
          if (a.entityType === "staff_consumption" && a.entityId) return vales.get(a.entityId) ?? null;
          const k = despues(a).operationKey;
          return a.action === "cuenta.cobrar" && typeof k === "string" ? (porClave.get(k) ?? null) : null;
        };

        // La cuenta de una familia la abre su entrada al parque, que ya es su movimiento.
        const todos: MovimientoDelLocalDto[] = asientos.filter((a) => !(a.action === "cuenta.abrir" && despues(a).kind !== "MESA" && despues(a).kind !== "MOSTRADOR")).map((a) => {
          const d = despues(a);
          const clase = claseDe(a.action, d);
          const cuenta = d.cuenta;
          const orden =
            typeof d.orderNumber === "number" ? d.orderNumber : typeof d.orden === "number" ? d.orden : typeof cuenta === "number" ? cuenta : cuenta && typeof (cuenta as { orden?: unknown }).orden === "number" ? (cuenta as { orden: number }).orden : null;
          const monto = esDinero(d.total) ? d.total : esDinero(d.precio) ? d.precio : esDinero(d.monto) ? d.monto : null;
          const id = cuentaDe(a);
          return {
            id: a.id,
            en: a.occurredAt.toISOString(),
            categoria: clase.categoria,
            accion: a.action,
            que: clase.que,
            quien: a.actorId ? (personas.get(a.actorId) ?? "Alguien") : "El sistema",
            orden,
            monto,
            cliente: id ? (clientes.get(id) ?? null) : null,
            // Entrar y salir dicen en qué equipo.
            detalle: a.action.startsWith("sesion.") && a.deviceId ? `en ${equipos.get(a.deviceId) ?? "un equipo"}` : detalleDe(d),
            autorizo: a.authorizedBy && a.authorizedBy !== a.actorId ? (personas.get(a.authorizedBy) ?? null) : null,
            motivo: a.reason,
            ventaId: ventaDelAsiento(a),
            datos: datosDe(d),
          };
        });

        // La búsqueda: cada palabra tiene que estar (en lo que se ve, el cliente, la cédula, el monto o la orden).
        const palabras = q.buscar ? sinAcentos(q.buscar).split(/\s+/).filter(Boolean) : [];
        /** El monto como se escribe al buscarlo: «$ 13.05», «13,05» o «13.05». */
        const comoSeBusca = (m: MoneyDto) => {
          const minor = BigInt(m.minor) < 0n ? -BigInt(m.minor) : BigInt(m.minor);
          const centimos = (minor % 100n).toString().padStart(2, "0");
          return `${texto(m)} ${minor / 100n},${centimos} ${minor / 100n}.${centimos}`;
        };
        const coincide = (m: MovimientoDelLocalDto) => {
          if (palabras.length === 0) return true;
          const t = sinAcentos(
            [m.que, m.quien, m.detalle, m.cliente?.nombre ?? "", m.cliente ? cifras(m.cliente.cedula) : "", m.orden !== null ? `#${String(m.orden).padStart(4, "0")} ${m.orden}` : "", m.monto ? comoSeBusca(m.monto) : "", m.autorizo ?? "", m.motivo ?? "", ...m.datos.map((x) => x.valor)].join(" "),
          );
          // Una cédula o un teléfono se encuentra por sus cifras, con o sin puntos y guiones.
          return palabras.every((w) => t.includes(w) || (cifras(w).length >= 4 && cifras(t).includes(cifras(w))));
        };
        const encontrados = todos.filter(coincide);
        const filtrados = q.categoria ? encontrados.filter((m) => m.categoria === q.categoria) : encontrados;
        // Cuántos hay en cada parte, con la búsqueda pero sin la parte elegida: así se ve a dónde cambiar.
        const cuenta = new Map<CategoriaDeMovimientoDto, number>();
        for (const m of encontrados) cuenta.set(m.categoria, (cuenta.get(m.categoria) ?? 0) + 1);
        return ActividadDelPeriodoSchema.parse({
          encabezado: { local: ajustes.nombre, generadoEn: new Date(ahora).toISOString(), generadoPor: quien.nombre },
          periodo: { desde: q.desde, hasta: q.hasta },
          total: filtrados.length,
          porCategoria: (["CAJA", "PARQUE", "MESAS", "INVENTARIO", "PERSONAL"] as const).map((categoria) => ({ categoria, cantidad: cuenta.get(categoria) ?? 0 })),
          movimientos: filtrados.slice(0, MAXIMO),
        });
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },

    async venta(ctx, entrada) {
      const v = ConsultaDeVentaSchema.safeParse(entrada);
      if (!v.success) return { ok: false, motivo: "INVALIDO", mensaje: "Esa venta no se pudo pedir.", problemas: problemasDe(v.error) };
      const r = await base.conTenant(ctx.tenantId, async (tx): Promise<VentaCerradaDto | Rechazo> => {
        const p = await permisoEn(tx, ctx, "reportes.verSucursal");
        if (p === "DENEGADO") return rechazoDePermiso(p);
        const s = await tx.sale.findUnique({ where: { id: v.data.saleId }, include: CON_TODO });
        if (!s || s.branchId !== ctx.branchId) return { ok: false, motivo: "NO_DISPONIBLE", mensaje: "Esa venta no existe en esta sucursal." };
        return ventaDe(s, cifrador);
      });
      return "ok" in r ? r : { ok: true, valor: r };
    },
  };
}
