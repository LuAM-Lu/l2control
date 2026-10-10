/**
 * Los reportes — Etapa 11, F9 (M-29).
 *
 * Una sección de solo lectura para administración y supervisión (`reportes.verSucursal`). Todo sale de los asientos
 * (el libro de pagos, las ventas, los cortes Z), cuenta por día de negocio del local, y un día con su Z cerrado da
 * siempre lo mismo. Cada informe con su periodo y su vista de impresión A4, que el navegador guarda como PDF.
 *
 * El navegador dice qué periodo; el instante del informe, el local y quién lo pide los pone el servidor (ADR-017).
 */
import { z } from "zod";
import { ClienteDeCuentaSchema } from "./clientes.ts";
import { FechaSchema, IdSchema, MoneySchema, TimestampSchema } from "./primitives.ts";

/** Hasta cuántos días entra en un informe: un trimestre. Más, se parte. */
export const MAX_DIAS_DE_INFORME = 93;

const dias = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;

/** Un periodo de días de negocio, del primero al último incluidos. */
export const PeriodoDeInformeSchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type PeriodoDeInformeDto = z.infer<typeof PeriodoDeInformeSchema>;

/** Pedir el informe de ventas (B11-1): su periodo y, si se quiere, solo los turnos de una cajera. */
export const ConsultaDeVentasSchema = z
  .strictObject({ desde: FechaSchema, hasta: FechaSchema, cajera: z.uuid("Cajera desconocida").optional() })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type ConsultaDeVentasDto = z.infer<typeof ConsultaDeVentasSchema>;

/** De qué es una venta: la cuenta en que se cobró (B11-1). */
export const OrigenDeVentaSchema = z.enum(["PARQUE", "RESTAURANTE", "MOSTRADOR", "CUMPLEANOS"]);
export type OrigenDeVenta = z.infer<typeof OrigenDeVentaSchema>;

/** Quién y cuándo pidió un informe, y de qué local: va en el encabezado de su PDF. */
export const EncabezadoDeInformeSchema = z.object({
  local: z.string(),
  generadoEn: TimestampSchema,
  generadoPor: z.string(),
});

/**
 * El informe de ventas de un periodo (B11-1, F9-01). Lo vendido sale de las ventas; lo cobrado, del libro de pagos,
 * cada medio en su moneda y llevado a dólares con la tasa con que se cobró cada asiento. Por turno, con su cuadre
 * contra el Z: un turno sellado que no da lo mismo que su Z se ve.
 */
export const InformeDeVentasSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  /** Si se pidió solo lo de una cajera. */
  cajera: z.object({ id: IdSchema, nombre: z.string() }).nullable(),
  resumen: z.object({
    /** Las ventas cobradas, sin las anuladas. */
    ventas: z.number().int().nonnegative(),
    /** Lo vendido (sin las anuladas), en dólares. */
    vendido: MoneySchema,
    igtf: MoneySchema,
    anuladas: z.number().int().nonnegative(),
    /** Lo que se anuló, en dólares. */
    anulado: MoneySchema,
    /** Lo que los clientes devolvieron en el periodo (B3-14): ya restado de lo vendido. */
    devoluciones: z.number().int().nonnegative().default(0),
    devuelto: MoneySchema.default({ minor: "0", currency: "USD" }),
    desdePapel: z.number().int().nonnegative(),
    turnos: z.number().int().nonnegative(),
    /** Turnos del periodo que todavía no tienen su Z: sus cifras pueden cambiar. */
    turnosSinZ: z.number().int().nonnegative(),
    /** Lo cobrado por todos los medios, en dólares con la tasa de cada cobro; `null` si algo en bolívares no tiene tasa. */
    cobradoEnDolares: MoneySchema.nullable(),
  }),
  porMedio: z.array(
    z.object({
      medio: z.string(),
      nombre: z.string(),
      moneda: z.enum(["USD", "VES", "USDT"]),
      cobrado: MoneySchema,
      vuelto: MoneySchema,
      neto: MoneySchema,
      /** Lo neto en dólares, con la tasa con que se cobró cada asiento; `null` si alguno no tiene tasa. */
      enDolares: MoneySchema.nullable(),
    }),
  ),
  porOrigen: z.array(z.object({ origen: OrigenDeVentaSchema, ventas: z.number().int().nonnegative(), vendido: MoneySchema })),
  porCajera: z.array(z.object({ cajera: z.string(), ventas: z.number().int().nonnegative(), vendido: MoneySchema, anuladas: z.number().int().nonnegative() })),
  porTurno: z.array(
    z.object({
      id: IdSchema,
      dia: FechaSchema,
      punto: z.string(),
      abrio: z.string(),
      abierto: TimestampSchema,
      cerrado: TimestampSchema.nullable(),
      estado: z.enum(["ABIERTO", "EN_CIERRE", "CERRADO_Z"]),
      ventas: z.number().int().nonnegative(),
      anuladas: z.number().int().nonnegative(),
      vendido: MoneySchema,
      /** Con su Z: si da lo mismo que el Z y, si no, qué no cuadra. Sin Z, `SIN_Z`. */
      cuadre: z.object({ estado: z.enum(["CUADRA", "NO_CUADRA", "SIN_Z"]), diferencias: z.array(z.string()) }),
      /** Abierto fuera del punto de cobro (B3-9, M-31): quién lo autorizó y por qué. */
      fueraDelPunto: z.object({ autorizadoPor: z.string(), motivo: z.string() }).nullable().default(null),
    }),
  ),
  anuladas: z.array(
    z.object({
      orden: z.number().int().positive(),
      cobradaEn: TimestampSchema,
      anuladaEn: TimestampSchema,
      cajera: z.string(),
      total: MoneySchema,
      motivo: z.string(),
      autorizadoPor: z.string(),
    }),
  ),
  /** Las cajeras que abrieron turno en el periodo, para el filtro. */
  cajeras: z.array(z.object({ id: IdSchema, nombre: z.string() })),
  /** Las deudas de clientes del periodo (B11-4): lo que quedó en deuda, lo recuperado y lo perdido. El detalle, en su informe. */
  deudas: z.lazy(() => ResumenDeDeudasSchema).optional(),
});
export type InformeDeVentasDto = z.infer<typeof InformeDeVentasSchema>;

/* ─────────────────────────────────────────────── deudas de clientes (B11-4, M-33) */

/** Cuántas y por cuánto. */
const CuantoSchema = z.object({ cantidad: z.number().int().nonnegative(), monto: MoneySchema });

/**
 * Las deudas de un periodo en cuatro cifras: las que quedaron (se marcaron en el periodo), lo recuperado y lo perdido
 * en el periodo (por el día en que se cobraron o se dieron por perdidas) y lo que seguía pendiente al terminar.
 */
export const ResumenDeDeudasSchema = z.object({
  quedaron: CuantoSchema,
  recuperado: CuantoSchema,
  perdido: CuantoSchema,
  pendienteAlTerminar: CuantoSchema,
});
export type ResumenDeDeudasDto = z.infer<typeof ResumenDeDeudasSchema>;

/** Pedir el informe de deudas: su periodo. */
export const ConsultaDeDeudasSchema = PeriodoDeInformeSchema;

/** Un paso en la historia de una deuda, de la mesa al desenlace. */
export const PasoDeDeudaSchema = z.object({
  en: TimestampSchema,
  que: z.enum(["SENTADO", "VENTA", "PEDIDO", "SERVIDO", "SE_FUE", "EN_COBRO", "DEVUELTA", "COBRADA", "PERDIDA"]),
  quien: z.string(),
  detalle: z.string(),
  /** Cuánto: lo que valía un pedido o la venta del mostrador, y lo cobrado al saldarla. */
  monto: MoneySchema.optional(),
  /** Con qué se cobró, medio a medio (solo al cobrarla). */
  medios: z.array(z.object({ nombre: z.string(), monto: MoneySchema })).optional(),
});
export type PasoDeDeudaDto = z.infer<typeof PasoDeDeudaSchema>;

/**
 * El informe de las deudas de clientes (B11-4): su resumen; por mesero (al que sentó al cliente: en el mostrador, la
 * cajera que la dejó pendiente) y por quien autorizó; y cada deuda que se marcó o terminó en el periodo, con su historia.
 * El cliente con su cédula y su teléfono completos (M-33, decisión del usuario), también en el PDF.
 */
export const InformeDeDeudasSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  resumen: ResumenDeDeudasSchema,
  porMesero: z.array(
    z.object({
      nombre: z.string(),
      deudas: z.number().int().nonnegative(),
      monto: MoneySchema,
      cobradas: z.number().int().nonnegative(),
      perdidas: z.number().int().nonnegative(),
      pendientes: z.number().int().nonnegative(),
    }),
  ),
  porAutorizador: z.array(
    z.object({
      nombre: z.string(),
      /** Las que autorizó dejar en deuda en el periodo, y por cuánto. */
      marcadas: z.number().int().nonnegative(),
      monto: MoneySchema,
      /** Las que dio por perdidas en el periodo. */
      perdidas: z.number().int().nonnegative(),
    }),
  ),
  deudas: z.array(
    z.object({
      id: IdSchema,
      orden: z.number().int().positive(),
      lugar: z.string(),
      cliente: ClienteDeCuentaSchema,
      monto: MoneySchema,
      estado: z.enum(["PENDIENTE", "COBRADA", "PERDIDA"]),
      /** Una pendiente: los días que lleva desde que se fue (0, desde hoy), al pedir el informe. */
      diasPendiente: z.number().int().nonnegative().optional(),
      sentadoPor: z.string(),
      historia: z.array(PasoDeDeudaSchema),
    }),
  ),
});
export type InformeDeDeudasDto = z.infer<typeof InformeDeDeudasSchema>;

/**
 * Pedir el kárdex (B11-3): su periodo y un producto o una categoría (si vienen los dos, manda el producto). Sin ninguno,
 * el informe trae solo lo que se puede elegir.
 */
export const ConsultaDeMovimientosSchema = z
  .strictObject({
    desde: FechaSchema,
    hasta: FechaSchema,
    producto: z.uuid("Producto desconocido").optional(),
    categoria: z.string().trim().min(1).max(60).optional(),
  })
  .refine((p) => p.desde <= p.hasta, { message: "El periodo termina antes de empezar", path: ["hasta"] })
  .refine((p) => dias(p.desde, p.hasta) <= MAX_DIAS_DE_INFORME, { message: `Hasta ${MAX_DIAS_DE_INFORME} días: parte el periodo`, path: ["desde"] });
export type ConsultaDeMovimientosDto = z.infer<typeof ConsultaDeMovimientosSchema>;

/** Qué movió la existencia: lo mismo que `stock_movement.kind`, más lo que se contó o arrancó sin mover nada. */
export const TipoDeMovimientoSchema = z.enum(["VENTA", "DEVOLUCION", "ENTRADA", "SALIDA", "AJUSTE", "CONTEO", "INICIAL", "ANULACION", "RETORNO"]);
export type TipoDeMovimiento = z.infer<typeof TipoDeMovimientoSchema>;

/**
 * El kárdex de un periodo (B11-3): por producto, el saldo al empezar, cada movimiento con su fecha, quién, el motivo y
 * el saldo que dejó, y el saldo al terminar. Un conteo que cuadró y un inventario inicial en cero salen con cantidad 0.
 * `existencia` es la de ahora: si el periodo llega a hoy, es el saldo final.
 */
export const InformeDeMovimientosSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  filtro: z.object({ producto: z.string().nullable(), categoria: z.string().nullable() }),
  productos: z.array(
    z.object({
      id: IdSchema,
      nombre: z.string(),
      sku: z.string(),
      categoria: z.string(),
      inicial: z.number().int(),
      entradas: z.number().int().nonnegative(),
      salidas: z.number().int().nonnegative(),
      final: z.number().int(),
      existencia: z.number().int(),
      movimientos: z.array(
        z.object({
          en: TimestampSchema,
          tipo: TipoDeMovimientoSchema,
          /** De dónde vino o el motivo: «Compra · Distribuidora X · factura 123», «Merma · vencido», «Venta · Mesa 3». */
          detalle: z.string(),
          quien: z.string(),
          /** Quien autorizó una salida o un conteo. */
          autorizo: z.string().nullable(),
          cantidad: z.number().int(),
          saldo: z.number().int(),
        }),
      ),
    }),
  ),
  /** Lo que se puede elegir: los productos que se cuentan y sus categorías. */
  opciones: z.object({
    productos: z.array(z.object({ id: IdSchema, nombre: z.string(), sku: z.string(), categoria: z.string() })),
    categorias: z.array(z.string()),
  }),
});
export type InformeDeMovimientosDto = z.infer<typeof InformeDeMovimientosSchema>;

/** El estado de un producto que se cuenta (B9-5, B9-7): lo mismo que dice Inventario → Productos. */
export const EstadoDeExistenciaSchema = z.enum(["SIN_INICIAL", "AGOTADO", "BAJO_MINIMO", "BIEN"]);

/**
 * El inventario al momento (B11-2): a la hora en que se pide, cada producto que se cuenta con su existencia, su costo
 * promedio y su valor al costo, por categoría, con lo agotado, lo bajo mínimo y lo sin contar. El valor es la suma de
 * los movimientos al costo (B9-3): el mismo que da el costo promedio de Productos.
 */
export const InformeDeInventarioSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  resumen: z.object({
    productos: z.number().int().nonnegative(),
    unidades: z.number().int(),
    valor: MoneySchema,
    agotados: z.number().int().nonnegative(),
    bajoMinimo: z.number().int().nonnegative(),
    sinInicial: z.number().int().nonnegative(),
  }),
  categorias: z.array(z.object({ categoria: z.string(), productos: z.number().int().nonnegative(), unidades: z.number().int(), valor: MoneySchema })),
  productos: z.array(
    z.object({
      id: IdSchema,
      nombre: z.string(),
      sku: z.string(),
      presentacion: z.string().nullable(),
      categoria: z.string(),
      existencia: z.number().int(),
      minimo: z.number().int().nullable(),
      /** El costo promedio de una unidad; `null` sin existencia. */
      costoPromedio: MoneySchema.nullable(),
      valor: MoneySchema,
      estado: EstadoDeExistenciaSchema,
      /** Retirado de la venta, pero con existencia: sigue contando en el valor. */
      retirado: z.boolean(),
    }),
  ),
});
export type InformeDeInventarioDto = z.infer<typeof InformeDeInventarioSchema>;

/** Pedir el informe del parque (B11-6): su periodo. */
export const ConsultaDelParqueSchema = PeriodoDeInformeSchema;

const ConCuanto = z.object({ cantidad: z.number().int().nonnegative(), monto: MoneySchema });

/** Una excepción del parque: cuándo, de quién (el niño o su pulsera) y qué pasó. */
export const ExcepcionDelParqueSchema = z.object({
  tipo: z.enum(["SIN_PULSERA", "A_REVISAR", "RECOGIDO_POR_OTRO", "MEDIAS"]),
  en: TimestampSchema,
  nino: z.string(),
  pulsera: z.string(),
  representante: z.string(),
  detalle: z.string(),
});
export type ExcepcionDelParqueDto = z.infer<typeof ExcepcionDelParqueSchema>;

/**
 * El informe del parque (B11-6, M-37): por días de negocio, de las estancias que empezaron en el periodo. Los niños por
 * día y por hora de entrada, con el aforo pico; el dinero del tiempo (paquetes, recargas y tiempo de más) donde terminó
 * cada línea (en la cuenta de la familia o en la de una mesa), sin lo anulado y con lo regalado aparte; las estancias
 * (tiempo, pausas por comida, salidas antes de tiempo, cobradas por uso) y las excepciones.
 */
export const InformeDelParqueSchema = z.object({
  encabezado: EncabezadoDeInformeSchema,
  periodo: z.object({ desde: FechaSchema, hasta: FechaSchema }),
  resumen: z.object({
    ninos: z.number().int().nonnegative(),
    /** Los niños a la vez en la sala, el máximo del periodo, y cuándo (`null` sin estancias). */
    pico: z.object({ ninos: z.number().int().nonnegative(), en: TimestampSchema }).nullable(),
    aforo: z.number().int().positive(),
    /** El tiempo promedio de las que salieron, sin sus pausas por comida; `null` si ninguna salió. */
    minutosPromedio: z.number().int().nonnegative().nullable(),
    dinero: MoneySchema,
  }),
  porDia: z.array(
    z.object({ dia: FechaSchema, ninos: z.number().int().nonnegative(), pico: z.number().int().nonnegative(), paquetes: MoneySchema, recargas: MoneySchema, tiempoDeMas: MoneySchema, total: MoneySchema }),
  ),
  /** Los que entraron a cada hora del local (0 a 23), sumando los días del periodo. Solo las horas con alguno. */
  porHora: z.array(z.object({ hora: z.number().int().min(0).max(23), ninos: z.number().int().nonnegative() })),
  dinero: z.object({
    paquetes: ConCuanto,
    recargas: ConCuanto.extend({ minutos: z.number().int().nonnegative() }),
    tiempoDeMas: ConCuanto,
    /** De todo lo anterior, lo que terminó en la cuenta de una mesa (al vincular la pulsera). */
    enMesas: ConCuanto,
    /** Lo regalado (cortesía), que no suma. */
    regalado: ConCuanto,
    porPaquete: z.array(z.object({ paquete: z.string(), ninos: z.number().int().nonnegative(), monto: MoneySchema })),
  }),
  estancias: z.object({
    salieron: z.number().int().nonnegative(),
    enSala: z.number().int().nonnegative(),
    pausas: z.number().int().nonnegative(),
    minutosDePausaPromedio: z.number().int().nonnegative().nullable(),
    /** Salieron antes de cumplir su paquete. */
    antesDeTiempo: z.number().int().nonnegative(),
    /** Cobradas por lo que usaron (B4-6, B4-17): un paquete más barato o el tiempo abierto. */
    porUso: z.number().int().nonnegative(),
    invitadosDeCumpleanos: z.number().int().nonnegative(),
  }),
  excepciones: z.array(ExcepcionDelParqueSchema),
});
export type InformeDelParqueDto = z.infer<typeof InformeDelParqueSchema>;
